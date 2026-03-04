const express = require('express');
const router = express.Router();
const { Pool } = require('pg');
const authenticateToken = require('../middleware/authMiddleware');

const pool = new Pool({
    user: process.env.DB_USER,
    host: process.env.DB_HOST,
    database: process.env.DB_NAME,
    password: process.env.DB_PASSWORD,
    port: process.env.DB_PORT,
});

// POST: Save a new workflow
router.post('/', authenticateToken, async (req, res) => {
    const { name, flow_structure } = req.body;
    if (!name) return res.status(400).json({ message: 'Workflow name is required' });

    try {
        await pool.query('BEGIN');
        const result = await pool.query('INSERT INTO workflows (name, flow_structure) VALUES ($1, $2) RETURNING *', [name, flow_structure]);
        await pool.query("INSERT INTO audit_logs (user_id, action) VALUES ($1, $2)", [req.user.id, `Created new workflow: '${name}'`]);
        await pool.query('COMMIT');
        res.status(201).json(result.rows[0]);
    } catch (err) {
        await pool.query('ROLLBACK');
        console.error(err);
        res.status(500).json({ message: 'Error saving workflow' });
    }
});

// GET: Fetch all available workflows
router.get('/', authenticateToken, async (req, res) => {
    try {
        // We now fetch the flow_structure too, so the frontend can load it for editing
        const result = await pool.query('SELECT * FROM workflows ORDER BY id DESC');
        res.status(200).json(result.rows);
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Error fetching workflows' });
    }
});

// PUT: Update an existing workflow
router.put('/:id', authenticateToken, async (req, res) => {
    const { name, flow_structure } = req.body;
    const workflowId = req.params.id;

    if (!name) return res.status(400).json({ message: 'Workflow name is required' });

    try {
        await pool.query('BEGIN');
        await pool.query('UPDATE workflows SET name = $1, flow_structure = $2 WHERE id = $3', [name, flow_structure, workflowId]);
        await pool.query("INSERT INTO audit_logs (user_id, action) VALUES ($1, $2)", [req.user.id, `Updated workflow: '${name}'`]);
        await pool.query('COMMIT');
        res.status(200).json({ message: 'Workflow updated successfully' });
    } catch (err) {
        await pool.query('ROLLBACK');
        console.error(err);
        res.status(500).json({ message: 'Error updating workflow' });
    }
});

// DELETE: Remove a workflow (with safety check)
router.delete('/:id', authenticateToken, async (req, res) => {
    const workflowId = req.params.id;

    try {
        await pool.query('BEGIN');
        
        // Safety Check: Are any documents currently using this workflow?
        const activeDocs = await pool.query('SELECT id FROM documents WHERE workflow_id = $1 LIMIT 1', [workflowId]);
        if (activeDocs.rows.length > 0) {
            await pool.query('ROLLBACK');
            return res.status(400).json({ message: 'Cannot delete: Active documents are currently using this workflow.' });
        }

        const wfQuery = await pool.query('SELECT name FROM workflows WHERE id = $1', [workflowId]);
        const wfName = wfQuery.rows[0]?.name || 'Unknown';

        await pool.query('DELETE FROM workflows WHERE id = $1', [workflowId]);
        await pool.query("INSERT INTO audit_logs (user_id, action) VALUES ($1, $2)", [req.user.id, `Deleted workflow: '${wfName}'`]);
        
        await pool.query('COMMIT');
        res.status(200).json({ message: 'Workflow deleted successfully' });
    } catch (err) {
        await pool.query('ROLLBACK');
        console.error(err);
        res.status(500).json({ message: 'Error deleting workflow' });
    }
});

module.exports = router;