const { Pool } = require('pg');

const pool = new Pool({
    user: process.env.DB_USER, host: process.env.DB_HOST, database: process.env.DB_NAME,
    password: process.env.DB_PASSWORD, port: process.env.DB_PORT,
});

/**
 * Pitfall 4: Detects a circular supervisor chain in the users table.
 * Walks upward from `proposedSupervisorId` to see if `userId` appears.
 * @param {number} userId - The user we're assigning a supervisor TO.
 * @param {number} proposedSupervisorId - The proposed new supervisor.
 * @param {object} dbPool - A pg Pool or Client to query with.
 * @returns {{ isCycle: boolean, chain: number[] }}
 */
const detectCircularSupervisor = async (userId, proposedSupervisorId, dbPool) => {
    const chain = [userId];
    let currentId = proposedSupervisorId;
    const visited = new Set([userId]);

    while (currentId !== null && currentId !== undefined) {
        if (visited.has(currentId)) {
            chain.push(currentId);
            return { isCycle: true, chain };
        }
        visited.add(currentId);
        chain.push(currentId);

        const res = await dbPool.query('SELECT supervisor_id FROM users WHERE id = $1', [currentId]);
        if (res.rows.length === 0) break;
        currentId = res.rows[0].supervisor_id;
    }

    return { isCycle: false, chain };
};

module.exports = { detectCircularSupervisor };
