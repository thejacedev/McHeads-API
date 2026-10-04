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

// Rolling window of how long the API takes to answer real requests, reported by
// /health. Held in memory for this process only.
const WINDOW_MS = 5 * 60 * 1000;
const MAX_SAMPLES = 50000;

const samples = []; // [finishedAt, durationMs], oldest first

function dropOldSamples(now) {
    const cutoff = now - WINDOW_MS;
    let stale = 0;
    while (stale < samples.length && samples[stale][0] < cutoff) stale++;
    if (samples.length - stale > MAX_SAMPLES) stale = samples.length - MAX_SAMPLES;
    if (stale) samples.splice(0, stale);
}

// Express middleware. /health is skipped: it waits on Mojang by design.
function trackResponseTime(req, res, next) {
    if (req.path === '/health') return next();

    const start = process.hrtime.bigint();
    res.on('finish', () => {
        const now = Date.now();
        samples.push([now, Number(process.hrtime.bigint() - start) / 1e6]);
        if (samples.length > MAX_SAMPLES) dropOldSamples(now);
    });
    next();
}

function round1(ms) {
    return Math.round(ms * 10) / 10;
}

// Average and 95th percentile response time (ms) over the last 5 minutes.
function responseTimeStats() {
    dropOldSamples(Date.now());
    if (samples.length === 0) {
        return { requests: 0, avg: 0, p95: 0 };
    }

    const durations = samples.map(([, ms]) => ms).sort((a, b) => a - b);
    const total = durations.reduce((sum, ms) => sum + ms, 0);
    return {
        requests: durations.length,
        avg: round1(total / durations.length),
        p95: round1(durations[Math.min(durations.length - 1, Math.floor(durations.length * 0.95))])
    };
}

module.exports = { trackResponseTime, responseTimeStats };
