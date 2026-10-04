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

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const compression = require('compression');
const rateLimit = require('./utils/rateLimit');
const { trackResponseTime } = require('./utils/metrics');

const app = express();

// Needed behind a reverse proxy so req.ip (used by the rate limiter) is the
// client's address: "true", a hop count, or a list of trusted addresses.
if (process.env.TRUST_PROXY) {
    const trustProxy = process.env.TRUST_PROXY;
    app.set('trust proxy', trustProxy === 'true' ? true : /^\d+$/.test(trustProxy) ? Number(trustProxy) : trustProxy);
}

app.use(helmet({crossOriginResourcePolicy: { policy: "cross-origin" }}));
app.use(compression());
app.use(cors());
app.use(trackResponseTime);

const rateLimitPerMinute = parseInt(process.env.RATE_LIMIT_PER_MINUTE, 10);
if (rateLimitPerMinute > 0) {
    app.use(rateLimit({ windowMs: 60 * 1000, max: rateLimitPerMinute }));
}

app.use('/', require('./routes/mhf'));
app.use('/', require('./routes/player'));
app.use('/', require('./routes/head'));
app.use('/', require('./routes/avatar'));
app.use('/', require('./routes/skin'));
app.use('/', require('./routes/ios'));
app.use('/', require('./routes/stats'));
app.use('/', require('./routes/download'));
app.use('/', require('./routes/health'));

module.exports = app;
