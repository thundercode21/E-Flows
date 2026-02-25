/**
 * Integration tests for /api/admin
 *
 * Covers: stats, audit-logs, departments, roles (create + seal),
 * and the verifyAdmin middleware (access control).
 */

process.env.JWT_SECRET = 'test_secret';
process.env.DB_USER = 'x';
process.env.DB_HOST = 'x';
process.env.DB_NAME = 'x';
process.env.DB_PASSWORD = 'x';
process.env.DB_PORT = '5432';
process.env.SMTP_HOST = 'localhost';
process.env.SMTP_PORT = '587';
process.env.SMTP_USER = 'u';
process.env.SMTP_PASS = 'p';
process.env.FROM_EMAIL = 'noreply@test.com';

const mockQuery = jest.fn();
jest.mock('pg', () => ({
    Pool: jest.fn().mockImplementation(() => ({ query: mockQuery })),
}));

jest.mock('node-cron', () => ({ schedule: jest.fn() }));

jest.mock('nodemailer', () => ({
    createTransport: jest.fn().mockReturnValue({
        verify: jest.fn((cb) => cb(null, true)),
        sendMail: jest.fn().mockResolvedValue({ messageId: 'mock' }),
    }),
}));

// graphHelpers is required by adminRoutes
jest.mock('../src/utils/graphHelpers', () => ({
    detectCircularSupervisor: jest.fn().mockResolvedValue({ isCycle: false, chain: [] }),
}));

const request = require('supertest');
const jwt = require('jsonwebtoken');
const express = require('express');

const app = express();
app.use(express.json());
app.use('/api/admin', require('../src/routes/adminRoutes'));

const makeToken = (role_id = 3) =>
    jwt.sign({ id: 1, role_id }, 'test_secret', { expiresIn: '1h' });

// ── Access control ────────────────────────────────────────────────────────────
describe('verifyAdmin middleware', () => {
    beforeEach(() => mockQuery.mockReset());

    test('returns 401 for unauthenticated requests', async () => {
        const res = await request(app).get('/api/admin/stats');
        expect(res.status).toBe(401);
    });

    test('returns 403 for a regular user (role_id=1) with no admin permission', async () => {
        // verifyAdmin checks dynamic_roles for can_manage_users
        mockQuery.mockResolvedValueOnce({ rows: [] }); // no matching dynamic role

        const res = await request(app)
            .get('/api/admin/stats')
            .set('Authorization', `Bearer ${makeToken(1)}`);

        expect(res.status).toBe(403);
    });

    test('allows super admin (role_id=3) through without a DB check', async () => {
        // Stats queries
        mockQuery
            .mockResolvedValueOnce({ rows: [{ count: '10' }] })
            .mockResolvedValueOnce({ rows: [{ count: '5' }] })
            .mockResolvedValueOnce({ rows: [{ count: '3' }] })
            .mockResolvedValueOnce({ rows: [{ count: '2' }] })
            .mockResolvedValueOnce({ rows: [{ count: '8' }] })
            .mockResolvedValueOnce({ rows: [{ count: '4' }] });

        const res = await request(app)
            .get('/api/admin/stats')
            .set('Authorization', `Bearer ${makeToken(3)}`);

        expect(res.status).toBe(200);
    });
});

// ── GET /api/admin/stats ──────────────────────────────────────────────────────
describe('GET /api/admin/stats', () => {
    beforeEach(() => mockQuery.mockReset());

    test('returns document and user counts', async () => {
        mockQuery
            .mockResolvedValueOnce({ rows: [{ count: '20' }] }) // total docs
            .mockResolvedValueOnce({ rows: [{ count: '10' }] }) // approved
            .mockResolvedValueOnce({ rows: [{ count: '7' }] })  // pending
            .mockResolvedValueOnce({ rows: [{ count: '3' }] })  // rejected
            .mockResolvedValueOnce({ rows: [{ count: '15' }] }) // users
            .mockResolvedValueOnce({ rows: [{ count: '5' }] }); // workflows

        const res = await request(app)
            .get('/api/admin/stats')
            .set('Authorization', `Bearer ${makeToken(3)}`);

        expect(res.status).toBe(200);
        expect(res.body.documents).toMatchObject({ total: 20, approved: 10, pending: 7, rejected: 3 });
        expect(res.body.users).toBe(15);
        expect(res.body.workflows).toBe(5);
    });
});

