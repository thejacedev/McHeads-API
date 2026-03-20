---
title: Overview
order: 1
---

# Minecraft Heads API

The Minecraft Heads API is an open-source Node.js service that renders Minecraft player heads, full bodies, isometric views, and raw skin textures as PNG images. It supports both **Java Edition** (via the Mojang API) and **Bedrock Edition** (via the GeyserMC API), with automatic edition detection based on the input you provide.

The public instance is hosted at [api.mcheads.org](https://api.mcheads.org). You can also self-host the API on your own infrastructure.

## What It Does

Given a player's username, UUID, or Bedrock identifier, the API fetches their skin from the appropriate upstream service and renders one of several image types:

| Render Type | Endpoint | Description |
|---|---|---|
| Head | `/head/:input/:size` | Front-facing head, base skin layer |
| Head with Hat | `/head/:input/:size/hat` | Front-facing head with the hat overlay layer composited on top |
| Full Body | `/player/:input/:size` | Full body render showing head, torso, arms, and legs |
| Isometric Body | `/avatar/:input/:direction/:size` | 3D isometric full body, viewed from the left or right |
| Isometric Head | `/ioshead/:input/:direction` | 3D isometric head only |
| Isometric Body (iOS) | `/iosbody/:input/:direction` | 3D isometric full body (alternative endpoint) |
| Raw Skin | `/skin/:input` | The original skin texture file as a PNG |
| Download | `/download/:input` | Same as raw skin, but served as a file attachment |

All image endpoints return `image/png` responses. No API key is required.

## Supported Editions

### Java Edition

Java players are identified by their Mojang username or UUID. The API resolves usernames to UUIDs using the Mojang API (`api.mojang.com`), then fetches the player's skin texture from the Mojang session server.

```
GET /head/Notch/128
GET /head/069a79f444e94726a5befca90e38aaf5/128
```

Both formats work identically. The API accepts UUIDs with or without dashes.

### Bedrock Edition

Bedrock players are identified by their Xbox Live XUID or gamertag. The API resolves these through the GeyserMC API (`api.geysermc.org`), which provides skin data for Bedrock players.

```
GET /head/0000123456789/128       # XUID (starts with 0000)
GET /head/.ExampleGamertag/128    # Gamertag (prefixed with a dot)
```

If a Bedrock player has no skin data available, the API falls back to the default Steve skin.

## How It Works

At a high level, every request follows the same path: parse the input, check the cache, fetch the skin if needed, render the image, cache the result, and respond. The sections below explain each stage in detail.

## Render Pipeline

The rendering process follows these steps:

1. **Input parsing** -- The API cleans the input (stripping `.png` suffixes, sanitizing parameters) and determines whether the player is Java or Bedrock edition. The `cleanParams` utility normalizes the URL parameters, and the `parseSize` utility converts the size string to an integer (defaulting to 128 if missing or invalid).

2. **Cache lookup** -- The API checks the database for a cached render matching the endpoint, input, size, and options. If a valid cache entry exists (less than 1 hour old), it is returned immediately. Cache hits skip all network requests and image processing, making them very fast.

3. **Profile resolution** -- For cache misses, the API fetches the player's profile and skin URL from the appropriate upstream service. For Java players, this is a two-step process: resolve the username to a UUID via `api.mojang.com`, then fetch the session profile (which contains the skin URL) from `sessionserver.mojang.com`. For Bedrock players, the GeyserMC API at `api.geysermc.org` handles both gamertag-to-XUID resolution and skin data retrieval.

4. **Image rendering** -- The raw skin texture is downloaded from the resolved URL and processed into the requested render type. The skin texture is a standard Minecraft skin format -- either 64x64 pixels (new format, used since Minecraft 1.8) or 64x32 pixels (legacy format). Each body part occupies a specific region of this texture, and the rendering code crops, scales, and composites these regions according to the requested output.

5. **Caching** -- The rendered PNG buffer is stored in the database with a 1-hour TTL, keyed by a combination of endpoint, input, size, and options. Subsequent requests for the same render will hit the cache until it expires.

6. **Response** -- The PNG buffer is sent to the client with `Content-Type: image/png` and appropriate security and compression headers.

## Image Processing Libraries

The API uses three image libraries, each suited to different render types:

- **Sharp** -- Used for head renders. Extracts the 8x8 pixel head region from the skin texture, scales it to the requested size using nearest-neighbor interpolation (preserving pixel art), and optionally composites the hat overlay layer.

- **Jimp** -- Used for full body renders. Assembles the body from individual parts (head, torso, left arm, right arm, left leg, right leg), each cropped from the skin texture at their standard coordinates. Supports both old-format (64x32) and new-format (64x64) skins.

- **node-canvas** -- Used for isometric 3D renders. Applies affine transforms to project each face of the body onto an isometric plane, producing a 3D appearance. The final canvas is scaled down with Lanczos resampling (via Sharp) for smooth output.

## Caching

All renders are cached for **1 hour** in the configured database. The cache key is a combination of the endpoint name, player input, size, and any options (like `hat` or direction). This means:

- `GET /head/Notch/128` and `GET /head/Notch/256` are cached separately.
- `GET /head/Notch/128` and `GET /head/Notch/128/hat` are cached separately.
- `GET /avatar/Notch/left/128` and `GET /avatar/Notch/right/128` are cached separately.
- Repeated requests for the same render within 1 hour are served from cache without hitting the Mojang or GeyserMC APIs.

Cache entries older than 1 hour are not proactively deleted. They remain in the database but are ignored by the cache lookup query, which filters by `created_at > (now - 1 hour)`. When the same key is requested again after expiry, the new render overwrites the stale entry using an upsert (`INSERT OR REPLACE` in SQLite, `ON CONFLICT DO UPDATE` in PostgreSQL).

The database backend is configurable. By default, the API uses a local SQLite file (`new_minecraft_heads.db`). For production deployments, you can set the `DATABASE_URL` environment variable to use PostgreSQL instead. See the [Self-Hosting](self-hosting.md) guide for database configuration details.

## MHF Preset Heads

The API includes a set of preset MHF (Minecraft Head Format) heads. These are well-known UUIDs that Mojang provides for common mob and item textures:

```
GET /head/MHF_Creeper/128
GET /head/MHF_Skeleton/64
```

A full list of available MHF heads is available at:

```
GET /minecraft/mhf
```

## Usage Statistics

The API tracks how many renders have been served for each edition:

| Endpoint | Description |
|---|---|
| `GET /allstats` | Total Java Edition render count |
| `GET /allstatsbedrock` | Total Bedrock Edition render count |
| `GET /allstatsSorted` | All stats sorted by count (descending) |

These return JSON responses, not images.

## Health Monitoring

The `/health` endpoint returns a JSON status report including:

- Overall system status (`green`, `yellow`, or `red`)
- External API reachability (Mojang API ping with 5-second timeout)
- Response time for the health check itself
- Server uptime in seconds
- Memory usage (heap used and heap total in MB)
- Recent health check summary from the last 5 minutes

```bash
curl https://api.mcheads.org/health
```

The status is determined by analyzing recent health check logs stored in the database. If more than 50% of recent checks are errors, the status is `red`. If any errors exist or more than 30% are warnings, the status is `yellow`. Otherwise, it is `green`. The API stores up to 10,000 health log entries, pruning older ones on startup.

## Project Architecture

The codebase is organized into route handlers and utility modules:

```
server.js               Entry point, Express setup, middleware
routes/
    head.js             GET /head/:input/:size/:option
    player.js           GET /player/:input/:size/:option
    avatar.js           GET /avatar/:input/:direction/:size
    skin.js             GET /skin/:input
    download.js         GET /download/:input
    ios.js              GET /ioshead and /iosbody endpoints
    mhf.js              GET /minecraft/mhf
    stats.js            GET /allstats, /allstatsbedrock, /allstatsSorted
    health.js           GET /health
utils/
    minecraft.js        Edition detection, Mojang + GeyserMC API calls
    imageProcessor.js   All image rendering functions
    database.js         SQLite/PostgreSQL abstraction, caching, stats
    mhfHeads.js         MHF UUID-to-name mappings
    urlHelpers.js       Parameter cleaning and size parsing
```

Each route handler follows the same pattern: clean parameters, build a cache key, check the cache, call `getProfile` to resolve the player, call the appropriate render function, cache the result, and return the PNG.

## Technology Stack

| Component | Technology |
|---|---|
| Runtime | Node.js |
| Framework | Express |
| Image rendering | Sharp, Jimp, node-canvas |
| Database | SQLite (better-sqlite3) or PostgreSQL (pg) |
| HTTP client | Axios |
| Security | Helmet (HTTP headers), CORS |
| Compression | compression (gzip) |

## Security

The API applies several security measures through Express middleware:

- **Helmet** -- Sets secure HTTP headers (X-Content-Type-Options, X-Frame-Options, Content-Security-Policy, etc.). The `crossOriginResourcePolicy` is set to `cross-origin` so that images can be loaded from any domain.
- **CORS** -- All origins are allowed, since the API is designed to serve images to any website.
- **Compression** -- Gzip compression is applied to all responses.
- **No authentication** -- The API is intentionally open. There are no API keys, rate limits, or access controls at the application level. If you need rate limiting, configure it at the reverse proxy level (see [Self-Hosting](self-hosting.md)).

## License

The Minecraft Heads API is released under the [MIT License](https://github.com/thejacedev/McHeads-API/blob/main/LICENSE). Copyright (c) Jace Sleeman.
