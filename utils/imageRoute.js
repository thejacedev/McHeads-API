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

const { parsePlayer, getSkinInfo, getSkinImage } = require('./minecraft');
const { getCacheKey, getFromCache, saveToCache, recordStats } = require('./database');
const { cleanParams } = require('./urlHelpers');
const { HttpError } = require('./errors');

// Matches the server-side cache lifetime.
const CACHE_CONTROL = 'public, max-age=3600';

/**
 * Builds the handler for an endpoint that returns a PNG for a player.
 *
 *   parse(params)                  validates the remaining route params and returns
 *                                  render options, plus `cacheParts` for the cache key
 *   render(skin, skinInfo, opts)   turns the skin PNG into the response PNG
 *   headers(params)                optional extra response headers
 */
function imageRoute({ endpoint, errorMessage, parse = () => ({}), render, headers }) {
    return async (req, res) => {
        try {
            const params = cleanParams(req.params);
            const player = parsePlayer(params.input);
            const options = parse(params);
            const cacheKey = getCacheKey(endpoint, player.id, ...(options.cacheParts || []));

            let image = await getFromCache(cacheKey).catch(error => {
                console.error('Cache read error:', error);
                return null;
            });

            if (!image) {
                const skinInfo = await getSkinInfo(player);
                const skin = await getSkinImage(skinInfo.skinUrl);
                image = await render(skin, skinInfo, options);
                saveToCache(cacheKey, image, 'image/png').catch(error => {
                    console.error('Cache write error:', error);
                });
            }

            recordStats(player.edition);
            res.set({
                'Content-Type': 'image/png',
                'Cache-Control': CACHE_CONTROL,
                ...(headers ? headers(params) : {})
            });
            res.send(image);
        } catch (error) {
            sendError(res, error, errorMessage);
        }
    };
}

// Client errors (bad input, unknown player) are reported as-is; anything else is
// logged and answered with the endpoint's generic message.
function sendError(res, error, errorMessage) {
    if (error instanceof HttpError && error.status < 500) {
        return res.status(error.status).json({ error: error.message });
    }

    console.error(`${errorMessage}:`, error.cause || error);
    res.status(error instanceof HttpError ? error.status : 500).json({ error: errorMessage });
}

module.exports = { imageRoute };
