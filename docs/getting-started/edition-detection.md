---
title: Edition Detection
order: 4
---

# Edition Detection

The Minecraft Heads API supports both Java Edition and Bedrock Edition players. Since the two editions use completely different account systems and skin APIs, the API must determine which edition a player belongs to before it can fetch their skin. This is done automatically based on the format of the input string.

## Detection Rules

The API applies these rules, evaluated in order:

| Rule | Condition | Detected Edition |
|---|---|---|
| 1 | Input starts with `.` (a dot) | Bedrock (gamertag) |
| 2 | A UUID (dashed or 32 hex digits) whose first 16 hex digits are all zero | Bedrock (Floodgate UUID) |
| 3 | Any other UUID | Java (UUID) |
| 4 | `0000` followed only by digits, at least 17 characters in total | Bedrock (XUID) |
| 5 | Matches `^[A-Za-z0-9_]{1,16}$` | Java (username) |
| 6 | Anything else | Rejected with HTTP 400 |

Invalid input never reaches Mojang or GeyserMC. It is rejected immediately:

```json
{
    "error": "Invalid player identifier"
}
```

There is no ambiguity between the formats:

- Java usernames are at most 16 characters, while a `0000`-prefixed XUID is always at least 17, so the two can't collide. Usernames may contain digits and may start with `0000` (`0000abc` and `00001234` are both treated as Java usernames).
- A Java UUID that merely begins with `0000` (for example `0000f4c5-d1e9-4b0c-8c3a-3f2e1d0c9b8a`) stays Java. Only UUIDs whose entire first half (16 hex digits) is zero are treated as Floodgate UUIDs.
- Neither Java usernames nor UUIDs can start with a dot.

The detection function is `parsePlayer` in `utils/minecraft.js`:

```javascript
const USERNAME_RE = /^[A-Za-z0-9_]{1,16}$/;
const PREFIXED_XUID_RE = /^0000\d{13,}$/;
const GAMERTAG_RE = /^[\p{L}\p{N}][\p{L}\p{N} _#-]{0,15}$/u;

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
```

The `id` field is a normalized form of the player (`name:<lowercased username>`, `uuid:<32 lowercase hex>`, `xuid:<digits>` or `gt:<lowercased gamertag>`) that is used in cache keys.

## Java Edition

### Username Resolution

Java usernames must match `^[A-Za-z0-9_]{1,16}$`. If the input is a username rather than a UUID, the API resolves it to a UUID through the Mojang API:

```
GET https://api.mojang.com/users/profiles/minecraft/{username}
```

This returns the player's UUID, which is then used to fetch their full profile. If Mojang answers 404 or 204, the player does not exist and the API responds with HTTP 404 `{"error":"Player not found"}`.

### UUID Formats

The API accepts Java UUIDs in two formats:

- **With dashes:** `069a79f4-44e9-4726-a5be-fca90e38aaf5`
- **Without dashes:** `069a79f444e94726a5befca90e38aaf5`

Both are recognized as UUIDs using a regex check:

```javascript
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SHORT_UUID_RE = /^[0-9a-f]{32}$/i;

function isUUID(input) {
    return UUID_RE.test(input) || SHORT_UUID_RE.test(input);
}
```

If the input is already a UUID, the username-to-UUID resolution step is skipped, and the API goes directly to the session server. Dashes are removed and the UUID is lowercased first.

### Profile and Skin Fetching

The player's skin texture URL is retrieved from the Mojang session server:

```
GET https://sessionserver.mojang.com/session/minecraft/profile/{uuid}
```

The response contains a base64-encoded `textures` property that, when decoded, includes the skin URL and, for slim (Alex-style) skins, the model:

```json
{
    "textures": {
        "SKIN": {
            "url": "http://textures.minecraft.net/texture/...",
            "metadata": { "model": "slim" }
        }
    }
}
```

The API decodes this, upgrades the URL from `http://` to `https://`, and records whether the model is slim so the body renders can draw 3px arms. If the profile has no `SKIN` texture (the player uses a default skin), the API uses its built-in default skin instead. If the session server answers 404 or 204, the API responds with HTTP 404.

### Examples

