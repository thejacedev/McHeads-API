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

const sqlite3 = require('sqlite3').verbose();

const db = new sqlite3.Database('./new_minecraft_heads.db');

db.serialize(() => {
    db.run(`CREATE TABLE IF NOT EXISTS stats (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        edition TEXT UNIQUE NOT NULL,
        count INTEGER NOT NULL DEFAULT 0
    )`);
    
    db.get('SELECT COUNT(*) as total FROM stats', (err, row) => {
        if (!err && row.total === 0) {
            db.run('INSERT INTO stats (edition, count) VALUES (?, ?)', ['java', 0]);
            db.run('INSERT INTO stats (edition, count) VALUES (?, ?)', ['bedrock', 0]);
            console.log('Initialized stats with default values: Java 0, Bedrock 0');
        }
    });
    
    db.run(`CREATE TABLE IF NOT EXISTS cache (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        key TEXT UNIQUE NOT NULL,
        data BLOB,
        content_type TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);
    
    db.run(`CREATE TABLE IF NOT EXISTS health_logs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        status TEXT NOT NULL,
        message TEXT,
        response_time INTEGER,
        timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);
    
    db.run(`DELETE FROM health_logs WHERE id NOT IN (
        SELECT id FROM health_logs ORDER BY timestamp DESC LIMIT 10000
    )`);
});

function getCacheKey(endpoint, input, size, option) {
    return `${endpoint}_${input}_${size || 'default'}_${option || 'default'}`;
}

function getFromCache(key) {
    return new Promise((resolve, reject) => {
        const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
        db.get(
            'SELECT data, content_type FROM cache WHERE key = ? AND created_at > ?',
            [key, oneHourAgo],
            (err, row) => {
                if (err) reject(err);
                else resolve(row);
            }
        );
    });
}

function saveToCache(key, data, contentType) {
    return new Promise((resolve, reject) => {
        db.run(
            'INSERT OR REPLACE INTO cache (key, data, content_type) VALUES (?, ?, ?)',
            [key, data, contentType],
            (err) => {
                if (err) reject(err);
                else resolve();
            }
        );
    });
}

function recordStats(endpoint, input, edition) {
    db.run(
        'UPDATE stats SET count = count + 1 WHERE edition = ?',
        [edition],
        (err) => {
            if (err) {
                console.error('Stats update error:', err);
            }
        }
    );
}

function getStats(edition = null) {
    return new Promise((resolve, reject) => {
        let query = 'SELECT count FROM stats';
        let params = [];
        
        if (edition) {
            query += ' WHERE edition = ?';
            params.push(edition);
        }
        
        db.get(query, params, (err, row) => {
            if (err) {
                reject(err);
            } else if (row) {
                resolve({ head: row.count });
            } else {
                resolve({ head: 0 });
            }
        });
    });
}

function getAllStatsSorted() {
    return new Promise((resolve, reject) => {
        db.all(
            'SELECT edition, count FROM stats ORDER BY count DESC',
            (err, rows) => {
                if (err) reject(err);
                else resolve(rows.map(row => ({ endpoint: 'head', edition: row.edition, count: row.count })));
            }
        );
    });
}

function logHealthCheck(status, message, responseTime) {
    db.run(
        'INSERT INTO health_logs (status, message, response_time) VALUES (?, ?, ?)',
        [status, message, responseTime],
        (err) => {
            if (err) {
                console.error('Health log error:', err);
            }
        }
    );
}

function getHealthStatus() {
    return new Promise((resolve, reject) => {
        db.all(`
            SELECT status, message, response_time, timestamp 
            FROM health_logs 
            ORDER BY timestamp DESC 
            LIMIT 100
        `, (err, logs) => {
            if (err) {
                reject(err);
                return;
            }
            
            const now = new Date();
            const recent = logs.filter(log => {
                const logTime = new Date(log.timestamp);
                return (now - logTime) < 5 * 60 * 1000; // Last 5 minutes
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
            
            resolve({
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
            });
        });
    });
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
