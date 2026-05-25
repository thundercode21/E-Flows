const express = require('express');
const router = express.Router();
const { Pool } = require('pg');
const authenticateToken = require('../middleware/authMiddleware');

const pool = new Pool({
    user: process.env.DB_USER, host: process.env.DB_HOST, database: process.env.DB_NAME,
    password: process.env.DB_PASSWORD, port: process.env.DB_PORT,
});

// GET: Fetch all unread notifications for the logged-in user
router.get('/', authenticateToken, async (req, res) => {
    try {
        const result = await pool.query(
            `SELECT id, title, body, type, is_read, document_id, created_at
             FROM notifications
             WHERE user_id = $1
             ORDER BY created_at DESC
             LIMIT 50`,
            [req.user.id]
        );
        res.status(200).json(result.rows);
    } catch (err) {
        console.error('Error fetching notifications:', err);
        res.status(500).json({ message: 'Server error fetching notifications.' });
    }
});

// GET: Count of unread notifications (for badge)
router.get('/unread-count', authenticateToken, async (req, res) => {
    try {
        const result = await pool.query(
            'SELECT COUNT(*) FROM notifications WHERE user_id = $1 AND is_read = FALSE',
            [req.user.id]
        );
        res.status(200).json({ count: parseInt(result.rows[0].count, 10) });
    } catch (err) {
        res.status(500).json({ message: 'Server error fetching count.' });
    }
});

// PATCH: Mark all notifications as read
router.patch('/mark-all-read', authenticateToken, async (req, res) => {
    try {
        await pool.query(
            'UPDATE notifications SET is_read = TRUE WHERE user_id = $1',
            [req.user.id]
        );
        res.status(200).json({ message: 'All notifications marked as read.' });
    } catch (err) {
        res.status(500).json({ message: 'Server error.' });
    }
});

// PATCH: Mark a single notification as read
router.patch('/:id/read', authenticateToken, async (req, res) => {
    try {
        await pool.query(
            'UPDATE notifications SET is_read = TRUE WHERE id = $1 AND user_id = $2',
            [req.params.id, req.user.id]
        );
        res.status(200).json({ message: 'Notification marked as read.' });
    } catch (err) {
        res.status(500).json({ message: 'Server error.' });
    }
});

module.exports = router;
