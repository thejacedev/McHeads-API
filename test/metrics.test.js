const test = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const { trackResponseTime, responseTimeStats } = require('../utils/metrics');

function finishRequest(path) {
    const res = new EventEmitter();
    trackResponseTime({ path }, res, () => {});
    res.emit('finish');
}

test('response times are tracked for real requests but not /health', () => {
    assert.deepEqual(responseTimeStats(), { requests: 0, avg: 0, p95: 0 });

    finishRequest('/head/Notch/64');
    finishRequest('/skin/Notch');
    finishRequest('/health');

    const stats = responseTimeStats();
    assert.equal(stats.requests, 2);
    assert.ok(stats.avg >= 0);
    assert.ok(stats.p95 >= stats.avg);
});

test('samples older than five minutes are dropped', t => {
    t.mock.timers.enable({ apis: ['Date'], now: Date.now() });
    finishRequest('/head/Notch/64');
    const before = responseTimeStats().requests;
    t.mock.timers.tick(5 * 60 * 1000 + 1);
    assert.ok(before > 0);
    assert.equal(responseTimeStats().requests, 0);
});
