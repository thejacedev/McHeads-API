// MIT License
//
// Copyright (c) 2026 Jace Sleeman
//
// Permission is hereby granted, free of charge, to any person obtaining a copy
// of this software and associated documentation files (the "Software"), to deal
// in the Software without restriction, including without limitation the rights
// to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
// copies of the Software, and to permit persons to whom the Software is
// furnished to do so, subject to the following conditions:
//
// The above copyright notice and this permission notice shall be included in all
// copies or substantial portions of the Software.
//
// THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
// IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
// FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
// AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
// LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
// OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
// SOFTWARE.

const usePostgres = !!process.env.DATABASE_URL;

let db;

if (usePostgres) {
    const { Pool } = require('pg');
    db = new Pool({
        connectionString: process.env.DATABASE_URL,
        ssl: process.env.DATABASE_SSL === 'false' ? false : { rejectUnauthorized: false }
    });
    console.log('Using PostgreSQL database');
} else {
    const Database = require('better-sqlite3');
    db = new Database('./new_minecraft_heads.db');
    db.pragma('journal_mode = WAL');
    console.log('Using SQLite database');
}

const T = {
    stats: usePostgres ? 'mcheads_stats' : 'stats',
    cache: usePostgres ? 'mcheads_cache' : 'cache',
    health_logs: usePostgres ? 'mcheads_health_logs' : 'health_logs'
};

async function initDatabase() {
    if (usePostgres) {
        await db.query(`CREATE TABLE IF NOT EXISTS ${T.stats} (
            id SERIAL PRIMARY KEY,
            edition TEXT UNIQUE NOT NULL,
            count INTEGER NOT NULL DEFAULT 0
        )`);

        const { rows } = await db.query(`SELECT COUNT(*) as total FROM ${T.stats}`);
        if (parseInt(rows[0].total) === 0) {
            await db.query(`INSERT INTO ${T.stats} (edition, count) VALUES ($1, $2)`, ['java', 0]);
            await db.query(`INSERT INTO ${T.stats} (edition, count) VALUES ($1, $2)`, ['bedrock', 0]);
            console.log('Initialized stats with default values: Java 0, Bedrock 0');
        }

        await db.query(`CREATE TABLE IF NOT EXISTS ${T.cache} (
            id SERIAL PRIMARY KEY,
            key TEXT UNIQUE NOT NULL,
            data BYTEA,
            content_type TEXT,
            created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
        )`);

        await db.query(`CREATE TABLE IF NOT EXISTS ${T.health_logs} (
            id SERIAL PRIMARY KEY,
            status TEXT NOT NULL,
            message TEXT,
            response_time INTEGER,
            timestamp TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
        )`);

        await db.query(`DELETE FROM ${T.health_logs} WHERE id NOT IN (
            SELECT id FROM ${T.health_logs} ORDER BY timestamp DESC LIMIT 10000
        )`);
    } else {
        db.exec(`CREATE TABLE IF NOT EXISTS ${T.stats} (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            edition TEXT UNIQUE NOT NULL,
            count INTEGER NOT NULL DEFAULT 0
        )`);

        const total = db.prepare(`SELECT COUNT(*) as total FROM ${T.stats}`).get();
        if (total.total === 0) {
            db.prepare(`INSERT INTO ${T.stats} (edition, count) VALUES (?, ?)`).run('java', 0);
            db.prepare(`INSERT INTO ${T.stats} (edition, count) VALUES (?, ?)`).run('bedrock', 0);
            console.log('Initialized stats with default values: Java 0, Bedrock 0');
        }

        db.exec(`CREATE TABLE IF NOT EXISTS ${T.cache} (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            key TEXT UNIQUE NOT NULL,
            data BLOB,
            content_type TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )`);

        db.exec(`CREATE TABLE IF NOT EXISTS ${T.health_logs} (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            status TEXT NOT NULL,
            message TEXT,
            response_time INTEGER,
            timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
        )`);

        db.exec(`DELETE FROM ${T.health_logs} WHERE id NOT IN (
            SELECT id FROM ${T.health_logs} ORDER BY timestamp DESC LIMIT 10000
        )`);
    }
}

function getCacheKey(endpoint, input, size, option) {
    return `${endpoint}_${input}_${size || 'default'}_${option || 'default'}`;
}

async function getFromCache(key) {
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    if (usePostgres) {
        const { rows } = await db.query(
            `SELECT data, content_type FROM ${T.cache} WHERE key = $1 AND created_at > $2`,
            [key, oneHourAgo]
        );
        return rows[0] || null;
    } else {
        return db.prepare(
            `SELECT data, content_type FROM ${T.cache} WHERE key = ? AND created_at > ?`
        ).get(key, oneHourAgo) || null;
    }
}

