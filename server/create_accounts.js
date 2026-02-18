require('dotenv').config();
const { Pool } = require('pg');
const bcrypt = require('bcrypt');

const pool = new Pool({
    user: process.env.DB_USER,
    host: process.env.DB_HOST,
    database: process.env.DB_NAME,
    password: process.env.DB_PASSWORD,
    port: process.env.DB_PORT,
});

async function createAccounts() {
    try {
        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash('password123', salt);

        // Create Admin (role_id = 3)
        const adminEmail = 'newadmin@eflow.edu';
        const adminCheck = await pool.query('SELECT * FROM users WHERE email = $1', [adminEmail]);
        if (adminCheck.rows.length === 0) {
            await pool.query(
                'INSERT INTO users (name, email, password_hash, role_id) VALUES ($1, $2, $3, $4)',
                ['System Admin', adminEmail, hashedPassword, 3]
            );
            console.log(`Admin account created: ${adminEmail} / password123`);
        } else {
            console.log(`Admin account ${adminEmail} already exists.`);
        }

        // Create Staff (role_id = 1)
        const staffEmail = 'staff@eflow.edu';
        const staffCheck = await pool.query('SELECT * FROM users WHERE email = $1', [staffEmail]);
        if (staffCheck.rows.length === 0) {
            await pool.query(
                'INSERT INTO users (name, email, password_hash, role_id) VALUES ($1, $2, $3, $4)',
                ['Regular Staff', staffEmail, hashedPassword, 1]
            );
            console.log(`Staff account created: ${staffEmail} / password123`);
        } else {
            console.log(`Staff account ${staffEmail} already exists.`);
        }

    } catch (err) {
        console.error('Error creating accounts:', err);
    } finally {
        await pool.end();
    }
}

createAccounts();
