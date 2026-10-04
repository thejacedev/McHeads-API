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

const CACHE_TTL = [1, 'hour'];
const HEALTH_LOG_RETENTION = [7, 'days'];
const PRUNE_INTERVAL_MS = 10 * 60 * 1000;

let db;

if (usePostgres) {
    const { Pool } = require('pg');
    db = new Pool({
        connectionString: process.env.DATABASE_URL,
        ssl: sslConfig()
    });
    console.log('Using PostgreSQL database');
} else {
    const Database = require('better-sqlite3');
    db = new Database(process.env.SQLITE_PATH || './new_minecraft_heads.db');
    db.pragma('journal_mode = WAL');
    console.log('Using SQLite database');
}

// TLS without certificate verification by default, since many hosts (Railway,
// Heroku, ...) use self-signed certificates. DATABASE_SSL=verify checks the
// certificate against the system CAs, or against DATABASE_CA_CERT when set;
// DATABASE_SSL=false disables TLS.
function sslConfig() {
    if (process.env.DATABASE_SSL === 'false') return false;
    if (process.env.DATABASE_CA_CERT) {
        return { ca: require('fs').readFileSync(process.env.DATABASE_CA_CERT, 'utf8') };
    }
    if (process.env.DATABASE_SSL === 'verify') return true;
    return { rejectUnauthorized: false };
}

const T = {
    stats: usePostgres ? 'mcheads_stats' : 'stats',
    cache: usePostgres ? 'mcheads_cache' : 'cache',
    health_logs: usePostgres ? 'mcheads_health_logs' : 'health_logs'
};

const ID_COLUMN = usePostgres ? 'id SERIAL PRIMARY KEY' : 'id INTEGER PRIMARY KEY AUTOINCREMENT';
const BLOB = usePostgres ? 'BYTEA' : 'BLOB';
const TIMESTAMP = usePostgres ? 'TIMESTAMPTZ' : 'DATETIME';

// SQL for "now minus amount units", in the same clock and format the database
// uses for CURRENT_TIMESTAMP. Only ever called with the constants above.
function ago([amount, unit]) {
    return usePostgres
        ? `NOW() - INTERVAL '${amount} ${unit}'`
        : `datetime('now', '-${amount} ${unit}')`;
}

const statements = new Map();

// Runs one statement on either backend and returns its rows. SQL is written
// with `?` placeholders, which are rewritten to $1..$n for Postgres.
async function query(sql, params = []) {
    if (usePostgres) {
        let index = 0;
        const { rows } = await db.query(sql.replace(/\?/g, () => `$${++index}`), params);
        return rows;
    }

    let statement = statements.get(sql);
    if (!statement) {
        statement = db.prepare(sql);
        statements.set(sql, statement);
    }
    if (statement.reader) return statement.all(...params);
    statement.run(...params);
    return [];
}

let pruneTimer;

async function initDatabase() {
    await query(`CREATE TABLE IF NOT EXISTS ${T.stats} (
        ${ID_COLUMN},
        edition TEXT UNIQUE NOT NULL,
        count INTEGER NOT NULL DEFAULT 0
    )`);

    for (const edition of ['java', 'bedrock']) {
        await query(`INSERT INTO ${T.stats} (edition, count) VALUES (?, 0) ON CONFLICT (edition) DO NOTHING`, [edition]);
    }

    await query(`CREATE TABLE IF NOT EXISTS ${T.cache} (
        ${ID_COLUMN},
        key TEXT UNIQUE NOT NULL,
        data ${BLOB},
        content_type TEXT,
        created_at ${TIMESTAMP} DEFAULT CURRENT_TIMESTAMP
    )`);

    await query(`CREATE TABLE IF NOT EXISTS ${T.health_logs} (
        ${ID_COLUMN},
        status TEXT NOT NULL,
        message TEXT,
        response_time INTEGER,
        timestamp ${TIMESTAMP} DEFAULT CURRENT_TIMESTAMP
    )`);

    await pruneDatabase();
    pruneTimer = setInterval(pruneDatabase, PRUNE_INTERVAL_MS);
    pruneTimer.unref();
}