```bash
# By username
curl -o head.png https://api.mcheads.org/head/Notch/128

# By UUID (no dashes)
curl -o head.png https://api.mcheads.org/head/069a79f444e94726a5befca90e38aaf5/128

# By UUID (with dashes)
curl -o head.png https://api.mcheads.org/head/069a79f4-44e9-4726-a5be-fca90e38aaf5/128
```

All three produce the same result.

## Bedrock Edition

Bedrock Edition players use Xbox Live accounts. Their skins are managed separately from Java Edition and are accessed through the GeyserMC API.

### XUID Lookup

An XUID (Xbox User ID) is a numeric identifier assigned to every Xbox Live account. A real XUID is 16 digits long, for example `2535468413142004`. To pass one to the API, prefix it with `0000`:

```
00002535468413142004
```

The input must be `0000` followed only by digits, with a total length of at least 17 characters. Leading zeros are stripped, and the API fetches the skin directly:

```
GET https://api.geysermc.org/v2/skin/{xuid}
```

**Example:**

```bash
curl -o head.png https://api.mcheads.org/head/00002535468413142004/128
```

The `0000` prefix is a convention used by this API to signal that the input is a Bedrock XUID rather than a Java identifier. Because the prefixed form is longer than 16 characters, it can never be mistaken for a Java username.

### Floodgate UUIDs

Servers running Floodgate give Bedrock players a Java-style UUID whose first 16 hex digits are zero and whose low 64 bits are the player's XUID. The API recognizes these in both dashed and undashed form and looks the player up as Bedrock:

```bash
# XUID 2535468413142004 (0x000901febe1ac3f4)
curl -o head.png https://api.mcheads.org/head/00000000-0000-0000-0009-01febe1ac3f4/128
curl -o head.png https://api.mcheads.org/head/0000000000000000000901febe1ac3f4/128
```

### Gamertag Lookup

When the input starts with a dot (`.`), the API strips the dot and treats the remainder as an Xbox Live gamertag. The gamertag must be 1 to 16 characters, start with a letter or digit, and contain only letters, digits, spaces, `_`, `#` and `-`. The API first resolves the gamertag to an XUID:

```
GET https://api.geysermc.org/v2/xbox/xuid/{gamertag}
```

Then fetches the skin using that XUID:

```
GET https://api.geysermc.org/v2/skin/{xuid}
```

If GeyserMC answers 503 with "Unable to find user" (it has never seen that gamertag), the API responds with HTTP 404 `{"error":"Player not found"}`.

**Example:**

```bash
curl -o head.png https://api.mcheads.org/head/.ExampleGamertag/128
```

The dot prefix is required. Without it, `ExampleGamertag` would be interpreted as a Java username and sent to the Mojang API, which would return 404 if no Java player exists with that name.

### Gamertags with Spaces

Xbox Live gamertags can contain spaces. When using the API via a URL, encode spaces as `%20`:

```bash
curl -o head.png "https://api.mcheads.org/head/.Example%20Gamertag/128"
```

### Bedrock Skin Data

The GeyserMC `/v2/skin/{xuid}` record has the fields `hash`, `is_steve`, `last_update`, `signature`, `texture_id` and `value`. The `value` field is a base64-encoded textures JSON in the same format as Mojang's (including `metadata.model: "slim"` for slim skins), so it is decoded the same way. If `value` is missing, the API builds the URL from `texture_id`:

