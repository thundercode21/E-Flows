require('dotenv').config();
const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');

const pool = new Pool({
  user: process.env.DB_USER, host: process.env.DB_HOST, database: process.env.DB_NAME, password: process.env.DB_PASSWORD, port: process.env.DB_PORT,
});

async function run() {
  try {
    const sql = fs.readFileSync(path.join(__dirname, 'migrations', '06_user_signature.sql'), 'utf-8');
    await pool.query(sql);
    console.log('Migration 06 executed successfully!');
  } catch (err) {
    console.error('Error running migration', err);
  } finally {
    await pool.end();
  }
}

run();
