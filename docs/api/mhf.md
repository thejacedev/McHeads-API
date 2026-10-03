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

The MHF heads are a hardcoded dictionary of UUID-to-name mappings for the official Mojang `MHF_*` accounts, stored in `utils/mhfHeads.js`. When the endpoint is called, the entire dictionary is returned as a JSON object. No database queries or external API calls are made beyond recording the request in usage statistics.

Each call increments the `java` edition counter.

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
  "6ab4317889fd490597f60f67d9d76fd9": "MHF_Alex",
  "057b1c4713214863a6fe8887f9ec265f": "MHF_Creeper",
  "daca2c3d719b41f5b624e4039e6c04bd": "MHF_Zombie",
  "a3f427a818c549c5a4fb64c6e0e1e0a8": "MHF_Skeleton",
  "5ad55f3441b64bd29c3218983c635936": "MHF_Spider",
  "40ffb37212f64678b3f22176bf56dd4b": "MHF_Enderman",
  "870aba9340e848b389c532ece00d6630": "MHF_Slime",
  "063085a6797f4785be1a21cd7580f752": "MHF_Ghast",
  "4c38ed11596a4fd4ab1d26f386c1cbac": "MHF_Blaze",
  "8b57078bf1bd45df83c4d88d16768fbe": "MHF_Pig",
  "f159b274c22e4340b7c152abde147713": "MHF_Cow",
  "92deafa9430742d9b00388601598d6c0": "MHF_Chicken",
  "dfaad5514e7e45a1a6f7c6fc5ec823ac": "MHF_Sheep",
  "72e64683e3134c36a408c66b64e94af5": "MHF_Squid",
  "bd482739767c45dca1f8c33c40530952": "MHF_Villager",
  "757f90b223444b8d8dac824232e2cece": "MHF_Golem",
  "1bee9df54f7142a2bf52d97970d3fea3": "MHF_Ocelot",
  "9586e5ab157a4658ad80b07552a9ca63": "MHF_Herobrine",
  "0972bdd14b8649fb9ecca353f8491a51": "MHF_LavaSlime",
  "b48a45553d4c464282338ec6ed7b368c": "MHF_Mooshroom",
  "cab28771f0cd4fe7b12902c69eba79a5": "MHF_CaveSpider",
  "8d2d1d6d80344c89bd86809a31fd5193": "MHF_Wolf",
  "fef85c492fdf47f89132552046243223": "MHF_Witch"
}
```

### Available Presets

| UUID | Name | Category |
|------|------|----------|
| `c06f89064c8a49119c29ea1dbd1aab82` | MHF_Steve | Player |
| `6ab4317889fd490597f60f67d9d76fd9` | MHF_Alex | Player |
| `057b1c4713214863a6fe8887f9ec265f` | MHF_Creeper | Hostile Mob |
| `daca2c3d719b41f5b624e4039e6c04bd` | MHF_Zombie | Hostile Mob |
| `a3f427a818c549c5a4fb64c6e0e1e0a8` | MHF_Skeleton | Hostile Mob |
| `5ad55f3441b64bd29c3218983c635936` | MHF_Spider | Hostile Mob |
| `40ffb37212f64678b3f22176bf56dd4b` | MHF_Enderman | Hostile Mob |
| `870aba9340e848b389c532ece00d6630` | MHF_Slime | Hostile Mob |
| `063085a6797f4785be1a21cd7580f752` | MHF_Ghast | Hostile Mob |
| `4c38ed11596a4fd4ab1d26f386c1cbac` | MHF_Blaze | Hostile Mob |
| `cab28771f0cd4fe7b12902c69eba79a5` | MHF_CaveSpider | Hostile Mob |
| `fef85c492fdf47f89132552046243223` | MHF_Witch | Hostile Mob |
| `0972bdd14b8649fb9ecca353f8491a51` | MHF_LavaSlime | Hostile Mob |
| `8b57078bf1bd45df83c4d88d16768fbe` | MHF_Pig | Passive Mob |
| `f159b274c22e4340b7c152abde147713` | MHF_Cow | Passive Mob |
| `92deafa9430742d9b00388601598d6c0` | MHF_Chicken | Passive Mob |
| `dfaad5514e7e45a1a6f7c6fc5ec823ac` | MHF_Sheep | Passive Mob |
| `72e64683e3134c36a408c66b64e94af5` | MHF_Squid | Passive Mob |
| `bd482739767c45dca1f8c33c40530952` | MHF_Villager | Passive Mob |
| `757f90b223444b8d8dac824232e2cece` | MHF_Golem | Passive Mob |
| `1bee9df54f7142a2bf52d97970d3fea3` | MHF_Ocelot | Passive Mob |
| `b48a45553d4c464282338ec6ed7b368c` | MHF_Mooshroom | Passive Mob |
| `8d2d1d6d80344c89bd86809a31fd5193` | MHF_Wolf | Passive Mob |
| `9586e5ab157a4658ad80b07552a9ca63` | MHF_Herobrine | Special |

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
curl -s https://your-domain.com/minecraft/mhf | jq '.057b1c4713214863a6fe8887f9ec265f'
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
curl -o creeper_head.png https://your-domain.com/head/057b1c4713214863a6fe8887f9ec265f/128

# Render a Zombie full body
curl -o zombie_body.png https://your-domain.com/player/daca2c3d719b41f5b624e4039e6c04bd/128/hat

# Render an Enderman isometric
curl -o enderman_iso.png https://your-domain.com/avatar/40ffb37212f64678b3f22176bf56dd4b/right/128

# Render Steve's isometric head
curl -o steve_ioshead.png https://your-domain.com/ioshead/c06f89064c8a49119c29ea1dbd1aab82/left/128

# Download a Skeleton skin
curl -OJ https://your-domain.com/download/a3f427a818c549c5a4fb64c6e0e1e0a8
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
  <img src="https://your-domain.com/head/057b1c4713214863a6fe8887f9ec265f/64" alt="Creeper" />
  <img src="https://your-domain.com/head/daca2c3d719b41f5b624e4039e6c04bd/64" alt="Zombie" />
  <img src="https://your-domain.com/head/a3f427a818c549c5a4fb64c6e0e1e0a8/64" alt="Skeleton" />
  <img src="https://your-domain.com/head/40ffb37212f64678b3f22176bf56dd4b/64" alt="Enderman" />
</div>
```

## Caching

This endpoint is not cached in the database since it returns a static, hardcoded JSON object. The response is effectively instant.

## Stats Tracking

Each request to this endpoint increments the Java edition counter, the same counter reported by `/allstats`:

```js
recordStats('java');
```
