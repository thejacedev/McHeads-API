const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

// A file database so tests can backdate cache rows through a second connection.
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mcheads-routes-'));
process.env.SQLITE_PATH = path.join(dir, 'test.db');

const { stubUpstream, makeSkin, mojangProfile, texturesProperty } = require('./helpers');
const Database = require('better-sqlite3');
const test = require('node:test');
const assert = require('node:assert/strict');
const sharp = require('sharp');
const app = require('../app');
const db = require('../utils/database');

const SKIN = makeSkin();
const LEGACY_SKIN = makeSkin({ height: 32 });
const UUIDS = { Notch: '069a79f444e94726a5befca90e38aaf5', LegacyGuy: 'ffff0000ffff4000ffff0000ffff0001' };

let mojangUp = true;
const calls = stubUpstream(url => {
    if (url.startsWith('https://api.mojang.com/users/profiles/minecraft/')) {
        if (!mojangUp) throw new Error('ECONNREFUSED');
        const id = UUIDS[decodeURIComponent(url.split('/').pop())];
        return id ? { data: { id, name: 'x' } } : { status: 404, data: {} };
    }
    if (url.includes('sessionserver.mojang.com')) {
        const id = url.split('/').pop();
        const name = Object.keys(UUIDS).find(key => UUIDS[key] === id);
        return { data: mojangProfile(id, `http://textures.minecraft.net/texture/${name}`) };
    }
    if (url.endsWith('/v2/xbox/xuid/Bedrocker')) return { data: { xuid: 2535468413142004 } };
    if (url.endsWith('/v2/skin/2535468413142004')) {
        return { data: { texture_id: 'Bedrocker', value: texturesProperty('http://textures.minecraft.net/texture/Bedrocker') } };
    }
    if (url === 'https://textures.minecraft.net/texture/LegacyGuy') return { data: LEGACY_SKIN };
    if (url.startsWith('https://textures.minecraft.net/texture/')) return { data: SKIN };
});

let server;
let base;
let raw;

test.before(async () => {
    await db.initDatabase();
    raw = new Database(process.env.SQLITE_PATH);
    server = app.listen(0);
    await new Promise(resolve => server.once('listening', resolve));
    base = `http://127.0.0.1:${server.address().port}`;
});

test.after(async () => {
    await new Promise(resolve => server.close(resolve));
    raw.close();
    await db.closeDatabase();
    fs.rmSync(dir, { recursive: true, force: true });
});

// Plants an expired cache entry for a player this process hasn't looked up yet.
function plantStaleImage(key, data) {
    raw.prepare(`INSERT INTO cache (key, data, content_type, created_at)
                 VALUES (?, ?, 'image/png', datetime('now', '-2 hours'))`).run(key, data);
}

async function get(path) {
    const response = await fetch(base + path);
    const body = Buffer.from(await response.arrayBuffer());
    return { response, body };
}

async function dimensions(png) {
    const { width, height } = await sharp(png).metadata();
    return [width, height];
}

test('GET /head renders a PNG with cache headers', async () => {
    const { response, body } = await get('/head/Notch/64');
    assert.equal(response.status, 200);
    assert.equal(response.headers.get('content-type'), 'image/png');
    assert.equal(response.headers.get('cache-control'), 'public, max-age=3600');
    assert.deepEqual(await dimensions(body), [64, 64]);
});

test('sizes are clamped and invalid sizes use the default', async () => {
    assert.deepEqual(await dimensions((await get('/head/Notch/99999')).body), [512, 512]);
    assert.deepEqual(await dimensions((await get('/head/Notch/abc')).body), [128, 128]);
    assert.deepEqual(await dimensions((await get('/head/Notch/0')).body), [128, 128]);
    assert.deepEqual(await dimensions((await get('/head/Notch.png')).body), [128, 128]);
});

test('invalid identifiers are a 400 and unknown players a 404', async () => {
    const invalid = await get('/head/..%2F..%2Fsomething/64');
    assert.equal(invalid.response.status, 400);
    assert.deepEqual(JSON.parse(invalid.body), { error: 'Invalid player identifier' });

    const missing = await get('/head/NoSuchPlayer/64');
    assert.equal(missing.response.status, 404);
    assert.deepEqual(JSON.parse(missing.body), { error: 'Player not found' });
});

