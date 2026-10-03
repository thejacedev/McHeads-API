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
const { createBodyRender } = require('../utils/imageProcessor');
const { imageRoute } = require('../utils/imageRoute');
const { parseSize } = require('../utils/urlHelpers');

router.get('/player/:input/:size?/:option?', imageRoute({
    endpoint: 'player',
    errorMessage: 'Failed to render player',
    parse: ({ size, option }) => {
        const sizeInt = parseSize(size);
        const hat = option === 'hat';
        return { sizeInt, hat, cacheParts: [sizeInt, hat ? 'hat' : 'nohat'] };
    },
    render: (skin, { slim }, { sizeInt, hat }) => createBodyRender(skin, sizeInt, hat, slim)
}));

module.exports = router;
