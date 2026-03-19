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

const Database = require('better-sqlite3');

const db = new Database('./new_minecraft_heads.db');

db.pragma('journal_mode = WAL');

db.exec(`CREATE TABLE IF NOT EXISTS stats (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    edition TEXT UNIQUE NOT NULL,
    count INTEGER NOT NULL DEFAULT 0
)`);

const total = db.prepare('SELECT COUNT(*) as total FROM stats').get();
if (total.total === 0) {
    db.prepare('INSERT INTO stats (edition, count) VALUES (?, ?)').run('java', 0);
    db.prepare('INSERT INTO stats (edition, count) VALUES (?, ?)').run('bedrock', 0);
    console.log('Initialized stats with default values: Java 0, Bedrock 0');
}

db.exec(`CREATE TABLE IF NOT EXISTS cache (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    key TEXT UNIQUE NOT NULL,
    data BLOB,
    content_type TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
)`);

db.exec(`CREATE TABLE IF NOT EXISTS health_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    status TEXT NOT NULL,
    message TEXT,
    response_time INTEGER,
    timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
)`);

db.exec(`DELETE FROM health_logs WHERE id NOT IN (
    SELECT id FROM health_logs ORDER BY timestamp DESC LIMIT 10000
)`);

function getCacheKey(endpoint, input, size, option) {
    return `${endpoint}_${input}_${size || 'default'}_${option || 'default'}`;
}

function getFromCache(key) {
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    return db.prepare(
        'SELECT data, content_type FROM cache WHERE key = ? AND created_at > ?'
    ).get(key, oneHourAgo) || null;
}

function saveToCache(key, data, contentType) {
    db.prepare(
        'INSERT OR REPLACE INTO cache (key, data, content_type) VALUES (?, ?, ?)'
    ).run(key, data, contentType);
}

function recordStats(endpoint, input, edition) {
    try {
        db.prepare('UPDATE stats SET count = count + 1 WHERE edition = ?').run(edition);
    } catch (err) {
        console.error('Stats update error:', err);
    }
}

function getStats(edition = null) {
    let query = 'SELECT count FROM stats';
    const params = [];

    if (edition) {
        query += ' WHERE edition = ?';
        params.push(edition);
    }

    const row = db.prepare(query).get(...params);
    return row ? { head: row.count } : { head: 0 };
}

function getAllStatsSorted() {
    const rows = db.prepare('SELECT edition, count FROM stats ORDER BY count DESC').all();
    return rows.map(row => ({ endpoint: 'head', edition: row.edition, count: row.count }));
}

function logHealthCheck(status, message, responseTime) {
    try {
        db.prepare(
            'INSERT INTO health_logs (status, message, response_time) VALUES (?, ?, ?)'
        ).run(status, message, responseTime);
    } catch (err) {
        console.error('Health log error:', err);
    }
}

function getHealthStatus() {
    const logs = db.prepare(`
        SELECT status, message, response_time, timestamp
        FROM health_logs
        ORDER BY timestamp DESC
        LIMIT 100
    `).all();

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

module.exports = {
    db,
    getCacheKey,
    getFromCache,
    saveToCache,
    recordStats,
    getStats,
    getAllStatsSorted,
    logHealthCheck,
    getHealthStatus
};
