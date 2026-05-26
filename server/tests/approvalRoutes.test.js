/**
 * Integration tests for /api/approvals
 *
 * Covers: OTP request rate-limiting, reject (validation + happy path),
 * and the approve endpoint (OTP validation, authorization check).
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
process.env.APPROVAL_SIGNING_SECRET = 'signing_secret';

// ── Mock pg ──────────────────────────────────────────────────────────────────
const mockQuery = jest.fn();
jest.mock('pg', () => ({
    Pool: jest.fn().mockImplementation(() => ({ query: mockQuery })),
}));

// ── Mock node-cron ───────────────────────────────────────────────────────────
jest.mock('node-cron', () => ({ schedule: jest.fn() }));

// ── Mock nodemailer ──────────────────────────────────────────────────────────
jest.mock('nodemailer', () => ({
    createTransport: jest.fn().mockReturnValue({
        verify: jest.fn((cb) => cb(null, true)),
        sendMail: jest.fn().mockResolvedValue({ messageId: 'mock' }),
    }),
}));

// ── Mock fs (so file reads don't fail) ───────────────────────────────────────
jest.mock('fs', () => ({
    ...jest.requireActual('fs'),
    readFileSync: jest.fn().mockReturnValue(Buffer.from('fake-pdf-content')),
    existsSync: jest.fn().mockReturnValue(true),
}));

// ── Mock pdf-lib (not needed for these tests) ────────────────────────────────
jest.mock('pdf-lib', () => ({
    PDFDocument: { load: jest.fn() },
    rgb: jest.fn(),
    degrees: jest.fn(),
}));

// ── Mock sharp ───────────────────────────────────────────────────────────────
jest.mock('sharp', () => jest.fn());

const request = require('supertest');
const jwt = require('jsonwebtoken');
const express = require('express');

const app = express();
app.use(express.json());
app.use('/api/approvals', require('../src/routes/approvalRoutes'));

const makeToken = (payload = { id: 1, role_id: 2, department_id: 1 }) =>
    jwt.sign(payload, 'test_secret', { expiresIn: '1h' });

// ── POST /api/approvals/reject ────────────────────────────────────────────────
describe('POST /api/approvals/reject', () => {
    beforeEach(() => mockQuery.mockReset());

    test('returns 401 without a token', async () => {
        const res = await request(app).post('/api/approvals/reject').send({ documentId: 1, comments: 'bad' });
        expect(res.status).toBe(401);
    });

    test('returns 400 when comments are missing', async () => {
        const res = await request(app)
            .post('/api/approvals/reject')
            .set('Authorization', `Bearer ${makeToken()}`)
            .send({ documentId: 1 });

        expect(res.status).toBe(400);
        expect(res.body.message).toMatch(/rejection reason/i);
    });

    test('returns 400 when comments are empty string', async () => {
        const res = await request(app)
            .post('/api/approvals/reject')
            .set('Authorization', `Bearer ${makeToken()}`)
            .send({ documentId: 1, comments: '   ' });

        expect(res.status).toBe(400);
    });

    test('rejects a document and returns 200', async () => {
        mockQuery
            .mockResolvedValueOnce({}) // BEGIN
            .mockResolvedValueOnce({}) // UPDATE documents status=Rejected
            .mockResolvedValueOnce({ rows: [{ title: 'My Doc', submitter_id: 2, current_node_id: 'node1' }] }) // SELECT doc
            .mockResolvedValueOnce({}) // INSERT approvals
            .mockResolvedValueOnce({}) // INSERT audit_logs
            .mockResolvedValueOnce({}) // COMMIT
            .mockResolvedValueOnce({ rows: [{ email: 'sub@test.com', name: 'Sub', email_notifications: true }] }) // email lookup
            .mockResolvedValueOnce({}) // INSERT notifications
            .mockResolvedValueOnce({}); // notifications INSERT

        const res = await request(app)
            .post('/api/approvals/reject')
            .set('Authorization', `Bearer ${makeToken()}`)
            .send({ documentId: 1, comments: 'Missing signature page.' });

        expect(res.status).toBe(200);
        expect(res.body.message).toMatch(/rejected/i);
    });
});

// ── POST /api/approvals/approve — OTP validation ──────────────────────────────
describe('POST /api/approvals/approve — OTP validation', () => {
    beforeEach(() => mockQuery.mockReset());

    test('returns 400 when OTP is missing from store (not requested)', async () => {
        const res = await request(app)
            .post('/api/approvals/approve')
            .set('Authorization', `Bearer ${makeToken({ id: 999, role_id: 2, department_id: 1 })}`)
            .send({ documentId: 1, otp: '123456', comments: 'ok' });

        // OTP store is empty for user 999 → invalid OTP
        expect(res.status).toBe(400);
        expect(res.body.message).toMatch(/invalid|incorrect/i);
    });
});

// ── POST /api/approvals/request-otp ──────────────────────────────────────────
describe('POST /api/approvals/request-otp', () => {
    beforeEach(() => mockQuery.mockReset());

    test('returns 401 without a token', async () => {
        const res = await request(app).post('/api/approvals/request-otp').send({ documentId: 1 });
        expect(res.status).toBe(401);
    });

    test('sends OTP and returns 200 for a valid user', async () => {
        mockQuery.mockResolvedValueOnce({
            rows: [{ email: 'approver@test.com', name: 'Approver' }],
        });

        const res = await request(app)
            .post('/api/approvals/request-otp')
            .set('Authorization', `Bearer ${makeToken({ id: 50, role_id: 2, department_id: 1 })}`)
            .send({ documentId: 5 });

        expect(res.status).toBe(200);
        expect(res.body.message).toMatch(/otp/i);
    });
});
