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

const { parsePlayer, getSkinInfo, getSkinImage, DEFAULT_SKIN } = require('./minecraft');
const { getCacheKey, getFromCache, saveToCache, recordStats } = require('./database');
const { cleanParams } = require('./urlHelpers');
const { HttpError } = require('./errors');

// Matches the server-side cache lifetime. Fallback images (a stale render or the
// default skin) are only cached briefly so clients pick up a fresh render once
// the upstream recovers.
const CACHE_CONTROL = 'public, max-age=3600';
const FALLBACK_CACHE_CONTROL = 'public, max-age=60';

/**
 * Builds the handler for an endpoint that returns a PNG for a player.
 *
 *   parse(params)                  validates the remaining route params and returns
 *                                  render options, plus `cacheParts` for the cache key
 *   render(skin, skinInfo, opts)   turns the skin PNG into the response PNG
 *   headers(params)                optional extra response headers
 *   defaultOnFailure               if an upstream fails and nothing is cached, render
 *                                  the default skin instead of answering 502
 */
function imageRoute({ endpoint, errorMessage, parse = () => ({}), render, headers, defaultOnFailure = true }) {
    return async (req, res) => {
        try {
            const params = cleanParams(req.params);
            const player = parsePlayer(params.input);
            const options = parse(params);
            const cacheKey = getCacheKey(endpoint, player.id, ...(options.cacheParts || []));

            const cached = await getFromCache(cacheKey).catch(error => {
                console.error('Cache read error:', error);
                return null;
            });

            let image = cached?.fresh ? cached.data : null;
            let fallback = false;

            if (!image) {
                try {
                    const skinInfo = await getSkinInfo(player);
                    const skin = await getSkinImage(skinInfo.skinUrl);
                    image = await render(skin, skinInfo, options);
                    saveToCache(cacheKey, image, 'image/png').catch(error => {
                        console.error('Cache write error:', error);
                    });
                } catch (error) {
                    // An upstream outage, timeout or rate limit shouldn't leave a broken image:
                    // serve the last render, or the default skin for a player we've never
                    // rendered. Neither is written to the cache.
                    if (!isUpstreamFailure(error)) throw error;
                    if (cached) {
                        console.warn(`${errorMessage}, serving stale image: ${describeError(error)}`);
                        image = cached.data;
                    } else if (defaultOnFailure) {
                        console.warn(`${errorMessage}, serving default skin: ${describeError(error)}`);
                        try {
                            image = await render(await getSkinImage(DEFAULT_SKIN.skinUrl), DEFAULT_SKIN, options);
                        } catch {
                            throw error;
                        }
                    } else {
                        throw error;
                    }
                    fallback = true;
                }
            }

            recordStats(player.edition);
            res.set({
                'Content-Type': 'image/png',
                'Cache-Control': fallback ? FALLBACK_CACHE_CONTROL : CACHE_CONTROL,
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

    console.error(`${errorMessage}: ${describeError(error)}`);
    res.status(error instanceof HttpError ? error.status : 500).json({ error: errorMessage });
}

function isUpstreamFailure(error) {
    return error instanceof HttpError && error.status === 502;
}

// One log line per failure; for upstream errors it names the request that failed,
// e.g. "Mojang request failed: timeout of 10000ms exceeded (GET https://...)".
function describeError(error) {
    const cause = error.cause;
    if (cause?.config?.url) {
        return `${error.message}: ${cause.message} (${(cause.config.method || 'get').toUpperCase()} ${cause.config.url})`;
    }
    if (error instanceof HttpError) return error.message;
    return error.stack || String(error);
}

module.exports = { imageRoute };
