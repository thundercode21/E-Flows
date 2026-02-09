require('dotenv').config();
const { Pool } = require('pg');

const pool = new Pool({
    user: process.env.DB_USER,
    host: process.env.DB_HOST,
    database: process.env.DB_NAME,
    password: process.env.DB_PASSWORD,
    port: process.env.DB_PORT,
});

async function migrate() {
    try {
        console.log('Adding current_role_id and current_department_id to documents table...');

        // Add current_role_id
        await pool.query(`
            ALTER TABLE documents 
            ADD COLUMN IF NOT EXISTS current_role_id INTEGER REFERENCES dynamic_roles(id) ON DELETE SET NULL;
        `);
        console.log('✅ Added current_role_id');

        // Add current_department_id
        await pool.query(`
            ALTER TABLE documents 
            ADD COLUMN IF NOT EXISTS current_department_id INTEGER REFERENCES departments(id) ON DELETE SET NULL;
        `);
        console.log('✅ Added current_department_id');

        console.log('\nMigration completed successfully!');
    } catch (err) {
        console.error('Migration failed:', err);
    } finally {
        await pool.end();
    }
}

migrate();