// ── GET /api/admin/audit-logs ─────────────────────────────────────────────────
describe('GET /api/admin/audit-logs', () => {
    beforeEach(() => mockQuery.mockReset());

    test('returns an array of audit log entries', async () => {
        mockQuery.mockResolvedValueOnce({
            rows: [
                { id: 1, action: 'User logged in', timestamp: new Date(), user_name: 'Alice', document_title: null, role_name: null },
            ],
        });

        const res = await request(app)
            .get('/api/admin/audit-logs')
            .set('Authorization', `Bearer ${makeToken(3)}`);

        expect(res.status).toBe(200);
        expect(Array.isArray(res.body)).toBe(true);
        expect(res.body[0]).toHaveProperty('action', 'User logged in');
    });
});

// ── POST /api/admin/departments ───────────────────────────────────────────────
describe('POST /api/admin/departments', () => {
    beforeEach(() => mockQuery.mockReset());

    test('creates a department and returns 201', async () => {
        mockQuery
            .mockResolvedValueOnce({ rows: [{ id: 3, name: 'Finance' }] }) // INSERT
            .mockResolvedValueOnce({}); // audit log

        const res = await request(app)
            .post('/api/admin/departments')
            .set('Authorization', `Bearer ${makeToken(3)}`)
            .send({ name: 'Finance' });

        expect(res.status).toBe(201);
        expect(res.body).toMatchObject({ id: 3, name: 'Finance' });
    });
});

// ── POST /api/admin/roles ─────────────────────────────────────────────────────
describe('POST /api/admin/roles', () => {
    beforeEach(() => mockQuery.mockReset());

    test('creates a dynamic role and returns 201', async () => {
        mockQuery
            .mockResolvedValueOnce({
                rows: [{ id: 10, name: 'Reviewer', can_create_workflows: false, can_manage_users: false }],
            }) // INSERT
            .mockResolvedValueOnce({}); // audit log

        const res = await request(app)
            .post('/api/admin/roles')
            .set('Authorization', `Bearer ${makeToken(3)}`)
            .send({ name: 'Reviewer', can_approve: true });

        expect(res.status).toBe(201);
        expect(res.body).toMatchObject({ id: 10, name: 'Reviewer' });
    });
});

// ── DELETE /api/admin/roles/:id (seal) ────────────────────────────────────────
describe('DELETE /api/admin/roles/:id', () => {
    beforeEach(() => mockQuery.mockReset());

    test('returns 400 when in-flight documents exist for the role', async () => {
        mockQuery.mockResolvedValueOnce({ rows: [{ count: '2' }] }); // in-flight check

        const res = await request(app)
            .delete('/api/admin/roles/5')
            .set('Authorization', `Bearer ${makeToken(3)}`);

        expect(res.status).toBe(400);
        expect(res.body.message).toMatch(/in-flight/i);
    });

    test('seals a role and returns 200 when no in-flight documents', async () => {
        mockQuery
            .mockResolvedValueOnce({ rows: [{ count: '0' }] }) // in-flight check
            .mockResolvedValueOnce({}) // BEGIN
            .mockResolvedValueOnce({}) // UPDATE dynamic_roles
            .mockResolvedValueOnce({}) // audit log
            .mockResolvedValueOnce({}); // COMMIT

        const res = await request(app)
            .delete('/api/admin/roles/5')
            .set('Authorization', `Bearer ${makeToken(3)}`);

        expect(res.status).toBe(200);
        expect(res.body.message).toMatch(/sealed/i);
    });
});
