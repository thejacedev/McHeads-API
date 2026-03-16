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
const { getStats, getAllStatsSorted } = require('../utils/database');

router.get('/allstats', async (req, res) => {
    try {
        const stats = await getStats('java');
        res.json(stats);
    } catch (error) {
        console.error('Stats error:', error);
        res.status(500).json({ error: 'Failed to get stats' });
    }
});

router.get('/allstatsbedrock', async (req, res) => {
    try {
        const stats = await getStats('bedrock');
        res.json(stats);
    } catch (error) {
        console.error('Bedrock stats error:', error);
        res.status(500).json({ error: 'Failed to get bedrock stats' });
    }
});

router.get('/allstatsSorted', async (req, res) => {
    try {
        const stats = await getAllStatsSorted();
        res.json(stats);
    } catch (error) {
        console.error('Sorted stats error:', error);
        res.status(500).json({ error: 'Failed to get sorted stats' });
    }
});

module.exports = router;
