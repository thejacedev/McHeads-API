// Shared test setup. Require this before any app module so the database and
// upstream HTTP client are replaced before they're first used.

process.env.SQLITE_PATH = process.env.SQLITE_PATH || ':memory:';
delete process.env.DATABASE_URL;
delete process.env.RATE_LIMIT_PER_MINUTE;

const { createCanvas } = require('canvas');
const http = require('../utils/http');

// Routes upstream GETs to handler(url), which returns { status, data } (or
// nothing for a 404) and may throw to simulate a network failure. Mirrors axios'
// validateStatus behaviour. Returns the list of requested URLs.
function stubUpstream(handler) {
    const calls = [];
    http.get = async (url, config = {}) => {
        calls.push(url);
        const request = { method: 'get', url };
        let result;
        try {
            result = await handler(url);
        } catch (error) {
            error.config = request;
            throw error;
        }
        const { status = 200, data } = result || { status: 404 };
        const accepted = config.validateStatus
            ? config.validateStatus(status)
            : status >= 200 && status < 300;
        if (!accepted) {
            const error = new Error(`Request failed with status code ${status}`);
            error.config = request;
            error.response = { status, data };
            throw error;
        }
        return { status, data };
    };
    return calls;
}

// Builds a skin PNG. `paint(ctx)` draws on a canvas that starts transparent.
function makeSkin({ width = 64, height = 64, paint } = {}) {
    const canvas = createCanvas(width, height);
    const ctx = canvas.getContext('2d');
    if (paint) {
        paint(ctx);
    } else {
        ctx.fillStyle = '#3366cc';
        ctx.fillRect(0, 0, width, height);
    }
    return canvas.toBuffer('image/png');
}

function texturesProperty(skinUrl, model) {
    const textures = skinUrl
        ? { SKIN: { url: skinUrl, ...(model ? { metadata: { model } } : {}) } }
        : {};
    return Buffer.from(JSON.stringify({ textures })).toString('base64');
}

// A Mojang session-server profile response.
function mojangProfile(uuid, skinUrl, model) {
    return {
        id: uuid,
        name: 'Player',
        properties: [{ name: 'textures', value: texturesProperty(skinUrl, model) }]
    };
}

module.exports = { stubUpstream, makeSkin, texturesProperty, mojangProfile };