// Deletes expired cache entries and old health logs so neither table grows forever.
async function pruneDatabase() {
    try {
        await query(`DELETE FROM ${T.cache} WHERE created_at <= ${ago(CACHE_TTL)}`);
        await query(`DELETE FROM ${T.health_logs} WHERE timestamp <= ${ago(HEALTH_LOG_RETENTION)}`);
    } catch (err) {
        console.error('Database prune error:', err);
    }
}

function getCacheKey(endpoint, playerId, ...parts) {
    return [endpoint, playerId, ...parts].join(':');
}

async function getFromCache(key) {
    const rows = await query(
        `SELECT data FROM ${T.cache} WHERE key = ? AND created_at > ${ago(CACHE_TTL)}`,
        [key]
    );
    return rows[0]?.data || null;
}

async function saveToCache(key, data, contentType) {
    await query(
        `INSERT INTO ${T.cache} (key, data, content_type, created_at) VALUES (?, ?, ?, CURRENT_TIMESTAMP)
         ON CONFLICT (key) DO UPDATE SET
            data = excluded.data, content_type = excluded.content_type, created_at = excluded.created_at`,
        [key, data, contentType]
    );
}

async function recordStats(edition) {
    try {
        await query(`UPDATE ${T.stats} SET count = count + 1 WHERE edition = ?`, [edition]);
    } catch (err) {
        console.error('Stats update error:', err);
    }
}

async function getStats(edition) {
    const rows = await query(`SELECT count FROM ${T.stats} WHERE edition = ?`, [edition]);
    return { head: Number(rows[0]?.count ?? 0) };
}

async function getAllStatsSorted() {
    const rows = await query(`SELECT edition, count FROM ${T.stats} ORDER BY count DESC`);
    // Counts cover every image endpoint; `endpoint` is kept for response compatibility.
    return rows.map(row => ({ endpoint: 'head', edition: row.edition, count: Number(row.count) }));
}

async function logHealthCheck(status, message, responseTime) {
    try {
        await query(
            `INSERT INTO ${T.health_logs} (status, message, response_time) VALUES (?, ?, ?)`,
            [status, message, responseTime]
        );
    } catch (err) {
        console.error('Health log error:', err);
    }
}

// Summarizes logged health checks. Time windows are evaluated in SQL so they
// don't depend on how each driver returns timestamps or on the server's time zone.
async function getHealthStatus() {
    const [recent] = await query(`
        SELECT COUNT(*) AS checks,
               SUM(CASE WHEN status = 'red' THEN 1 ELSE 0 END) AS errors,
               SUM(CASE WHEN status = 'yellow' THEN 1 ELSE 0 END) AS warnings,
               AVG(response_time) AS avg_response_time
        FROM ${T.health_logs}
        WHERE timestamp > ${ago([5, 'minutes'])}
    `);
    const daily = await query(`
        SELECT status, COUNT(*) AS count
        FROM ${T.health_logs}
        WHERE timestamp > ${ago([24, 'hours'])}
        GROUP BY status
    `);

    // Postgres returns COUNT/SUM/AVG as strings, and SUM over no rows is NULL.
    const checks = Number(recent.checks) || 0;
    const errors = Number(recent.errors) || 0;
    const warnings = Number(recent.warnings) || 0;

    let recentStatus = 'green';
    let recentMessage = 'All systems operational';

    if (checks === 0) {
        recentStatus = 'red';
        recentMessage = 'No recent health checks';
    } else if (errors > checks * 0.5) {
        recentStatus = 'red';
        recentMessage = 'Multiple service errors detected';
    } else if (errors > 0 || warnings > checks * 0.3) {
        recentStatus = 'yellow';
        recentMessage = 'Some services experiencing issues';
    }

    return {
        recent_status: recentStatus,
        recent_message: recentMessage,
        uptime: process.uptime(),
        response_time_avg: Math.round(Number(recent.avg_response_time) || 0),
        recent_checks: checks,
        last_24h_summary: Object.fromEntries(daily.map(row => [row.status, Number(row.count)]))
    };
}

async function closeDatabase() {
    clearInterval(pruneTimer);
    if (usePostgres) {
        await db.end();
    } else {
        db.close();
    }
}

module.exports = {
    initDatabase,
    pruneDatabase,
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
