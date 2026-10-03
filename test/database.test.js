const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

// A file database (rather than :memory:) so the test can reach in with a second
// connection and backdate rows.
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mcheads-test-'));
process.env.SQLITE_PATH = path.join(dir, 'test.db');
require('./helpers');

const test = require('node:test');
const assert = require('node:assert/strict');
const Database = require('better-sqlite3');
const db = require('../utils/database');

let raw;

test.before(async () => {
    await db.initDatabase();
    raw = new Database(process.env.SQLITE_PATH);
});

test.after(async () => {
    raw.close();
    await db.closeDatabase();
    fs.rmSync(dir, { recursive: true, force: true });
});

test('a freshly cached image is returned', async () => {
    const data = Buffer.from('png bytes');
    await db.saveToCache('head:name:notch:64:nohat', data, 'image/png');
    assert.deepEqual(await db.getFromCache('head:name:notch:64:nohat'), data);
});

test('saving again replaces the cached image', async () => {
    await db.saveToCache('replace-me', Buffer.from('old'), 'image/png');
    await db.saveToCache('replace-me', Buffer.from('new'), 'image/png');
    assert.deepEqual(await db.getFromCache('replace-me'), Buffer.from('new'));
});

test('cache entries expire after an hour and are pruned', async () => {
    await db.saveToCache('stale', Buffer.from('old'), 'image/png');
    raw.prepare(`UPDATE cache SET created_at = datetime('now', '-61 minutes') WHERE key = 'stale'`).run();

    assert.equal(await db.getFromCache('stale'), null);
    await db.pruneDatabase();
    assert.equal(raw.prepare(`SELECT COUNT(*) AS n FROM cache WHERE key = 'stale'`).get().n, 0);
});

test('cache keys are built from their parts', () => {
    assert.equal(db.getCacheKey('head', 'name:notch', 64, 'hat'), 'head:name:notch:64:hat');
});

test('stats count per edition', async () => {
    await db.recordStats('java');
    await db.recordStats('java');
    await db.recordStats('bedrock');
    assert.deepEqual(await db.getStats('java'), { head: 2 });
    assert.deepEqual(await db.getStats('bedrock'), { head: 1 });
    assert.deepEqual(await db.getAllStatsSorted(), [
        { endpoint: 'head', edition: 'java', count: 2 },
        { endpoint: 'head', edition: 'bedrock', count: 1 }
    ]);
});

test('health history only counts recent checks, whatever the time zone', async () => {
    raw.prepare('DELETE FROM health_logs').run();
    await db.logHealthCheck('green', 'ok', 40);
    await db.logHealthCheck('green', 'ok', 60);
    raw.prepare(`INSERT INTO health_logs (status, message, response_time, timestamp)
                 VALUES ('red', 'old', 999, datetime('now', '-2 hours'))`).run();
    raw.prepare(`INSERT INTO health_logs (status, message, response_time, timestamp)
                 VALUES ('red', 'older', 999, datetime('now', '-2 days'))`).run();

    const status = await db.getHealthStatus();
    assert.equal(status.recent_checks, 2);
    assert.equal(status.recent_status, 'green');
    assert.equal(status.response_time_avg, 50);
    assert.deepEqual(status.last_24h_summary, { green: 2, red: 1 });
});

test('with no recent checks the history reports red', async () => {
    raw.prepare('DELETE FROM health_logs').run();
    const status = await db.getHealthStatus();
    assert.equal(status.recent_checks, 0);
    assert.equal(status.recent_status, 'red');
    assert.deepEqual(status.last_24h_summary, {});
});
