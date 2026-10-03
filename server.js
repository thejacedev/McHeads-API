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

require('dotenv').config();
const app = require('./app');
const { initDatabase, closeDatabase } = require('./utils/database');

const PORT = process.env.PORT || 3005;
const SHUTDOWN_TIMEOUT_MS = 10 * 1000;

initDatabase().then(() => {
    const server = app.listen(PORT, () => {
        console.log(`Minecraft Heads API running on port ${PORT}`);
        console.log(`Health check: http://localhost:${PORT}/health`);
        console.log(`MHF Heads: http://localhost:${PORT}/minecraft/mhf`);
    });

    let shuttingDown = false;
    const shutdown = signal => {
        if (shuttingDown) return;
        shuttingDown = true;
        console.log(`${signal} received, shutting down gracefully...`);

        // Stop accepting connections, let in-flight requests finish, then close the database.
        server.close(async () => {
            await closeDatabase();
            console.log('Database connection closed.');
            process.exit(0);
        });
        setTimeout(() => {
            console.error('Shutdown timed out, forcing exit.');
            process.exit(1);
        }, SHUTDOWN_TIMEOUT_MS).unref();
    };

    process.on('SIGINT', () => shutdown('SIGINT'));
    process.on('SIGTERM', () => shutdown('SIGTERM'));
}).catch(err => {
    console.error('Failed to initialize database:', err);
    process.exit(1);
});
