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

const { HttpError } = require('./errors');

const MIN_SIZE = 8;
const MAX_SIZE = 512;

function cleanParams(params) {
    const cleaned = { ...params };

    Object.keys(cleaned).forEach(key => {
        if (cleaned[key] && typeof cleaned[key] === 'string') {
            cleaned[key] = cleaned[key].replace(/\.png$/i, '');
        }
    });

    return cleaned;
}

// Missing, non-numeric or non-positive sizes fall back to the default; anything
// else is clamped to MIN_SIZE..MAX_SIZE so a single request can't demand a
// multi-gigabyte render.
function parseSize(sizeParam, fallback = 128) {
    if (!sizeParam) return fallback;

    const parsed = parseInt(sizeParam.replace(/\.png$/i, ''), 10);
    if (isNaN(parsed) || parsed < 1) return fallback;

    return Math.min(Math.max(parsed, MIN_SIZE), MAX_SIZE);
}

function parseDirection(direction) {
    if (direction !== 'left' && direction !== 'right') {
        throw new HttpError(400, 'Direction must be "left" or "right"');
    }
    return direction;
}

module.exports = {
    MIN_SIZE,
    MAX_SIZE,
    cleanParams,
    parseSize,
    parseDirection
};