```javascript
const skin = await getJson(`https://api.geysermc.org/v2/skin/${xuid}`);
if (!skin?.texture_id) return DEFAULT_SKIN;
if (skin.value) return parseTextures(skin.value);
return { skinUrl: `https://textures.minecraft.net/texture/${skin.texture_id}`, slim: false };
```

## Default Skin and Errors

The API never substitutes another player's skin. A built-in default skin (classic Steve, defined as `DEFAULT_SKIN` in `utils/minecraft.js`) is used only when the player exists but has no custom skin:

```javascript
const DEFAULT_SKIN = {
    skinUrl: 'https://textures.minecraft.net/texture/31f477eb1a7beee631c2ca64d06f8f68fa93a3386d04452ab27f43acdf1b60cb',
    slim: false
};
```

- **Java** -- the session server profile has no `SKIN` texture.
- **Bedrock** -- GeyserMC returns an empty object (`{}`) for the XUID.

Every other failure is reported as an error, the same way for both editions:

| Situation | HTTP Status | Response |
|---|---|---|
| Input doesn't match any format | 400 | `{"error": "Invalid player identifier"}` |
| Player doesn't exist (Mojang 404/204, GeyserMC 503 "Unable to find user") | 404 | `{"error": "Player not found"}` |
| Mojang, GeyserMC or the texture server fails or times out (5 seconds) | 502 | The endpoint's generic message, e.g. `{"error": "Failed to render head"}` |

## How the API Uses Edition Internally

Once the edition is detected, it is passed through the render pipeline for two purposes:

### 1. Profile Resolution

The `getSkinInfo` function routes to the correct upstream API and returns `{ skinUrl, slim }`. Results are kept in an in-memory cache for 10 minutes, keyed by the normalized player `id`:

```javascript
function getSkinInfo(player) {
    return profileCache.getOrLoad(player.id, () =>
        player.edition === 'bedrock' ? fetchBedrockSkin(player) : fetchJavaSkin(player)
    );
}
```

### 2. Usage Statistics

Every image served records which edition was used, including images served from the cache, so the stats endpoints can report Java and Bedrock usage separately:

```javascript
recordStats(player.edition);
```

The stats are accessible at `/allstats` (Java), `/allstatsbedrock` (Bedrock), and `/allstatsSorted` (both, sorted by count).

## Decision Flowchart

Here is the complete decision path for any input:

```
Input received
    |
    +-- Starts with "."?
    |       YES --> Valid gamertag after the dot? NO --> 400
    |               Bedrock gamertag
    |               Resolve XUID from GeyserMC: /v2/xbox/xuid/{gamertag}
    |                   "Unable to find user"? --> 404
    |               Fetch skin from GeyserMC: /v2/skin/{xuid}
    |               Empty response? --> Default skin
    |
    +-- UUID (32 hex chars or UUID with dashes)?
    |       First 16 hex digits zero?
    |           YES --> Bedrock (Floodgate), XUID = low 64 bits
    |                   Fetch skin from GeyserMC: /v2/skin/{xuid}
    |                   Empty response? --> Default skin
    |           NO  --> Java UUID
    |                   Fetch profile from Mojang session server
    |
    +-- "0000" + digits, 17+ characters?
    |       YES --> Bedrock XUID (leading zeros stripped)
    |               Fetch skin from GeyserMC: /v2/skin/{xuid}
    |               Empty response? --> Default skin
    |
    +-- Matches ^[A-Za-z0-9_]{1,16}$?
    |       YES --> Java username
    |               Resolve username to UUID via Mojang API (404/204 --> 404)
    |               Fetch profile from Mojang session server (404/204 --> 404)
    |               Decode base64 textures property
    |               No SKIN texture? --> Default skin
    |               Extract skin URL and model
    |
    +-- Otherwise --> 400 Invalid player identifier

Any upstream failure or timeout --> 502
```

## Edge Cases

### MHF Heads

MHF preset names (like `MHF_Creeper`, `MHF_Skeleton`) are valid Java usernames, so they are routed through the Java path. These are Mojang accounts whose skins show well-known mob and item textures.

### Case Sensitivity

Java usernames are case-insensitive at the Mojang API level. `Notch`, `notch`, and `NOTCH` all resolve to the same player, and the API lowercases usernames in its cache keys so they share cache entries. Xbox Live gamertags are also case-insensitive and are lowercased in cache keys the same way.

### Numeric Usernames

A Java username that is entirely numeric (e.g., `12345`) or starts with `0000` (e.g., `00001234`) is routed to the Java path as long as it is 16 characters or fewer. Only `0000` followed by digits with a total length of at least 17 is treated as a Bedrock XUID.

### Invalid Input

Inputs that fit none of the formats -- usernames longer than 16 characters or containing spaces or hyphens, a bare `.`, or a dot followed by something that doesn't start with a letter or digit -- are rejected with HTTP 400 before any upstream request is made.
