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
const { getProfile } = require('../utils/minecraft');
const { createIsometricHeadRender, createIsometricBodyRender } = require('../utils/imageProcessor');
const { getCacheKey, getFromCache, saveToCache, recordStats } = require('../utils/database');
const { cleanParams } = require('../utils/urlHelpers');

router.get('/iosbody/:input/:direction/:option?', async (req, res) => {
    const cleanedParams = cleanParams(req.params);
    const { input, direction, option } = cleanedParams;

    if (!['left', 'right'].includes(direction)) {
        return res.status(400).json({ error: 'Direction must be "left" or "right"' });
    }

    const cacheKey = getCacheKey('iosbody', input, direction, option);

    try {
        const cached = await getFromCache(cacheKey);
        if (cached) {
            res.set('Content-Type', cached.content_type);
            return res.send(cached.data);
        }

        const { profile, edition } = await getProfile(input);
        recordStats('iosbody', input, edition);

        const skinUrl = profile.textures?.SKIN?.url || profile.skin_url;
        if (!skinUrl) {
            throw new Error('No skin URL found');
        }

        const size = option ? parseInt(option, 10) || 64 : 64;
        const bodyBuffer = await createIsometricBodyRender(skinUrl, size, direction);

        await saveToCache(cacheKey, bodyBuffer, 'image/png');

        res.set('Content-Type', 'image/png');
        res.send(bodyBuffer);
    } catch (error) {
        console.error('iOS body render error:', error);
        res.status(500).json({ error: 'Failed to render iOS body' });
    }
});

router.get('/ioshead/:input/:direction/:option?', async (req, res) => {
    console.log('[IOSHEAD ROUTE] Hit with params:', req.params);
    const cleanedParams = cleanParams(req.params);
    const { input, direction, option } = cleanedParams;

    if (!['left', 'right'].includes(direction)) {
        return res.status(400).json({ error: 'Direction must be "left" or "right"' });
    }

    const cacheKey = getCacheKey('ioshead', input, direction, option);
    console.log('[IOSHEAD ROUTE] Cache key:', cacheKey);

    try {
        const cached = await getFromCache(cacheKey);
        if (cached) {
            console.log('[IOSHEAD ROUTE] Returning cached data');
            res.set('Content-Type', cached.content_type);
            return res.send(cached.data);
        }
        console.log('[IOSHEAD ROUTE] No cache, rendering fresh');

        const { profile, edition } = await getProfile(input);
        recordStats('ioshead', input, edition);

        const skinUrl = profile.textures?.SKIN?.url || profile.skin_url;
        if (!skinUrl) {
            throw new Error('No skin URL found');
        }

        const size = option ? parseInt(option, 10) || 64 : 64;
        const headBuffer = await createIsometricHeadRender(skinUrl, size, direction);

        await saveToCache(cacheKey, headBuffer, 'image/png');

        res.set('Content-Type', 'image/png');
        res.send(headBuffer);
    } catch (error) {
        console.error('iOS head render error:', error);
        res.status(500).json({ error: 'Failed to render iOS head' });
    }
});

module.exports = router;
