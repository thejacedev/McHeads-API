---
title: MHF Preset Heads
order: 8
---

# MHF Preset Heads

Returns a JSON mapping of 24 MHF (Minecraft Head Format) preset UUIDs to their display names. These are special UUIDs associated with iconic Minecraft mob and character skins that can be used with any render endpoint to generate images of non-player entities.

## Endpoint

```
GET /minecraft/mhf
```

## Parameters

This endpoint takes no parameters.

## How It Works

The MHF heads are a hardcoded dictionary of UUID-to-name mappings stored in `utils/mhfHeads.js`. When the endpoint is called, the entire dictionary is returned as a JSON object. No database queries or external API calls are made beyond recording the request in usage statistics.

Each call is tracked as a `java` edition stat with the input `"all"`.

## Response

| Header | Value |
|--------|-------|
| `Content-Type` | `application/json` |

### Response Shape

```json
{
  "<uuid>": "<name>",
  "<uuid>": "<name>",
  ...
}
```

The response is a flat JSON object where each key is a 32-character UUID (without dashes) and each value is the MHF display name string.

### Full Response

The endpoint returns all 24 MHF presets:

```json
{
  "c06f89064c8a49119c29ea1dbd1aab82": "MHF_Steve",
  "f7c77d6e15b5a8d3f5b9a8b5c5d2f8a4": "MHF_Alex",
  "f4254a8e93e4455b8c8a6b6b6f6d6e6f": "MHF_Creeper",
  "8b6a72138d69fbbd2fea3fa251cabd87": "MHF_Zombie",
  "c37b40e6c6b3b5f8d5e7f8a9b0c1d2e3": "MHF_Skeleton",
  "d4c9b2f8e7a6b5c4d3e2f1a0b9c8d7e6": "MHF_Spider",
  "a9b8c7d6e5f4a3b2c1d0e9f8a7b6c5d4": "MHF_Enderman",
  "b8c7d6e5f4a3b2c1d0e9f8a7b6c5d4e3": "MHF_Slime",
  "c7d6e5f4a3b2c1d0e9f8a7b6c5d4e3f2": "MHF_Ghast",
  "d6e5f4a3b2c1d0e9f8a7b6c5d4e3f2a1": "MHF_Blaze",
  "e5f4a3b2c1d0e9f8a7b6c5d4e3f2a1b0": "MHF_Pig",
  "f4a3b2c1d0e9f8a7b6c5d4e3f2a1b0c9": "MHF_Cow",
  "a3b2c1d0e9f8a7b6c5d4e3f2a1b0c9d8": "MHF_Chicken",
  "b2c1d0e9f8a7b6c5d4e3f2a1b0c9d8e7": "MHF_Sheep",
  "c1d0e9f8a7b6c5d4e3f2a1b0c9d8e7f6": "MHF_Squid",
  "d0e9f8a7b6c5d4e3f2a1b0c9d8e7f6a5": "MHF_Villager",
  "e9f8a7b6c5d4e3f2a1b0c9d8e7f6a5b4": "MHF_Golem",
  "f8a7b6c5d4e3f2a1b0c9d8e7f6a5b4c3": "MHF_Ocelot",
  "a7b6c5d4e3f2a1b0c9d8e7f6a5b4c3d2": "MHF_Herobrine",
  "b6c5d4e3f2a1b0c9d8e7f6a5b4c3d2e1": "MHF_LavaSlime",
  "c5d4e3f2a1b0c9d8e7f6a5b4c3d2e1f0": "MHF_Mooshroom",
  "d4e3f2a1b0c9d8e7f6a5b4c3d2e1f0a9": "MHF_CaveSpider",
  "e3f2a1b0c9d8e7f6a5b4c3d2e1f0a9b8": "MHF_Wolf",
  "f2a1b0c9d8e7f6a5b4c3d2e1f0a9b8c7": "MHF_Witch"
}
```

### Available Presets

