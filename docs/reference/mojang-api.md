---
order: 3
title: Mojang API Integration
---

# Mojang API Integration

The Minecraft Heads API has no skin textures of its own. Every render that
isn't already cached starts by resolving the player's identity to a skin texture
URL through external APIs. Java Edition players are resolved through the Mojang
API; Bedrock Edition players are resolved through the GeyserMC API.

All upstream requests go through a shared axios client (`utils/http.js`) with a
5-second timeout and a 1 MB response size limit. The resolved `{ skinUrl, slim }`
for each player is cached in memory for 10 minutes, and downloaded skin PNGs are
cached in memory for 24 hours, keyed by texture URL. Concurrent requests for the
same player or texture share one in-flight lookup, and failed lookups are not
cached.

---

## Java Edition: Three-Step Lookup

Resolving a Java Edition player requires up to three HTTP requests to Mojang's
servers.

### Step 1: Username to UUID

If the input is a **username** (not a UUID), the API first resolves it to a
UUID:

```
GET https://api.mojang.com/users/profiles/minecraft/{username}
```

**Example request:**

```
GET https://api.mojang.com/users/profiles/minecraft/Notch
```

**Example response:**

```json
{
    "name": "Notch",
    "id": "069a79f444e94726a5befca90e38aaf5"
}
```

The `id` field is a UUID without dashes. If the username does not exist, Mojang
returns a 404 (or 204), and the API responds with HTTP 404
`{"error": "Player not found"}`.

**Skipping this step:** If the input is already a UUID (detected by regex), this
step is skipped entirely:

```js
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SHORT_UUID_RE = /^[0-9a-f]{32}$/i;

function isUUID(input) {
    return UUID_RE.test(input) || SHORT_UUID_RE.test(input);
}
```

Both dashed (`069a79f4-44e9-4726-a5be-fca90e38aaf5`) and undashed
(`069a79f444e94726a5befca90e38aaf5`) UUID formats are accepted. UUIDs whose
first 16 hex digits are zero are Floodgate UUIDs and are looked up through
GeyserMC instead (see below).

### Step 2: UUID to Profile (Textures)

```
GET https://sessionserver.mojang.com/session/minecraft/profile/{uuid}
```

The UUID is passed without dashes, in lowercase. If the session server answers
404 or 204, the API responds with HTTP 404. Otherwise the response contains a
`properties` array with a base64-encoded `textures` value:

**Example response:**

```json
{
    "id": "069a79f444e94726a5befca90e38aaf5",
    "name": "Notch",
    "properties": [
        {
            "name": "textures",
            "value": "eyJ0aW1lc3RhbXAiOi4uLiwidGV4dHVyZXMiOnsiU0tJTiI6eyJ1cmwiOiJodHRwOi8vdGV4dHVyZXMubWluZWNyYWZ0Lm5ldC90ZXh0dXJlLy4uLiJ9fX0="
        }
    ]
}
```

The `value` field is a base64-encoded JSON object. The API finds the `textures`
property and decodes it with `parseTextures`. A profile with no `textures`
property gets the default skin:

```js
const textures = profile.properties?.find(property => property.name === 'textures');
return textures ? parseTextures(textures.value) : DEFAULT_SKIN;
```

```js
function parseTextures(value) {
    const skin = JSON.parse(Buffer.from(value, 'base64').toString()).textures?.SKIN;
    if (!skin?.url) return DEFAULT_SKIN;
    return {
        skinUrl: skin.url.replace(/^http:\/\//, 'https://'),
        slim: skin.metadata?.model === 'slim'
    };
}
```

### Decoded Textures Object

The decoded JSON has this structure:

```json
{
    "timestamp": 1234567890000,
    "profileId": "069a79f444e94726a5befca90e38aaf5",
    "profileName": "Notch",
    "textures": {
        "SKIN": {
            "url": "http://textures.minecraft.net/texture/a1b2c3d4...",
            "metadata": { "model": "slim" }
        },
        "CAPE": {
            "url": "http://textures.minecraft.net/texture/e5f6a7b8..."
        }
    }
}
```

The `textures.SKIN.url` field is the direct URL to the skin PNG file; the API
upgrades it from `http://` to `https://`. `textures.SKIN.metadata.model` is
`"slim"` for slim (Alex-style) skins and absent for classic skins; the body
renders use it to draw 3px-wide arms. If there is no `SKIN` entry (the player
uses a default skin), the API uses its built-in default skin (classic Steve).

### Step 3: Download Skin PNG

```
GET https://textures.minecraft.net/texture/{hash}
```

This returns the raw skin PNG as binary data. `getSkinImage` downloads it with
the shared HTTP client and caches the buffer in memory for 24 hours:

```js
function getSkinImage(skinUrl) {
    return skinCache.getOrLoad(skinUrl, async () => {
        try {
            const response = await http.get(skinUrl, { responseType: 'arraybuffer' });
            return Buffer.from(response.data);
        } catch (error) {
            throw upstreamError('Texture server', error);
        }
    });
}
```

The skin buffer is then passed directly to the rendering functions. A failed
download is reported as HTTP 502.

