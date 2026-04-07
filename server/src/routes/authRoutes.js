const express = require('express');
const router = express.Router();
const { registerUser, loginUser } = require('../controllers/authController');
const authenticateToken = require('../middleware/authMiddleware');
const { Pool } = require('pg');
const bcrypt = require('bcrypt');
const crypto = require('crypto');
const nodemailer = require('nodemailer');

const pool = new Pool({
    user: process.env.DB_USER, 
    host: process.env.DB_HOST, 
    database: process.env.DB_NAME, 
    password: process.env.DB_PASSWORD, 
    port: process.env.DB_PORT,
});

// Shared mailer (reuses same SMTP config as approvalRoutes)
const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: parseInt(process.env.SMTP_PORT),
    secure: process.env.SMTP_PORT == 465,
    auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
    tls: { ciphers: 'SSLv3' }
});

// POST /api/auth/register
router.post('/register', registerUser);

// POST /api/auth/login
router.post('/login', loginUser);

// POST /api/auth/forgot-password
router.post('/forgot-password', async (req, res) => {
    const { email } = req.body;
    // Always respond identically to prevent email enumeration
    const successMsg = 'If an account with that email exists, a password reset link has been sent.';

    try {
        const userQuery = await pool.query('SELECT id, name FROM users WHERE email = $1', [email]);
        if (userQuery.rows.length === 0) {
            return res.status(200).json({ message: successMsg });
        }
        const user = userQuery.rows[0];

        // Invalidate any existing unused tokens for this user
        await pool.query('UPDATE password_reset_tokens SET used = TRUE WHERE user_id = $1 AND used = FALSE', [user.id]);

        const token = crypto.randomBytes(32).toString('hex');
        const expiresAt = new Date(Date.now() + 60 * 60 * 1000); // 1 hour

        await pool.query(
            'INSERT INTO password_reset_tokens (user_id, token, expires_at) VALUES ($1, $2, $3)',
            [user.id, token, expiresAt]
        );

        const resetLink = `http://localhost:3000/reset-password?token=${token}`;
        console.log(`\n🔑 PASSWORD RESET LINK (also emailed): ${resetLink}\n`);

        try {
            await transporter.sendMail({
                from: `"E-flow System" <${process.env.FROM_EMAIL}>`,
                to: email,
                subject: 'E-flow: Password Reset Request',
                html: `
                    <div style="font-family: Arial, sans-serif; padding: 20px; border: 1px solid #eaeaea; border-radius: 8px; max-width: 500px;">
                        <h2 style="color: #4f46e5;">Password Reset</h2>
                        <p>Hello ${user.name},</p>
                        <p>You requested a password reset for your E-flow account. Click the button below to set a new password. This link expires in <strong>1 hour</strong>.</p>
                        <a href="${resetLink}" style="display:inline-block;margin:16px 0;padding:12px 24px;background:#4f46e5;color:#fff;border-radius:6px;font-weight:bold;text-decoration:none;">Reset My Password</a>
                        <p style="color:#6b7280;font-size:13px;">If you did not request this, you can safely ignore this email. Your password will not change.</p>
                    </div>
                `
            });
        } catch (emailErr) {
            console.error('Password reset email send failed:', emailErr.message);
            // In dev, we already printed the link to console — don't block the user
        }

        res.status(200).json({ message: successMsg });
    } catch (err) {
        console.error('Forgot password error:', err);
        res.status(500).json({ message: 'Server error processing request.' });
    }
});

