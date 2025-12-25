const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: '.env' });
require('dotenv').config({ path: 'server/.env' });

const isProduction = process.env.NODE_ENV === 'production';
const dbHost = process.env.DB_HOST || '';
const isLocalhost = dbHost.includes('localhost') || dbHost.includes('127.0.0.1');
const useSsl = isProduction && !isLocalhost;

let pool;
if (process.env.DATABASE_URL) {
  const connString = process.env.DATABASE_URL;
  const isConnLocal = connString.includes('localhost') || connString.includes('127.0.0.1');
  pool = new Pool({
    connectionString: connString,
    ssl: isProduction && !isConnLocal ? { rejectUnauthorized: false } : false,
  });
} else {
  pool = new Pool({
    user: process.env.DB_USER,
    host: process.env.DB_HOST,
    database: process.env.DB_NAME,
    password: process.env.DB_PASSWORD,
    port: process.env.DB_PORT,
    ssl: useSsl ? { rejectUnauthorized: false } : false,
  });
}

async function run() {
  try {
    await pool.query('ALTER TABLE users ADD COLUMN IF NOT EXISTS email_notifications BOOLEAN DEFAULT TRUE;');
    console.log("Added email_notifications to users");

    await pool.query('ALTER TABLE documents ADD COLUMN IF NOT EXISTS sla_reminder_sent BOOLEAN DEFAULT FALSE;');
    console.log("Added sla_reminder_sent to documents");

    await pool.query('ALTER TABLE documents ADD COLUMN IF NOT EXISTS sla_warning_sent BOOLEAN DEFAULT FALSE;');
    console.log("Added sla_warning_sent to documents");

    const migrationsDir = path.join(__dirname, 'migrations');
    if (fs.existsSync(migrationsDir)) {
      const files = fs.readdirSync(migrationsDir).filter(f => f.endsWith('.sql')).sort();
      for (const file of files) {
        console.log(`Running migration: ${file}`);
        const sql = fs.readFileSync(path.join(migrationsDir, file), 'utf8');
        // Handle multiple statements if necessary by just passing the whole string
        await pool.query(sql);
      }
    }
    console.log("All fixes and migrations applied successfully!");
  } catch(e) {
    console.error("Error applying fixes:", e);
  } finally {
    pool.end();
    process.exit(0);
  }
}
run();