---

## Complete Java Flow Diagram

```
Username "Notch"
    |
    v
Is it a UUID? -- No -->  GET api.mojang.com/users/profiles/minecraft/Notch
    |                          |   (404/204 --> HTTP 404 Player not found)
    | (Yes)                    v
    |                     UUID: 069a79f444e94726a5befca90e38aaf5
    |                          |
    v                          v
GET sessionserver.mojang.com/session/minecraft/profile/{uuid}
    |   (404/204 --> HTTP 404 Player not found)
    v
Decode the base64 "textures" property
    |
    v
Extract textures.SKIN.url (upgraded to https) and metadata.model
    |   (no SKIN entry --> default skin)
    v
GET textures.minecraft.net/texture/{hash}
    |
    v
Raw skin PNG buffer --> rendering pipeline

Any upstream error or 5-second timeout --> HTTP 502
```

---

## Bedrock Edition: GeyserMC Lookup

Bedrock Edition players do not use the Mojang API. Instead, the API queries the
**GeyserMC API**, which bridges between Bedrock and Java player data.

### Detecting Bedrock Input

`parsePlayer` in `utils/minecraft.js` identifies a player as Bedrock if:

- The input **starts with a dot** (`.`): the rest is a gamertag of 1-16
  letters, digits, spaces, `_`, `#` or `-`, starting with a letter or digit.
  Example: `.BedrockPlayer`
- The input is **`0000` followed only by digits**, at least 17 characters in
  total: an XUID with leading zeros stripped.
  Example: `00002535468413142004` (XUID `2535468413142004`)
- The input is a **Floodgate UUID**, a UUID whose first 16 hex digits are zero.
  The XUID is the UUID's low 64 bits.
  Example: `00000000-0000-0000-0009-01febe1ac3f4` (XUID `2535468413142004`)

See [Edition Detection](../getting-started/edition-detection.md) for the full
rules.

### Gamertag to XUID

If the input starts with a dot, the API first strips the dot and resolves the
gamertag to an XUID:

```
GET https://api.geysermc.org/v2/xbox/xuid/{gamertag}
```

**Example response:**

```json
{
    "xuid": 2535468413142004
}
```

If GeyserMC answers 503 with "Unable to find user" (it has never seen the
gamertag), the API responds with HTTP 404 `{"error": "Player not found"}`. Any
other failure is an HTTP 502.

### XUID to Skin Data

```
GET https://api.geysermc.org/v2/skin/{xuid}
```

This returns the player's skin record, with the fields `hash`, `is_steve`,
`last_update`, `signature`, `texture_id` and `value`. The `value` field is a
base64-encoded textures JSON in the same format as Mojang's (including
`metadata.model: "slim"` for slim skins), so it is decoded with the same
`parseTextures` function. `texture_id` is used as a fallback to build the
texture URL:

```js
// An empty object means GeyserMC has no skin stored for this player.
const skin = await getJson(`https://api.geysermc.org/v2/skin/${xuid}`);
if (!skin?.texture_id) return DEFAULT_SKIN;
if (skin.value) return parseTextures(skin.value);
return { skinUrl: `https://textures.minecraft.net/texture/${skin.texture_id}`, slim: false };
```

### Default Skin

If GeyserMC returns an empty object (`{}`), the player has no skin stored and
the API uses its built-in default skin (classic Steve, `DEFAULT_SKIN` in
`utils/minecraft.js`). This is the only case where a Bedrock request falls
back to the default skin; unknown gamertags are a 404 and GeyserMC failures are
a 502, exactly as for Java players.

---

## Error Scenarios

| Scenario | Behavior |
| -------- | -------- |
| Malformed input (any edition) | Rejected before any upstream call; API returns 400 `Invalid player identifier` |
| Username does not exist (Java) | Mojang returns 404 or 204; API returns 404 `Player not found` |
| UUID does not exist (Java) | Session server returns 404 or 204; API returns 404 `Player not found` |
| Java player has no custom skin | No `SKIN` texture in the profile; default skin is used |
| Mojang API down or slow | Request fails or times out after 5 seconds; API returns 502 with the endpoint's generic message |
| Gamertag unknown to GeyserMC (Bedrock) | GeyserMC returns 503 "Unable to find user"; API returns 404 `Player not found` |
| GeyserMC API down (Bedrock) | API returns 502 with the endpoint's generic message |
| Bedrock player has no skin | GeyserMC returns `{}`; default skin is used |
| Texture server down | API returns 502 with the endpoint's generic message |

---

## Rate Limits

The Mojang API enforces rate limits on username lookups. The exact limits are
not officially documented but are generally around 600 requests per 10 minutes
per IP. The session server endpoint is less restrictive.

The Minecraft Heads API's caches mitigate this: once a render is cached,
subsequent requests for that player and size combination are served from the
database for 1 hour without touching Mojang at all, and the resolved skin URL
is reused from memory for 10 minutes across all endpoints and sizes.

The GeyserMC API has its own rate limits. Check the GeyserMC documentation for
current thresholds.
