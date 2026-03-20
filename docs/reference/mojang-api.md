---
order: 3
title: Mojang API Integration
---

# Mojang API Integration

The Minecraft Heads API does not store any skin textures locally. Every render
starts by resolving the player's identity to a skin texture URL through external
APIs. Java Edition players are resolved through the Mojang API; Bedrock Edition
players are resolved through the GeyserMC API.

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
returns a 404.

**Skipping this step:** If the input is already a UUID (detected by regex), this
step is skipped entirely:

```js
function isUUID(input) {
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    const shortUuidRegex = /^[0-9a-f]{32}$/i;
    return uuidRegex.test(input) || shortUuidRegex.test(input);
}
```

Both dashed (`069a79f4-44e9-4726-a5be-fca90e38aaf5`) and undashed
(`069a79f444e94726a5befca90e38aaf5`) UUID formats are accepted.

### Step 2: UUID to Profile (Textures)

```
GET https://sessionserver.mojang.com/session/minecraft/profile/{uuid}
```

The UUID is passed without dashes. The response contains a `properties` array
with a base64-encoded `textures` value:

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

The `value` field is a base64-encoded JSON object. The API decodes it:

```js
const texturesData = JSON.parse(
    Buffer.from(profileResponse.data.properties[0].value, 'base64').toString()
);
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
            "url": "http://textures.minecraft.net/texture/a1b2c3d4..."
        },
        "CAPE": {
            "url": "http://textures.minecraft.net/texture/e5f6a7b8..."
        }
    }
}
```

The `textures.SKIN.url` field is the direct URL to the skin PNG file.

### Step 3: Download Skin PNG

```
GET http://textures.minecraft.net/texture/{hash}
```

This returns the raw skin PNG as binary data. The API downloads it using Axios
with `responseType: 'arraybuffer'`:

```js
const skinResponse = await axios.get(skinUrl, { responseType: 'arraybuffer' });
const skinBuffer = Buffer.from(skinResponse.data);
```

The skin buffer is then passed directly to the rendering functions.

---

## Complete Java Flow Diagram

```
Username "Notch"
    |
    v
Is it a UUID? -- No -->  GET api.mojang.com/users/profiles/minecraft/Notch
    |                          |
    | (Yes)                    v
    |                     UUID: 069a79f444e94726a5befca90e38aaf5
    |                          |
    v                          v
GET sessionserver.mojang.com/session/minecraft/profile/{uuid}
    |
    v
Decode base64 properties[0].value
    |
    v
Extract textures.SKIN.url
    |
    v
GET textures.minecraft.net/texture/{hash}
    |
    v
Raw skin PNG buffer --> rendering pipeline
```

---

## Bedrock Edition: GeyserMC Lookup

Bedrock Edition players do not use the Mojang API. Instead, the API queries the
**GeyserMC API**, which bridges between Bedrock and Java player data.

### Detecting Bedrock Input

A player is identified as Bedrock if:

- The input **starts with a dot** (`.`): interpreted as a gamertag prefix.
  Example: `.BedrockPlayer`
- The input **starts with `0000`**: interpreted as an XUID.
  Example: `0000000000012345`

```js
function isBedrock(input) {
    return input.startsWith('0000') || input.startsWith('.');
}
```

### Gamertag to XUID

If the input starts with a dot, the API first strips the dot and resolves the
gamertag to an XUID:

```
GET https://api.geysermc.org/v2/xbox/xuid/{gamertag}
```

**Example response:**

```json
{
    "xuid": "0000000000012345"
}
```

### XUID to Skin Data

```
GET https://api.geysermc.org/v2/skin/{xuid}
```

This returns a JSON object with a `skin_url` field (among other data) that
points to the player's skin texture.

The route handlers extract the skin URL with:

```js
const skinUrl = profile.textures?.SKIN?.url || profile.skin_url;
```

The `profile.textures?.SKIN?.url` path handles Java responses; the
`profile.skin_url` path handles Bedrock responses from GeyserMC.

### Graceful Fallback to Steve

If the GeyserMC API returns an empty response (the player has no custom skin)
or if the API call fails entirely, the Bedrock lookup falls back to the default
**Steve** skin:

```js
async function getBedrockProfile(input) {
    try {
        // ... GeyserMC lookup ...

        if (Object.keys(skinResponse.data).length === 0) {
            return getJavaProfile('Steve');
        }

        return skinResponse.data;
    } catch (error) {
        return getJavaProfile('Steve');
    }
}
```

This means Bedrock requests **never produce a hard error** for missing skins.
The worst case is a Steve render, which is the same default Minecraft uses
in-game.

---

## Error Scenarios

| Scenario | Behavior |
| -------- | -------- |
| Username does not exist (Java) | Mojang returns 404; API returns 500 with error JSON |
| UUID does not exist (Java) | Session server returns empty; API returns 500 |
| Mojang API down | HTTP request times out; API returns 500 |
| GeyserMC API down (Bedrock) | Caught by try/catch; falls back to Steve |
| Bedrock player has no skin | Empty response detected; falls back to Steve |
| Invalid UUID format | Mojang returns 400; API returns 500 |

---

## Rate Limits

The Mojang API enforces rate limits on username lookups. The exact limits are
not officially documented but are generally around 600 requests per 10 minutes
per IP. The session server endpoint is less restrictive.

The Minecraft Heads API's 1-hour cache mitigates this: once a player is fetched,
subsequent requests for that player and size combination are served from cache
without touching Mojang at all.

The GeyserMC API has its own rate limits. Check the GeyserMC documentation for
current thresholds.
