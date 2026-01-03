require('dotenv').config();
const { Pool } = require('pg');
const pool = new Pool({
    user: process.env.DB_USER, 
    host: process.env.DB_HOST, 
    database: process.env.DB_NAME, 
    password: process.env.DB_PASSWORD, 
    port: process.env.DB_PORT,
});
async function run() {
    try {
        await pool.query('ALTER TABLE users ADD COLUMN IF NOT EXISTS email_notifications BOOLEAN DEFAULT TRUE;');
        console.log("Column added successfully!");
    } catch (e) {
        console.error(e);
    } finally {
        pool.end();
    }
}
run();
