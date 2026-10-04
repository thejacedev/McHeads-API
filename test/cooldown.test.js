// Rate-limit cooldowns are module-wide state, so they get their own test process.
const { stubUpstream, mojangProfile } = require('./helpers');
const test = require('node:test');
const assert = require('node:assert/strict');
const { parsePlayer, getSkinInfo } = require('../utils/minecraft');
const { HttpError } = require('../utils/errors');

const isStatus = status => error => error instanceof HttpError && error.status === status;

test('a 429 pauses requests to that host until Retry-After has passed', async t => {
    t.mock.timers.enable({ apis: ['Date'], now: Date.now() });

    let limited = true;
    const calls = stubUpstream(url => {
        if (url.startsWith('https://api.mojang.com/')) {
            if (limited) return { status: 429, data: {}, headers: { 'retry-after': '20' } };
            return { data: { id: 'abcd0000abcd4000abcd0000abcd0001' } };
        }
        if (url.includes('sessionserver.mojang.com')) {
            return { data: mojangProfile('abcd0000abcd4000abcd0000abcd0001', 'https://textures.minecraft.net/texture/x') };
        }
    });

    await assert.rejects(getSkinInfo(parsePlayer('FirstHit')), isStatus(502));
    assert.equal(calls.length, 1);

    // Same host during the cooldown: rejected without another upstream request.
    await assert.rejects(getSkinInfo(parsePlayer('SecondHit')), error => {
        assert.ok(isStatus(502)(error));
        assert.match(error.message, /api\.mojang\.com is rate limiting us/);
        return true;
    });
    assert.equal(calls.length, 1);

    // Other hosts are unaffected: UUID lookups go straight to the session server.
    assert.equal((await getSkinInfo(parsePlayer('abcd0000abcd4000abcd0000abcd0001'))).skinUrl, 'https://textures.minecraft.net/texture/x');

    // Once Retry-After has passed, the host is called again.
    limited = false;
    t.mock.timers.tick(20 * 1000);
    assert.equal((await getSkinInfo(parsePlayer('ThirdHit'))).skinUrl, 'https://textures.minecraft.net/texture/x');
});
