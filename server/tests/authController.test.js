/**
 * Unit tests for src/controllers/authController.js
 *
 * Strategy: mock the `pg` Pool so no real database is needed.
 * We intercept pool.query() calls and return controlled data.
 */

process.env.JWT_SECRET = 'test_secret';
process.env.DB_USER = 'x';
process.env.DB_HOST = 'x';
process.env.DB_NAME = 'x';
process.env.DB_PASSWORD = 'x';
process.env.DB_PORT = '5432';

// ── Mock pg ──────────────────────────────────────────────────────────────────
const mockQuery = jest.fn();
jest.mock('pg', () => ({
    Pool: jest.fn().mockImplementation(() => ({ query: mockQuery })),
}));

const { registerUser, loginUser } = require('../src/controllers/authController');

const mockRes = () => {
    const res = {};
    res.status = jest.fn().mockReturnValue(res);
    res.json = jest.fn().mockReturnValue(res);
    return res;
};

// ── registerUser ─────────────────────────────────────────────────────────────
describe('registerUser', () => {
    beforeEach(() => mockQuery.mockReset());

    test('returns 400 when email already exists', async () => {
        mockQuery.mockResolvedValueOnce({ rows: [{ id: 1 }] }); // user exists check

        const req = { body: { name: 'Alice', email: 'alice@test.com', password: 'pass123', role_id: 1 } };
        const res = mockRes();

        await registerUser(req, res);

        expect(res.status).toHaveBeenCalledWith(400);
        expect(res.json).toHaveBeenCalledWith(
            expect.objectContaining({ message: 'User already exists' })
        );
    });

    test('returns 201 and user data on successful registration', async () => {
        mockQuery
            .mockResolvedValueOnce({ rows: [] }) // no existing user
            .mockResolvedValueOnce({ rows: [{ id: 5, name: 'Bob', email: 'bob@test.com' }] }); // INSERT

        const req = { body: { name: 'Bob', email: 'bob@test.com', password: 'secret', role_id: 1 } };
        const res = mockRes();

        await registerUser(req, res);

        expect(res.status).toHaveBeenCalledWith(201);
        expect(res.json).toHaveBeenCalledWith(
            expect.objectContaining({
                message: 'User registered successfully',
                user: expect.objectContaining({ email: 'bob@test.com' }),
            })
        );
    });

    test('returns 500 on database error', async () => {
        mockQuery.mockRejectedValueOnce(new Error('DB down'));

        const req = { body: { name: 'X', email: 'x@x.com', password: 'pw', role_id: 1 } };
        const res = mockRes();

        await registerUser(req, res);

        expect(res.status).toHaveBeenCalledWith(500);
    });
});

// ── loginUser ─────────────────────────────────────────────────────────────────
describe('loginUser', () => {
    const bcrypt = require('bcrypt');

    beforeEach(() => mockQuery.mockReset());

    test('returns 400 when user is not found', async () => {
        mockQuery.mockResolvedValueOnce({ rows: [] });

        const req = { body: { email: 'nobody@test.com', password: 'pw' } };
        const res = mockRes();

        await loginUser(req, res);

        expect(res.status).toHaveBeenCalledWith(400);
        expect(res.json).toHaveBeenCalledWith(
            expect.objectContaining({ message: 'Invalid credentials' })
        );
    });

    test('returns 400 when password is wrong', async () => {
        const hash = await bcrypt.hash('correct_password', 10);
        mockQuery.mockResolvedValueOnce({
            rows: [{
                id: 1, name: 'Alice', email: 'alice@test.com',
                password_hash: hash, role_id: 1, department_id: null,
                can_create_workflows: false, can_manage_users: false,
                requires_workflow_approval: true,
            }],
        });

        const req = { body: { email: 'alice@test.com', password: 'wrong_password' } };
        const res = mockRes();

        await loginUser(req, res);

        expect(res.status).toHaveBeenCalledWith(400);
        expect(res.json).toHaveBeenCalledWith(
            expect.objectContaining({ message: 'Invalid credentials' })
        );
    });

    test('returns 200 with a JWT token on valid credentials', async () => {
        const hash = await bcrypt.hash('mypassword', 10);
        mockQuery
            .mockResolvedValueOnce({
                rows: [{
                    id: 7, name: 'Carol', email: 'carol@test.com',
                    password_hash: hash, role_id: 2, department_id: 3,
                    can_create_workflows: true, can_manage_users: false,
                    requires_workflow_approval: false,
                }],
            })
            .mockResolvedValueOnce({ rows: [] }); // audit log INSERT

        const req = { body: { email: 'carol@test.com', password: 'mypassword' } };
        const res = mockRes();

        await loginUser(req, res);

        expect(res.status).toHaveBeenCalledWith(200);
        const body = res.json.mock.calls[0][0];
        expect(body).toHaveProperty('token');
        expect(body.user).toMatchObject({ id: 7, email: 'carol@test.com', role_id: 2 });
    });

    test('super admin (role_id=3) always gets full permissions regardless of dynamic role flags', async () => {
        const hash = await bcrypt.hash('adminpass', 10);
        mockQuery
            .mockResolvedValueOnce({
                rows: [{
                    id: 99, name: 'Admin', email: 'admin@test.com',
                    password_hash: hash, role_id: 3, department_id: null,
                    can_create_workflows: false, can_manage_users: false,
                    requires_workflow_approval: true,
                }],
            })
            .mockResolvedValueOnce({ rows: [] }); // audit log

        const req = { body: { email: 'admin@test.com', password: 'adminpass' } };
        const res = mockRes();

        await loginUser(req, res);

        const body = res.json.mock.calls[0][0];
        expect(body.user.can_create_workflows).toBe(true);
        expect(body.user.can_manage_users).toBe(true);
        expect(body.user.requires_workflow_approval).toBe(false);
    });
});
