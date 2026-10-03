const test = require('node:test');
const assert = require('node:assert/strict');
const rateLimit = require('../utils/rateLimit');

function hit(limiter, ip) {
    const res = {
        statusCode: 200,
        headers: {},
        set(name, value) { this.headers[name] = value; return this; },
        status(code) { this.statusCode = code; return this; },
        json(body) { this.body = body; return this; }
    };
    let passed = false;
    limiter({ ip }, res, () => { passed = true; });
    return { passed, res };
}

test('requests over the per-IP limit get a 429 with Retry-After', () => {
    const limiter = rateLimit({ windowMs: 60000, max: 2 });
    assert.equal(hit(limiter, '1.1.1.1').passed, true);
    assert.equal(hit(limiter, '1.1.1.1').passed, true);

    const blocked = hit(limiter, '1.1.1.1');
    assert.equal(blocked.passed, false);
    assert.equal(blocked.res.statusCode, 429);
    assert.ok(Number(blocked.res.headers['Retry-After']) > 0);

    assert.equal(hit(limiter, '2.2.2.2').passed, true);
});

test('the limit resets when the window ends', t => {
    t.mock.timers.enable({ apis: ['Date'], now: 0 });
    const limiter = rateLimit({ windowMs: 1000, max: 1 });
    assert.equal(hit(limiter, '1.1.1.1').passed, true);
    assert.equal(hit(limiter, '1.1.1.1').passed, false);
    t.mock.timers.tick(1000);
    assert.equal(hit(limiter, '1.1.1.1').passed, true);
});