test('upstream failures are a 502 with the endpoint message', async () => {
    mojangUp = false;
    try {
        const { response, body } = await get('/player/SomeoneElse');
        assert.equal(response.status, 502);
        assert.deepEqual(JSON.parse(body), { error: 'Failed to render player' });
    } finally {
        mojangUp = true;
    }
});

test('a stale cached image is served when the upstream fails', async () => {
    const staleImage = await sharp(SKIN).resize(64, 64).png().toBuffer();
    plantStaleImage('head:name:outageguy:64:nohat', staleImage);

    mojangUp = false;
    try {
        const { response, body } = await get('/head/OutageGuy/64');
        assert.equal(response.status, 200);
        assert.equal(response.headers.get('cache-control'), 'public, max-age=60');
        assert.deepEqual(body, staleImage);
    } finally {
        mojangUp = true;
    }
});

test('a stale cached image is re-rendered when the upstream is up', async () => {
    UUIDS.Refresher = 'aaaa1111aaaa4111aaaa1111aaaa1111';
    plantStaleImage('head:name:refresher:64:nohat', Buffer.from('old render'));

    const { response, body } = await get('/head/Refresher/64');
    assert.equal(response.status, 200);
    assert.equal(response.headers.get('cache-control'), 'public, max-age=3600');
    assert.deepEqual(await dimensions(body), [64, 64]);
});

test('GET /player with hat works for legacy skins', async () => {
    const { response, body } = await get('/player/LegacyGuy/64/hat');
    assert.equal(response.status, 200);
    assert.deepEqual(await dimensions(body), [64, 128]);
});

test('isometric endpoints validate direction and default to 64px', async () => {
    assert.equal((await get('/avatar/Notch/up')).response.status, 400);
    assert.equal((await get('/ioshead/Notch/sideways')).response.status, 400);
    assert.deepEqual(await dimensions((await get('/ioshead/Notch/left')).body), [64, 64]);
    assert.deepEqual(await dimensions((await get('/iosbody/Notch/right')).body), [64, 131]);
    assert.deepEqual(await dimensions((await get('/avatar/Notch/right/32')).body), [32, 65]);
});

test('Bedrock players resolve through GeyserMC', async () => {
    const { response, body } = await get('/skin/.Bedrocker');
    assert.equal(response.status, 200);
    assert.deepEqual(body, SKIN);
});

test('GET /download sends an attachment with a safe filename', async () => {
    const { response, body } = await get('/download/.Bedrocker');
    assert.equal(response.status, 200);
    assert.equal(response.headers.get('content-disposition'), 'attachment; filename="_Bedrocker_skin.png"');
    assert.deepEqual(body, SKIN);
});

test('repeat requests do not call upstream again', async () => {
    await get('/player/Notch/48');
    const before = calls.length;
    const { response } = await get('/player/Notch/48');
    assert.equal(response.status, 200);
    assert.equal(calls.length, before);
});

test('stats count every image served, including cache hits', async () => {
    const before = (await (await fetch(`${base}/allstats`)).json()).head;
    await get('/head/Notch/72');
    await get('/head/Notch/72');
    const after = (await (await fetch(`${base}/allstats`)).json()).head;
    assert.equal(after - before, 2);
});

test('GET /health reports the live status with a matching HTTP code', async () => {
    const healthy = await get('/health');
    const report = JSON.parse(healthy.body);
    assert.equal(healthy.response.status, 200);
    assert.equal(report.status, 'green');
    assert.equal(report.recent_status, 'green');
    assert.ok(report.recent_checks >= 1);
    // response_time_avg is the API's own speed on real requests, not Mojang's.
    assert.ok(report.requests_last_5m > 0);
    assert.equal(typeof report.response_time_avg, 'number');
    assert.ok(report.response_time_p95 >= report.response_time_avg);
    assert.equal(typeof report.external_api_latency_avg, 'number');

    mojangUp = false;
    try {
        const down = await get('/health');
        assert.equal(down.response.status, 503);
        assert.equal(JSON.parse(down.body).status, 'red');
    } finally {
        mojangUp = true;
    }
});

test('GET /minecraft/mhf lists the MHF heads by UUID', async () => {
    const heads = await (await fetch(`${base}/minecraft/mhf`)).json();
    assert.equal(heads['6ab4317889fd490597f60f67d9d76fd9'], 'MHF_Alex');
});