// POST /api/auth/reset-password
router.post('/reset-password', async (req, res) => {
    const { token, newPassword } = req.body;
    if (!token || !newPassword) {
        return res.status(400).json({ message: 'Token and new password are required.' });
    }
    if (newPassword.length < 6) {
        return res.status(400).json({ message: 'Password must be at least 6 characters long.' });
    }

    try {
        const tokenQuery = await pool.query(
            'SELECT * FROM password_reset_tokens WHERE token = $1 AND used = FALSE AND expires_at > NOW()',
            [token]
        );
        if (tokenQuery.rows.length === 0) {
            return res.status(400).json({ message: 'This reset link is invalid or has expired. Please request a new one.' });
        }
        const resetRecord = tokenQuery.rows[0];

        const hashedPassword = await bcrypt.hash(newPassword, 10);

        await pool.query('BEGIN');
        await pool.query('UPDATE users SET password_hash = $1 WHERE id = $2', [hashedPassword, resetRecord.user_id]);
        await pool.query('UPDATE password_reset_tokens SET used = TRUE WHERE id = $1', [resetRecord.id]);
        await pool.query(
            "INSERT INTO audit_logs (user_id, action) VALUES ($1, 'Password reset via email token')",
            [resetRecord.user_id]
        );
        await pool.query('COMMIT');

        res.status(200).json({ message: 'Password has been reset successfully. You can now log in.' });
    } catch (err) {
        await pool.query('ROLLBACK');
        console.error('Reset password error:', err);
        res.status(500).json({ message: 'Server error resetting password.' });
    }
});

// PUT: Update User Profile (Name & Password)
router.put('/profile', authenticateToken, async (req, res) => {
    const { name, currentPassword, newPassword, signatureData } = req.body;
    
    try {
        await pool.query('BEGIN');
        
        // 1. Update Name (if provided)
        if (name) {
            await pool.query('UPDATE users SET name = $1 WHERE id = $2', [name, req.user.id]);
        }

        // Update email notifications setting if provided
        if (req.body.email_notifications !== undefined) {
            await pool.query('UPDATE users SET email_notifications = $1 WHERE id = $2', [req.body.email_notifications, req.user.id]);
        }

        if (signatureData) {
            // One-time lock: check if a signature already exists
            const existingCheck = await pool.query('SELECT signature_data FROM users WHERE id = $1', [req.user.id]);
            if (existingCheck.rows[0]?.signature_data) {
                await pool.query('ROLLBACK');
                return res.status(403).json({ message: 'Signature already registered. Contact your administrator if you need to change it.' });
            }
            await pool.query('UPDATE users SET signature_data = $1 WHERE id = $2', [signatureData, req.user.id]);
        }

        // 2. Update Password (if they filled out the password fields)
        if (currentPassword && newPassword) {
            // FIX: Changed "password" to "password_hash" to match your database
            const userQuery = await pool.query('SELECT password_hash FROM users WHERE id = $1', [req.user.id]);
            
            // Safety check to ensure the user data loaded properly
            if (userQuery.rows.length === 0 || !userQuery.rows[0].password_hash) {
                await pool.query('ROLLBACK');
                return res.status(400).json({ message: 'User password record not found.' });
            }

            const validPassword = await bcrypt.compare(currentPassword, userQuery.rows[0].password_hash);
            
            if (!validPassword) {
                await pool.query('ROLLBACK');
                return res.status(400).json({ message: 'Your current password is incorrect.' });
            }
            
            const hashedPassword = await bcrypt.hash(newPassword, 10);
            
            // FIX: Updating the "password_hash" column
            await pool.query('UPDATE users SET password_hash = $1 WHERE id = $2', [hashedPassword, req.user.id]);
        }

        await pool.query('COMMIT');
        
        // Optional: Log this security event in the audit trail
        await pool.query("INSERT INTO audit_logs (user_id, action) VALUES ($1, 'User updated profile/password')", [req.user.id]);
        
        res.status(200).json({ message: 'Profile updated successfully!' });
    } catch (err) {
        await pool.query('ROLLBACK');
        console.error('Profile update error:', err);
        res.status(500).json({ message: 'Server error updating profile' });
    }
});

// GET: Current User Profile (including signature)
router.get('/profile', authenticateToken, async (req, res) => {
    try {
        const userQuery = await pool.query('SELECT id, name, email, role_id, department_id, signature_data, email_notifications FROM users WHERE id = $1', [req.user.id]);
        if (userQuery.rows.length === 0) {
            return res.status(404).json({ message: 'User not found' });
        }
        res.status(200).json(userQuery.rows[0]);
    } catch (err) {
        console.error('Profile fetch error:', err);
        res.status(500).json({ message: 'Server error fetching profile' });
    }
});

module.exports = router;