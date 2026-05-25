/**
 * Unit tests for src/middleware/authMiddleware.js
 *
 * Strategy: call the middleware directly with mock req/res/next objects —
 * no HTTP server needed.
 */

process.env.JWT_SECRET = 'test_secret';

const jwt = require('jsonwebtoken');
const authenticateToken = require('../src/middleware/authMiddleware');

const mockRes = () => {
    const res = {};
    res.status = jest.fn().mockReturnValue(res);
    res.json = jest.fn().mockReturnValue(res);
    return res;
};

describe('authenticateToken middleware', () => {
    test('returns 401 when no Authorization header is present', () => {
        const req = { headers: {} };
        const res = mockRes();
        const next = jest.fn();

        authenticateToken(req, res, next);

        expect(res.status).toHaveBeenCalledWith(401);
        expect(res.json).toHaveBeenCalledWith(
            expect.objectContaining({ message: expect.stringContaining('No Token') })
        );
        expect(next).not.toHaveBeenCalled();
    });

    test('returns 403 when token is invalid / tampered', () => {
        const req = { headers: { authorization: 'Bearer bad.token.here' } };
        const res = mockRes();
        const next = jest.fn();

        authenticateToken(req, res, next);

        expect(res.status).toHaveBeenCalledWith(403);
        expect(res.json).toHaveBeenCalledWith(
            expect.objectContaining({ message: 'Invalid Token' })
        );
        expect(next).not.toHaveBeenCalled();
    });

    test('returns 403 when token is signed with a different secret', () => {
        const token = jwt.sign({ id: 1, role_id: 2 }, 'wrong_secret');
        const req = { headers: { authorization: `Bearer ${token}` } };
        const res = mockRes();
        const next = jest.fn();

        authenticateToken(req, res, next);

        expect(res.status).toHaveBeenCalledWith(403);
        expect(next).not.toHaveBeenCalled();
    });

    test('calls next() and attaches user payload for a valid token', () => {
        const payload = { id: 42, role_id: 2 };
        const token = jwt.sign(payload, 'test_secret', { expiresIn: '1h' });
        const req = { headers: { authorization: `Bearer ${token}` } };
        const res = mockRes();
        const next = jest.fn();

        authenticateToken(req, res, next);

        expect(next).toHaveBeenCalled();
        expect(req.user).toMatchObject({ id: 42, role_id: 2 });
    });

    test('returns 403 for an expired token', () => {
        const token = jwt.sign({ id: 1, role_id: 1 }, 'test_secret', { expiresIn: '-1s' });
        const req = { headers: { authorization: `Bearer ${token}` } };
        const res = mockRes();
        const next = jest.fn();

        authenticateToken(req, res, next);

        expect(res.status).toHaveBeenCalledWith(403);
        expect(next).not.toHaveBeenCalled();
    });
});
