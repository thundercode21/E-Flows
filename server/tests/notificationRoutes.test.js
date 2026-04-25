/**
 * Integration tests for /api/notifications
 *
 * Covers: fetch notifications, unread count, mark-all-read, mark-one-read.
 */

process.env.JWT_SECRET = 'test_secret';
process.env.DB_USER = 'x';
process.env.DB_HOST = 'x';
process.env.DB_NAME = 'x';
process.env.DB_PASSWORD = 'x';
process.env.DB_PORT = '5432';

const mockQuery = jest.fn();
jest.mock('pg', () => ({
    Pool: jest.fn().mockImplementation(() => ({ query: mockQuery })),
}));

const request = require('supertest');
const jwt = require('jsonwebtoken');
const express = require('express');

const app = express();
app.use(express.json());
app.use('/api/notifications', require('../src/routes/notificationRoutes'));

const makeToken = (id = 1) =>
    jwt.sign({ id, role_id: 1 }, 'test_secret', { expiresIn: '1h' });

describe('GET /api/notifications', () => {
    beforeEach(() => mockQuery.mockReset());

    test('returns 401 without a token', async () => {
        const res = await request(app).get('/api/notifications');
        expect(res.status).toBe(401);
    });

    test('returns 200 with a list of notifications', async () => {
        mockQuery.mockResolvedValueOnce({
            rows: [
                { id: 1, title: 'Doc approved', body: 'Your doc was approved', type: 'success', is_read: false, document_id: 5, created_at: new Date() },
            ],
        });

        const res = await request(app)
            .get('/api/notifications')
            .set('Authorization', `Bearer ${makeToken()}`);

        expect(res.status).toBe(200);
        expect(Array.isArray(res.body)).toBe(true);
        expect(res.body[0]).toHaveProperty('title', 'Doc approved');
    });
});

describe('GET /api/notifications/unread-count', () => {
    beforeEach(() => mockQuery.mockReset());

    test('returns the unread count as a number', async () => {
        mockQuery.mockResolvedValueOnce({ rows: [{ count: '3' }] });

        const res = await request(app)
            .get('/api/notifications/unread-count')
            .set('Authorization', `Bearer ${makeToken()}`);

        expect(res.status).toBe(200);
        expect(res.body).toEqual({ count: 3 });
    });
});

describe('PATCH /api/notifications/mark-all-read', () => {
    beforeEach(() => mockQuery.mockReset());

    test('marks all notifications as read and returns 200', async () => {
        mockQuery.mockResolvedValueOnce({});

        const res = await request(app)
            .patch('/api/notifications/mark-all-read')
            .set('Authorization', `Bearer ${makeToken()}`);

        expect(res.status).toBe(200);
        expect(res.body.message).toMatch(/marked as read/i);
    });
});

describe('PATCH /api/notifications/:id/read', () => {
    beforeEach(() => mockQuery.mockReset());

    test('marks a single notification as read and returns 200', async () => {
        mockQuery.mockResolvedValueOnce({});

        const res = await request(app)
            .patch('/api/notifications/7/read')
            .set('Authorization', `Bearer ${makeToken()}`);

        expect(res.status).toBe(200);
        expect(res.body.message).toMatch(/marked as read/i);
    });
});