async function saveToCache(key, data, contentType) {
    if (usePostgres) {
        await db.query(
            `INSERT INTO ${T.cache} (key, data, content_type) VALUES ($1, $2, $3)
             ON CONFLICT (key) DO UPDATE SET data = $2, content_type = $3, created_at = CURRENT_TIMESTAMP`,
            [key, data, contentType]
        );
    } else {
        db.prepare(
            `INSERT OR REPLACE INTO ${T.cache} (key, data, content_type) VALUES (?, ?, ?)`
        ).run(key, data, contentType);
    }
}

async function recordStats(endpoint, input, edition) {
    try {
        if (usePostgres) {
            await db.query(`UPDATE ${T.stats} SET count = count + 1 WHERE edition = $1`, [edition]);
        } else {
            db.prepare(`UPDATE ${T.stats} SET count = count + 1 WHERE edition = ?`).run(edition);
        }
    } catch (err) {
        console.error('Stats update error:', err);
    }
}

async function getStats(edition = null) {
    if (usePostgres) {
        let query = `SELECT count FROM ${T.stats}`;
        const params = [];
        if (edition) {
            query += ' WHERE edition = $1';
            params.push(edition);
        }
        const { rows } = await db.query(query, params);
        return rows[0] ? { head: rows[0].count } : { head: 0 };
    } else {
        let query = `SELECT count FROM ${T.stats}`;
        const params = [];
        if (edition) {
            query += ' WHERE edition = ?';
            params.push(edition);
        }
        const row = db.prepare(query).get(...params);
        return row ? { head: row.count } : { head: 0 };
    }
}

async function getAllStatsSorted() {
    if (usePostgres) {
        const { rows } = await db.query(`SELECT edition, count FROM ${T.stats} ORDER BY count DESC`);
        return rows.map(row => ({ endpoint: 'head', edition: row.edition, count: row.count }));
    } else {
        const rows = db.prepare(`SELECT edition, count FROM ${T.stats} ORDER BY count DESC`).all();
        return rows.map(row => ({ endpoint: 'head', edition: row.edition, count: row.count }));
    }
}

async function logHealthCheck(status, message, responseTime) {
    try {
        if (usePostgres) {
            await db.query(
                `INSERT INTO ${T.health_logs} (status, message, response_time) VALUES ($1, $2, $3)`,
                [status, message, responseTime]
            );
        } else {
            db.prepare(
                `INSERT INTO ${T.health_logs} (status, message, response_time) VALUES (?, ?, ?)`
            ).run(status, message, responseTime);
        }
    } catch (err) {
        console.error('Health log error:', err);
    }
}

async function getHealthStatus() {
    let logs;
    if (usePostgres) {
        const result = await db.query(`
            SELECT status, message, response_time, timestamp
            FROM ${T.health_logs}
            ORDER BY timestamp DESC
            LIMIT 100
        `);
        logs = result.rows;
    } else {
        logs = db.prepare(`
            SELECT status, message, response_time, timestamp
            FROM ${T.health_logs}
            ORDER BY timestamp DESC
            LIMIT 100
        `).all();
    }

    const now = new Date();
    const recent = logs.filter(log => {
        const logTime = new Date(log.timestamp);
        return (now - logTime) < 5 * 60 * 1000;
    });

    let overallStatus = 'green';
    let statusMessage = 'All systems operational';

    if (recent.length === 0) {
        overallStatus = 'red';
        statusMessage = 'No recent health checks';
    } else {
        const errorCount = recent.filter(log => log.status === 'red').length;
        const warningCount = recent.filter(log => log.status === 'yellow').length;

        if (errorCount > recent.length * 0.5) {
            overallStatus = 'red';
            statusMessage = 'Multiple service errors detected';
        } else if (errorCount > 0 || warningCount > recent.length * 0.3) {
            overallStatus = 'yellow';
            statusMessage = 'Some services experiencing issues';
        }
    }

    const avgResponseTime = recent.length > 0
        ? Math.round(recent.reduce((sum, log) => sum + (log.response_time || 0), 0) / recent.length)
        : 0;

    return {
        status: overallStatus,
        message: statusMessage,
        timestamp: now.toISOString(),
        uptime: process.uptime(),
        response_time_avg: avgResponseTime,
        recent_checks: recent.length,
        last_24h_summary: logs.slice(0, 1440).reduce((acc, log) => {
            acc[log.status] = (acc[log.status] || 0) + 1;
            return acc;
        }, {})
    };
}

function closeDatabase() {
    if (usePostgres) {
        db.end();
    } else {
        db.close();
    }
}

module.exports = {
    db,
    initDatabase,
    getCacheKey,
    getFromCache,
    saveToCache,
    recordStats,
    getStats,
    getAllStatsSorted,
    logHealthCheck,
    getHealthStatus,
    closeDatabase
};
