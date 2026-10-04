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

const http = require('./http');
const { HttpError } = require('./errors');
const { TtlCache } = require('./memoryCache');

// Classic-model Steve, used when a player has no custom skin.
const DEFAULT_SKIN = {
    skinUrl: 'https://textures.minecraft.net/texture/31f477eb1a7beee631c2ca64d06f8f68fa93a3386d04452ab27f43acdf1b60cb',
    slim: false
};

const USERNAME_RE = /^[A-Za-z0-9_]{1,16}$/;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SHORT_UUID_RE = /^[0-9a-f]{32}$/i;
// "0000" followed by a numeric XUID. Always longer than 16 characters, so it
// can't collide with a Java username.
const PREFIXED_XUID_RE = /^0000\d{13,}$/;
// GeyserMC rejects gamertags longer than 16 characters.
const GAMERTAG_RE = /^[\p{L}\p{N}][\p{L}\p{N} _#-]{0,15}$/u;

// Profile lookups are rate limited upstream, so they're kept for a while; texture
// URLs are content-addressed, so a downloaded skin never changes.
const profileCache = new TtlCache({ ttlMs: 30 * 60 * 1000, maxEntries: 20000 });
const skinCache = new TtlCache({ ttlMs: 24 * 60 * 60 * 1000, maxEntries: 500 });

// Hosts that answered 429, mapped to when they may be called again. Calling a
// rate-limited API only keeps the limit in place, so until then requests fail
// fast (and the route falls back to cached images).
const cooldowns = new Map();
const DEFAULT_COOLDOWN_MS = 30 * 1000;
const MAX_COOLDOWN_MS = 5 * 60 * 1000;

function isUUID(input) {
    return UUID_RE.test(input) || SHORT_UUID_RE.test(input);
}

function invalidInput() {
    return new HttpError(400, 'Invalid player identifier');
}

/**
 * Validates a player identifier from the URL and works out which edition and
 * lookup it needs. `id` is a normalized form used for cache keys.
 */
function parsePlayer(input) {
    if (typeof input !== 'string') throw invalidInput();

    if (input.startsWith('.')) {
        const gamertag = input.slice(1);
        if (!GAMERTAG_RE.test(gamertag)) throw invalidInput();
        return { edition: 'bedrock', type: 'gamertag', value: gamertag, id: `gt:${gamertag.toLowerCase()}` };
    }

    if (isUUID(input)) {
        const uuid = input.replace(/-/g, '').toLowerCase();
        // Floodgate UUIDs carry the player's XUID in their low 64 bits.
        if (uuid.startsWith('0000000000000000')) {
            const xuid = BigInt(`0x${uuid.slice(16)}`).toString();
            return { edition: 'bedrock', type: 'xuid', value: xuid, id: `xuid:${xuid}` };
        }
        return { edition: 'java', type: 'uuid', value: uuid, id: `uuid:${uuid}` };
    }

    if (PREFIXED_XUID_RE.test(input)) {
        const xuid = BigInt(input).toString();
        return { edition: 'bedrock', type: 'xuid', value: xuid, id: `xuid:${xuid}` };
    }

    if (USERNAME_RE.test(input)) {
        return { edition: 'java', type: 'username', value: input, id: `name:${input.toLowerCase()}` };
    }

    throw invalidInput();
}

// Decodes a base64 "textures" property (Mojang and GeyserMC use the same format).
function parseTextures(value) {
    const skin = JSON.parse(Buffer.from(value, 'base64').toString()).textures?.SKIN;
    if (!skin?.url) return DEFAULT_SKIN;
    return {
        skinUrl: skin.url.replace(/^http:\/\//, 'https://'),
        slim: skin.metadata?.model === 'slim'
    };
}

// GET through the shared client, honouring and starting rate-limit cooldowns.
async function upstreamGet(url, config) {
    const { host } = new URL(url);
    const until = cooldowns.get(host) || 0;
    if (until > Date.now()) {
        throw new HttpError(502, `${host} is rate limiting us, retrying in ${Math.ceil((until - Date.now()) / 1000)}s`);
    }

    try {
        return await http.get(url, config);
    } catch (error) {
        if (error.response?.status === 429) {
            const retryAfter = Number(error.response.headers?.['retry-after']);
            const ms = retryAfter > 0 ? Math.min(retryAfter * 1000, MAX_COOLDOWN_MS) : DEFAULT_COOLDOWN_MS;
            cooldowns.set(host, Date.now() + ms);
            console.warn(`${host} answered 429; pausing requests to it for ${Math.round(ms / 1000)}s`);
        }
        throw error;
    }
}

// GETs JSON, resolving to null when the upstream answers with one of notFound.
async function getJson(url, notFound = []) {
    const response = await upstreamGet(url, {
        validateStatus: status => status === 200 || notFound.includes(status)
    });
    return response.status === 200 ? response.data : null;
}

function upstreamError(service, error) {
    if (error instanceof HttpError) return error;
    return new HttpError(502, `${service} request failed`, { cause: error });
}

async function fetchJavaSkin(player) {
    try {
        let uuid = player.value;
        if (player.type === 'username') {
            const account = await getJson(
                `https://api.mojang.com/users/profiles/minecraft/${encodeURIComponent(player.value)}`,
                [204, 404]
            );
            if (!account?.id) throw new HttpError(404, 'Player not found');
            uuid = account.id;
        }

        const profile = await getJson(
            `https://sessionserver.mojang.com/session/minecraft/profile/${uuid}`,
            [204, 404]
        );
        if (!profile) throw new HttpError(404, 'Player not found');

        // Players on a default skin have no SKIN entry in their textures.
        const textures = profile.properties?.find(property => property.name === 'textures');
        return textures ? parseTextures(textures.value) : DEFAULT_SKIN;
    } catch (error) {
        throw upstreamError('Mojang', error);
    }
}

async function fetchBedrockSkin(player) {
    try {
        let xuid = player.value;
        if (player.type === 'gamertag') {
            // GeyserMC answers 503 "Unable to find user" for gamertags it hasn't seen.
            const account = await getJson(
                `https://api.geysermc.org/v2/xbox/xuid/${encodeURIComponent(player.value)}`
            ).catch(error => {
                if (/unable to find user/i.test(error.response?.data?.message || '')) return null;
                throw error;
            });
            if (!account?.xuid) throw new HttpError(404, 'Player not found');
            xuid = String(account.xuid);
        }

        // An empty object means GeyserMC has no skin stored for this player.
        const skin = await getJson(`https://api.geysermc.org/v2/skin/${xuid}`);
        if (!skin?.texture_id) return DEFAULT_SKIN;
        if (skin.value) return parseTextures(skin.value);
        return { skinUrl: `https://textures.minecraft.net/texture/${skin.texture_id}`, slim: false };
    } catch (error) {
        throw upstreamError('GeyserMC', error);
    }
}

/**
 * Resolves a parsed player to { skinUrl, slim }. Throws HttpError 404 when the
 * player doesn't exist and 502 when an upstream API fails.
 */
function getSkinInfo(player) {
    return profileCache.getOrLoad(player.id, () =>
        player.edition === 'bedrock' ? fetchBedrockSkin(player) : fetchJavaSkin(player)
    );
}

function getSkinImage(skinUrl) {
    return skinCache.getOrLoad(skinUrl, async () => {
        try {
            const response = await upstreamGet(skinUrl, { responseType: 'arraybuffer' });
            return Buffer.from(response.data);
        } catch (error) {
            throw upstreamError('Texture server', error);
        }
    });
}

module.exports = {
    DEFAULT_SKIN,
    isUUID,
    parsePlayer,
    getSkinInfo,
    getSkinImage
};
