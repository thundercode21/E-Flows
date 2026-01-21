// run_migrations_04_05.js — Run migrations 04 and 05
require('dotenv').config();
const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');

const pool = new Pool({
    user: process.env.DB_USER,
    host: process.env.DB_HOST,
    database: process.env.DB_NAME,
    password: process.env.DB_PASSWORD,
    port: process.env.DB_PORT,
});

const migrations = [
    './migrations/04_password_reset.sql',
    './migrations/05_version_history.sql',
];

(async () => {
    const client = await pool.connect();
    try {
        for (const filePath of migrations) {
            const sql = fs.readFileSync(path.resolve(__dirname, filePath), 'utf8');
            console.log(`\n▶ Running: ${filePath}`);
            await client.query(sql);
            console.log(`✅ Done: ${filePath}`);
        }
        console.log('\n✅ All migrations completed successfully.');
    } catch (err) {
        console.error('❌ Migration failed:', err.message);
    } finally {
        client.release();
        await pool.end();
    }
})();
