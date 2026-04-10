/**
 * Integration tests for /api/workflows
 *
 * Strategy: spin up the Express app with a mocked pg Pool so no real
 * database is needed. Use Supertest to fire HTTP requests.
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

// ── Mock pg ──────────────────────────────────────────────────────────────────
const mockQuery = jest.fn();
jest.mock('pg', () => ({
    Pool: jest.fn().mockImplementation(() => ({ query: mockQuery })),
}));

// ── Mock node-cron so the SLA monitor doesn't start ─────────────────────────
jest.mock('node-cron', () => ({ schedule: jest.fn() }));

// ── Mock nodemailer so no real SMTP connection is attempted ──────────────────
jest.mock('nodemailer', () => ({
    createTransport: jest.fn().mockReturnValue({
        verify: jest.fn((cb) => cb(null, true)),
        sendMail: jest.fn().mockResolvedValue({ messageId: 'mock' }),
    }),
}));

const request = require('supertest');
const jwt = require('jsonwebtoken');
const express = require('express');

// Build a minimal app that only mounts the workflow router
const app = express();
app.use(express.json());
app.use('/api/workflows', require('../src/routes/workflowRoutes'));

// Helper: generate a valid JWT for tests
const makeToken = (payload = { id: 1, role_id: 3 }) =>
    jwt.sign(payload, 'test_secret', { expiresIn: '1h' });

// ── GET /api/workflows ────────────────────────────────────────────────────────
describe('GET /api/workflows', () => {
    beforeEach(() => mockQuery.mockReset());

    test('returns 401 without a token', async () => {
        const res = await request(app).get('/api/workflows');
        expect(res.status).toBe(401);
    });

    test('returns 200 with an array of workflows', async () => {
        mockQuery.mockResolvedValueOnce({
            rows: [
                { id: 1, name: 'Onboarding', flow_structure: '{}' },
                { id: 2, name: 'Leave Request', flow_structure: '{}' },
            ],
        });

        const res = await request(app)
            .get('/api/workflows')
            .set('Authorization', `Bearer ${makeToken()}`);

        expect(res.status).toBe(200);
        expect(Array.isArray(res.body)).toBe(true);
        expect(res.body).toHaveLength(2);
    });
});

// ── POST /api/workflows ───────────────────────────────────────────────────────
describe('POST /api/workflows', () => {
    beforeEach(() => mockQuery.mockReset());

    test('returns 400 when workflow name is missing', async () => {
        const res = await request(app)
            .post('/api/workflows')
            .set('Authorization', `Bearer ${makeToken()}`)
            .send({ flow_structure: '{}' });

        expect(res.status).toBe(400);
        expect(res.body.message).toMatch(/name is required/i);
    });

    test('creates a workflow and returns 201', async () => {
        // BEGIN, INSERT, audit INSERT, COMMIT
        mockQuery
            .mockResolvedValueOnce({}) // BEGIN
            .mockResolvedValueOnce({ rows: [{ id: 10, name: 'New WF', flow_structure: '{}' }] }) // INSERT
            .mockResolvedValueOnce({}) // audit log
            .mockResolvedValueOnce({}); // COMMIT

        const res = await request(app)
            .post('/api/workflows')
            .set('Authorization', `Bearer ${makeToken()}`)
            .send({ name: 'New WF', flow_structure: '{}' });

        expect(res.status).toBe(201);
        expect(res.body).toMatchObject({ id: 10, name: 'New WF' });
    });
});

// ── PUT /api/workflows/:id ────────────────────────────────────────────────────
describe('PUT /api/workflows/:id', () => {
    beforeEach(() => mockQuery.mockReset());

    test('returns 400 when name is missing', async () => {
        const res = await request(app)
            .put('/api/workflows/1')
            .set('Authorization', `Bearer ${makeToken()}`)
            .send({ flow_structure: '{}' });

        expect(res.status).toBe(400);
    });

    test('updates a workflow and returns 200', async () => {
        mockQuery
            .mockResolvedValueOnce({}) // BEGIN
            .mockResolvedValueOnce({}) // UPDATE
            .mockResolvedValueOnce({}) // audit log
            .mockResolvedValueOnce({}); // COMMIT

        const res = await request(app)
            .put('/api/workflows/1')
            .set('Authorization', `Bearer ${makeToken()}`)
            .send({ name: 'Updated WF', flow_structure: '{}' });

        expect(res.status).toBe(200);
        expect(res.body.message).toMatch(/updated/i);
    });
});

// ── DELETE /api/workflows/:id ─────────────────────────────────────────────────
describe('DELETE /api/workflows/:id', () => {
    beforeEach(() => mockQuery.mockReset());

    test('returns 400 when active documents use the workflow', async () => {
        mockQuery
            .mockResolvedValueOnce({}) // BEGIN
            .mockResolvedValueOnce({ rows: [{ id: 5 }] }); // safety check — doc found

        const res = await request(app)
            .delete('/api/workflows/1')
            .set('Authorization', `Bearer ${makeToken()}`);

        expect(res.status).toBe(400);
        expect(res.body.message).toMatch(/cannot delete/i);
    });

    test('deletes a workflow and returns 200 when no active documents', async () => {
        mockQuery
            .mockResolvedValueOnce({}) // BEGIN
            .mockResolvedValueOnce({ rows: [] }) // safety check — no docs
            .mockResolvedValueOnce({ rows: [{ name: 'Old WF' }] }) // SELECT name
            .mockResolvedValueOnce({}) // DELETE
            .mockResolvedValueOnce({}) // audit log
            .mockResolvedValueOnce({}); // COMMIT

        const res = await request(app)
            .delete('/api/workflows/1')
            .set('Authorization', `Bearer ${makeToken()}`);

        expect(res.status).toBe(200);
        expect(res.body.message).toMatch(/deleted/i);
    });
});
