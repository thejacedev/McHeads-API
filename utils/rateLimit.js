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

// Fixed-window, per-IP request limiter held in memory (one process only).
// Behind a reverse proxy, set TRUST_PROXY so req.ip is the client's address
// rather than the proxy's.
function rateLimit({ windowMs, max }) {
    let windowStart = Date.now();
    let counts = new Map();

    return (req, res, next) => {
        const now = Date.now();
        if (now - windowStart >= windowMs) {
            windowStart = now;
            counts = new Map();
        }

        const count = (counts.get(req.ip) || 0) + 1;
        counts.set(req.ip, count);

        if (count > max) {
            res.set('Retry-After', String(Math.ceil((windowStart + windowMs - now) / 1000)));
            return res.status(429).json({ error: 'Too many requests' });
        }
        next();
    };
}

module.exports = rateLimit;
