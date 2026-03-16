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
const axios = require('axios');

router.get('/health', async (req, res) => {
    const startTime = Date.now();
    
    try {
        const healthData = await getHealthStatus();
        
        let externalApiStatus = 'green';
        let externalApiMessage = 'External APIs responsive';
        
        try {
            const mojangTest = await axios.get('https://api.mojang.com/users/profiles/minecraft/Notch', {
                timeout: 5000
            });
            if (!mojangTest.data) {
                externalApiStatus = 'yellow';
                externalApiMessage = 'Mojang API slow response';
            }
        } catch (error) {
            externalApiStatus = 'red';
            externalApiMessage = 'Mojang API unreachable';
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
        
        logHealthCheck(overallStatus, statusMessage, responseTime);
        
        const response = {
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
                used: Math.round(process.memoryUsage().heapUsed / 1024 / 1024),
                total: Math.round(process.memoryUsage().heapTotal / 1024 / 1024)
            },
            ...healthData
        };
        
        const httpStatus = overallStatus === 'green' ? 200 : 
                          overallStatus === 'yellow' ? 200 : 503;
        
        res.status(httpStatus).json(response);
        
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
