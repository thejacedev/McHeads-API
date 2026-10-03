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
const router = express.Router();
const { logHealthCheck, getHealthStatus } = require('../utils/database');
const http = require('../utils/http');

router.get('/health', async (req, res) => {
    const startTime = Date.now();

    try {
        let externalApiStatus = 'green';

        try {
            const mojangTest = await http.get('https://api.mojang.com/users/profiles/minecraft/Notch');
            if (!mojangTest.data) {
                externalApiStatus = 'yellow';
            }
        } catch (error) {
            externalApiStatus = 'red';
        }

        const responseTime = Date.now() - startTime;

        let overallStatus = 'green';
        let statusMessage = 'All systems operational';

        if (externalApiStatus === 'red') {
            overallStatus = 'red';
            statusMessage = 'External API issues detected';
        } else if (externalApiStatus === 'yellow' || responseTime > 2000) {
            overallStatus = 'yellow';
            statusMessage = 'Performance degraded';
        }

        // Log first so this check counts towards the history below.
        await logHealthCheck(overallStatus, statusMessage, responseTime);
        const history = await getHealthStatus();
        const memory = process.memoryUsage();

        res.status(overallStatus === 'red' ? 503 : 200).json({
            status: overallStatus,
            message: statusMessage,
            timestamp: new Date().toISOString(),
            services: {
                database: 'green',
                external_apis: externalApiStatus,
                response_time: `${responseTime}ms`
            },
            uptime_seconds: Math.floor(process.uptime()),
            memory_usage: {
                used: Math.round(memory.heapUsed / 1024 / 1024),
                total: Math.round(memory.heapTotal / 1024 / 1024)
            },
            ...history
        });

    } catch (error) {
        console.error('Health check error:', error);

        const responseTime = Date.now() - startTime;
        logHealthCheck('red', 'Health check failed', responseTime);

        res.status(503).json({
            status: 'red',
            message: 'Health check failed',
            timestamp: new Date().toISOString(),
            error: error.message,
            response_time: `${responseTime}ms`
        });
    }
});

module.exports = router;
