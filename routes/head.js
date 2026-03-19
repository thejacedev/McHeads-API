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
const { createHeadRender } = require('../utils/imageProcessor');
const { getCacheKey, getFromCache, saveToCache, recordStats } = require('../utils/database');
const { cleanParams, parseSize } = require('../utils/urlHelpers');

router.get('/head/:input/:size?/:option?', async (req, res) => {
    const cleanedParams = cleanParams(req.params);
    const { input, size, option } = cleanedParams;
    const sizeInt = parseSize(req.params.size);
    const cacheKey = getCacheKey('head', input, size, option);
    
    try {
        const cached = await getFromCache(cacheKey);
        if (cached) {
            res.set('Content-Type', cached.content_type);
            return res.send(cached.data);
        }
        
        const { profile, edition } = await getProfile(input);
        recordStats('head', input, edition);
        
        const skinUrl = profile.textures?.SKIN?.url || profile.skin_url;
        if (!skinUrl) {
            throw new Error('No skin URL found');
        }

        const headBuffer = await createHeadRender(skinUrl, sizeInt, option === 'hat');
        
        await saveToCache(cacheKey, headBuffer, 'image/png');
        
        res.set('Content-Type', 'image/png');
        res.send(headBuffer);
    } catch (error) {
        console.error('Head render error:', error);
        res.status(500).json({ error: 'Failed to render head' });
    }
});

module.exports = router;
