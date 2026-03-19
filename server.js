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

const app = express();
const PORT = process.env.PORT || 3005;

app.use(helmet({crossOriginResourcePolicy: { policy: "cross-origin" }}));
app.use(compression());
app.use(cors());
app.use(express.json());

const mhfRoutes = require('./routes/mhf');
const playerRoutes = require('./routes/player');
const headRoutes = require('./routes/head');
const avatarRoutes = require('./routes/avatar');
const skinRoutes = require('./routes/skin');
const iosRoutes = require('./routes/ios');
const statsRoutes = require('./routes/stats');
const downloadRoutes = require('./routes/download');
const healthRoutes = require('./routes/health');

app.use('/', mhfRoutes);
app.use('/', playerRoutes);
app.use('/', headRoutes);
app.use('/', avatarRoutes);
app.use('/', skinRoutes);
app.use('/', iosRoutes);
app.use('/', statsRoutes);
app.use('/', downloadRoutes);
app.use('/', healthRoutes);

app.listen(PORT, () => {
    console.log(`Minecraft Heads API running on port ${PORT}`);
    console.log(`Health check: http://localhost:${PORT}/health`);
    console.log(`MHF Heads: http://localhost:${PORT}/minecraft/mhf`);
});

process.on('SIGINT', () => {
    console.log('Shutting down gracefully...');
    const { db } = require('./utils/database');
    db.close();
    console.log('Database connection closed.');
    process.exit(0);
});