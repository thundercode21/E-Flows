const fs = require('fs');
const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
  user: process.env.DB_USER,
  host: process.env.DB_HOST,
  database: process.env.DB_NAME,
  password: process.env.DB_PASSWORD,
  port: process.env.DB_PORT,
});

async function run() {
  try {
    const sql = fs.readFileSync('migrations/02_advanced_workflow_features.sql', 'utf8');
    await pool.query(sql);
    console.log('Migration 02 completed.');
  } catch (err) {
    console.error('Migration failed:', err);
  } finally {
    process.exit(0);
  }
}
run();