| UUID | Name | Category |
|------|------|----------|
| `c06f89064c8a49119c29ea1dbd1aab82` | MHF_Steve | Player |
| `f7c77d6e15b5a8d3f5b9a8b5c5d2f8a4` | MHF_Alex | Player |
| `f4254a8e93e4455b8c8a6b6b6f6d6e6f` | MHF_Creeper | Hostile Mob |
| `8b6a72138d69fbbd2fea3fa251cabd87` | MHF_Zombie | Hostile Mob |
| `c37b40e6c6b3b5f8d5e7f8a9b0c1d2e3` | MHF_Skeleton | Hostile Mob |
| `d4c9b2f8e7a6b5c4d3e2f1a0b9c8d7e6` | MHF_Spider | Hostile Mob |
| `a9b8c7d6e5f4a3b2c1d0e9f8a7b6c5d4` | MHF_Enderman | Hostile Mob |
| `b8c7d6e5f4a3b2c1d0e9f8a7b6c5d4e3` | MHF_Slime | Hostile Mob |
| `c7d6e5f4a3b2c1d0e9f8a7b6c5d4e3f2` | MHF_Ghast | Hostile Mob |
| `d6e5f4a3b2c1d0e9f8a7b6c5d4e3f2a1` | MHF_Blaze | Hostile Mob |
| `d4e3f2a1b0c9d8e7f6a5b4c3d2e1f0a9` | MHF_CaveSpider | Hostile Mob |
| `f2a1b0c9d8e7f6a5b4c3d2e1f0a9b8c7` | MHF_Witch | Hostile Mob |
| `b6c5d4e3f2a1b0c9d8e7f6a5b4c3d2e1` | MHF_LavaSlime | Hostile Mob |
| `e5f4a3b2c1d0e9f8a7b6c5d4e3f2a1b0` | MHF_Pig | Passive Mob |
| `f4a3b2c1d0e9f8a7b6c5d4e3f2a1b0c9` | MHF_Cow | Passive Mob |
| `a3b2c1d0e9f8a7b6c5d4e3f2a1b0c9d8` | MHF_Chicken | Passive Mob |
| `b2c1d0e9f8a7b6c5d4e3f2a1b0c9d8e7` | MHF_Sheep | Passive Mob |
| `c1d0e9f8a7b6c5d4e3f2a1b0c9d8e7f6` | MHF_Squid | Passive Mob |
| `d0e9f8a7b6c5d4e3f2a1b0c9d8e7f6a5` | MHF_Villager | Passive Mob |
| `e9f8a7b6c5d4e3f2a1b0c9d8e7f6a5b4` | MHF_Golem | Passive Mob |
| `f8a7b6c5d4e3f2a1b0c9d8e7f6a5b4c3` | MHF_Ocelot | Passive Mob |
| `c5d4e3f2a1b0c9d8e7f6a5b4c3d2e1f0` | MHF_Mooshroom | Passive Mob |
| `e3f2a1b0c9d8e7f6a5b4c3d2e1f0a9b8` | MHF_Wolf | Passive Mob |
| `a7b6c5d4e3f2a1b0c9d8e7f6a5b4c3d2` | MHF_Herobrine | Special |

## Examples

### Fetch the MHF list

```bash
curl https://your-domain.com/minecraft/mhf
```

```
GET /minecraft/mhf
```

Returns the full JSON dictionary of all 24 MHF presets.

### Pretty-print the response

```bash
curl -s https://your-domain.com/minecraft/mhf | jq .
```

### Get a specific MHF name with jq

```bash
curl -s https://your-domain.com/minecraft/mhf | jq '.f4254a8e93e4455b8c8a6b6b6f6d6e6f'
```

Returns:

```
"MHF_Creeper"
```

### List all UUIDs

```bash
curl -s https://your-domain.com/minecraft/mhf | jq 'keys'
```

### Use an MHF UUID with a render endpoint

The UUIDs returned by this endpoint can be passed to any render endpoint as the `input` parameter:

```bash
# Render a Creeper head
curl -o creeper_head.png https://your-domain.com/head/f4254a8e93e4455b8c8a6b6b6f6d6e6f/128

# Render a Zombie full body
curl -o zombie_body.png https://your-domain.com/player/8b6a72138d69fbbd2fea3fa251cabd87/128/hat

# Render an Enderman isometric
curl -o enderman_iso.png https://your-domain.com/avatar/a9b8c7d6e5f4a3b2c1d0e9f8a7b6c5d4/right/128

# Render Steve's isometric head
curl -o steve_ioshead.png https://your-domain.com/ioshead/c06f89064c8a49119c29ea1dbd1aab82/left/128

# Download a Skeleton skin
curl -OJ https://your-domain.com/download/c37b40e6c6b3b5f8d5e7f8a9b0c1d2e3
```

### JavaScript example: render all MHF heads

```javascript
async function renderAllMHFHeads() {
    const response = await fetch('https://your-domain.com/minecraft/mhf');
    const heads = await response.json();

    const container = document.getElementById('mhf-gallery');

    for (const [uuid, name] of Object.entries(heads)) {
        const img = document.createElement('img');
        img.src = `https://your-domain.com/head/${uuid}/64`;
        img.alt = name;
        img.title = name;
        container.appendChild(img);
    }
}
```

### Build a mob gallery in HTML

```html
<div id="mhf-gallery">
  <img src="https://your-domain.com/head/f4254a8e93e4455b8c8a6b6b6f6d6e6f/64" alt="Creeper" />
  <img src="https://your-domain.com/head/8b6a72138d69fbbd2fea3fa251cabd87/64" alt="Zombie" />
  <img src="https://your-domain.com/head/c37b40e6c6b3b5f8d5e7f8a9b0c1d2e3/64" alt="Skeleton" />
  <img src="https://your-domain.com/head/a9b8c7d6e5f4a3b2c1d0e9f8a7b6c5d4/64" alt="Enderman" />
</div>
```

## Caching

This endpoint is not cached in the database since it returns a static, hardcoded JSON object. The response is effectively instant.

## Stats Tracking

Each request to this endpoint is recorded as:

```
endpoint: "mhf"
input: "all"
edition: "java"
```
