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
const { getRawSkin } = require('../utils/imageProcessor');
const { recordStats } = require('../utils/database');
const { cleanParams } = require('../utils/urlHelpers');

router.get('/download/:input', async (req, res) => {
    const cleanedParams = cleanParams(req.params);
    const { input } = cleanedParams;
    
    try {
        const { profile, edition } = await getProfile(input);
        recordStats('download', input, edition);
        
        const skinUrl = profile.textures?.SKIN?.url || profile.skin_url;
        if (!skinUrl) {
            throw new Error('No skin URL found');
        }
        
        const skinBuffer = await getRawSkin(skinUrl);
        
        res.set({
            'Content-Type': 'image/png',
            'Content-Disposition': `attachment; filename="${input}_skin.png"`
        });
        res.send(skinBuffer);
    } catch (error) {
        console.error('Download error:', error);
        res.status(500).json({ error: 'Failed to download skin' });
    }
});

module.exports = router;
