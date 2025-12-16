const { Pool } = require('pg');
require('dotenv').config({ path: '.env' });
const pool = new Pool({
    user: process.env.DB_USER, host: process.env.DB_HOST, database: process.env.DB_NAME, password: process.env.DB_PASSWORD, port: process.env.DB_PORT,
});
async function fix() {
    try {
        await pool.query('BEGIN');

        // Drop existing constraint
        await pool.query('ALTER TABLE audit_logs DROP CONSTRAINT IF EXISTS audit_logs_role_id_fkey');
        // Add it back with ON UPDATE CASCADE
        await pool.query('ALTER TABLE audit_logs ADD CONSTRAINT audit_logs_role_id_fkey FOREIGN KEY (role_id) REFERENCES dynamic_roles(id) ON UPDATE CASCADE ON DELETE SET NULL');

        const res = await pool.query('SELECT * FROM dynamic_roles ORDER BY id DESC');
        for (const role of res.rows) {
            if (role.id <= 3) {
                await pool.query('UPDATE dynamic_roles SET id = $1 WHERE id = $2', [role.id + 3, role.id]);
            }
        }
        await pool.query(`SELECT setval(pg_get_serial_sequence('dynamic_roles', 'id'), COALESCE((SELECT MAX(id) FROM dynamic_roles), 3) + 1, false)`);
        await pool.query('COMMIT');
        console.log('Fixed dynamic_roles sequence globally!');
    } catch (err) {
        await pool.query('ROLLBACK');
        console.error(err);
    } finally {
        pool.end();
    }
}
fix();
