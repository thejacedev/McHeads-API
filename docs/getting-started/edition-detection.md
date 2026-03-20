---
title: Edition Detection
order: 4
---

# Edition Detection

The Minecraft Heads API supports both Java Edition and Bedrock Edition players. Since the two editions use completely different account systems and skin APIs, the API must determine which edition a player belongs to before it can fetch their skin. This is done automatically based on the format of the input string.

## Detection Rules

The API applies three rules, evaluated in order:

| Rule | Condition | Detected Edition |
|---|---|---|
| 1 | Input starts with `0000` | Bedrock (XUID) |
| 2 | Input starts with `.` (a dot) | Bedrock (gamertag) |
| 3 | Anything else | Java (username or UUID) |

There is no ambiguity between the formats. Java usernames cannot start with `0000` (Mojang usernames are 3-16 alphanumeric characters and underscores), and they cannot start with a dot. Java UUIDs are hexadecimal and will not start with `0000` in practice because the UUID version nibble occupies a different position.

The detection function is defined in `utils/minecraft.js`:

```javascript
function isBedrock(input) {
    return input.startsWith('0000') || input.startsWith('.');
}
```

## Java Edition

### Username Resolution

When the input does not match any Bedrock pattern, it is treated as a Java Edition identifier. If the input is not a UUID, the API resolves it to a UUID through the Mojang API:

```
GET https://api.mojang.com/users/profiles/minecraft/{username}
```

This returns the player's UUID, which is then used to fetch their full profile.

### UUID Formats

The API accepts Java UUIDs in two formats:

- **With dashes:** `069a79f4-44e9-4726-a5be-fca90e38aaf5`
- **Without dashes:** `069a79f444e94726a5befca90e38aaf5`

Both are recognized as UUIDs using a regex check:

```javascript
function isUUID(input) {
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    const shortUuidRegex = /^[0-9a-f]{32}$/i;
    return uuidRegex.test(input) || shortUuidRegex.test(input);
}
```

If the input is already a UUID, the username-to-UUID resolution step is skipped, and the API goes directly to the session server.

### Profile and Skin Fetching

The player's skin texture URL is retrieved from the Mojang session server:

```
GET https://sessionserver.mojang.com/session/minecraft/profile/{uuid}
```

The response contains a base64-encoded `textures` property that, when decoded, includes the skin URL:

```json
{
    "textures": {
        "SKIN": {
            "url": "https://textures.minecraft.net/texture/..."
        }
    }
}
```

The API decodes this and extracts the skin URL for rendering.

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

An XUID (Xbox User ID) is a numeric identifier assigned to every Xbox Live account. When the input starts with `0000`, the API treats it as a Bedrock XUID and fetches the skin directly:

```
GET https://api.geysermc.org/v2/skin/{xuid}
```

**Example:**

```bash
curl -o head.png https://api.mcheads.org/head/0000123456789/128
```

The `0000` prefix is a convention used by this API to signal that the input is a Bedrock XUID rather than a Java identifier. Real XUIDs are long numeric strings; the prefix ensures they are not mistaken for Java UUIDs or usernames.

### Gamertag Lookup

When the input starts with a dot (`.`), the API strips the dot and treats the remainder as an Xbox Live gamertag. It first resolves the gamertag to an XUID:

```
GET https://api.geysermc.org/v2/xbox/xuid/{gamertag}
```

Then fetches the skin using that XUID:

```
GET https://api.geysermc.org/v2/skin/{xuid}
```

**Example:**

```bash
curl -o head.png https://api.mcheads.org/head/.ExampleGamertag/128
```

The dot prefix is required. Without it, `ExampleGamertag` would be interpreted as a Java username and sent to the Mojang API, which would fail if no Java player exists with that name.

### Gamertags with Spaces

Xbox Live gamertags can contain spaces. When using the API via a URL, encode spaces as `%20`:

```bash
curl -o head.png "https://api.mcheads.org/head/.Example%20Gamertag/128"
```

### Steve Fallback

If a Bedrock player has no skin data available (the GeyserMC API returns an empty response), or if the GeyserMC API request fails entirely, the API falls back to the default Steve skin. This is done by requesting the Java profile for the username "Steve":

```javascript
if (Object.keys(skinResponse.data).length === 0) {
    return getJavaProfile('Steve');
}
```

This ensures that Bedrock requests always return a valid image rather than an error. The Steve fallback applies in two cases:

1. **Empty skin data** -- The GeyserMC API responds successfully but the skin data object is empty. This can happen for players who have never changed their default skin.

2. **API error** -- The GeyserMC API is unreachable or returns an error. The `catch` block also falls back to Steve:

```javascript
async function getBedrockProfile(input) {
    try {
        // ... resolve XUID and fetch skin ...
    } catch (error) {
        return getJavaProfile('Steve');
    }
}
```

This means Bedrock requests are more resilient than Java requests. A Java request for a nonexistent player will return a 500 error, but a Bedrock request for any input will always return an image.

## How the API Uses Edition Internally

Once the edition is detected, it is passed through the render pipeline for two purposes:

### 1. Profile Resolution

The `getProfile` function routes to the correct upstream API:

```javascript
async function getProfile(input) {
    const edition = isBedrock(input) ? 'bedrock' : 'java';

    if (edition === 'bedrock') {
        return { profile: await getBedrockProfile(input), edition };
    } else {
        return { profile: await getJavaProfile(input), edition };
    }
}
```

### 2. Usage Statistics

Every render records which edition was used, so the stats endpoints can report Java and Bedrock usage separately:

```javascript
recordStats('head', input, edition);
```

The stats are accessible at `/allstats` (Java), `/allstatsbedrock` (Bedrock), and `/allstatsSorted` (both, sorted by count).

## Decision Flowchart

Here is the complete decision path for any input:

```
Input received
    |
    +-- Starts with "0000"?
    |       YES --> Bedrock XUID
    |               Fetch skin from GeyserMC: /v2/skin/{xuid}
    |               Empty response? --> Fall back to Steve
    |
    +-- Starts with "."?
    |       YES --> Bedrock gamertag
    |               Strip the dot
    |               Resolve XUID from GeyserMC: /v2/xbox/xuid/{gamertag}
    |               Fetch skin from GeyserMC: /v2/skin/{xuid}
    |               Empty response or error? --> Fall back to Steve
    |
    +-- Otherwise
            Java Edition
            Is it a UUID? (32 hex chars or UUID with dashes)
                YES --> Fetch profile from Mojang session server
                NO  --> Resolve username to UUID via Mojang API
                        Fetch profile from Mojang session server
            Decode base64 textures property
            Extract skin URL
```

## Edge Cases

### MHF Heads

MHF preset names (like `MHF_Creeper`, `MHF_Skeleton`) do not start with `0000` or `.`, so they are routed through the Java path. These are valid Mojang usernames with pre-assigned UUIDs that resolve to well-known mob and item textures.

### Case Sensitivity

Java usernames are case-insensitive at the Mojang API level. `Notch`, `notch`, and `NOTCH` all resolve to the same player. Xbox Live gamertags are also case-insensitive.

### Numeric Usernames

A Java username that happens to be entirely numeric (e.g., `12345`) does not start with `0000` or `.`, so it is correctly routed to the Java path. Only inputs beginning with exactly `0000` are treated as Bedrock XUIDs.
