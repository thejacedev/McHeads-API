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

Bedrock players are identified by their Xbox Live XUID, Floodgate UUID or gamertag. The API resolves these through the GeyserMC API (`api.geysermc.org`), which provides skin data for Bedrock players.

```
GET /head/00002535468413142004/128                   # XUID (prefixed with 0000)
GET /head/00000000-0000-0000-0009-01febe1ac3f4/128   # Floodgate UUID
GET /head/.ExampleGamertag/128                       # Gamertag (prefixed with a dot)
```

If a player exists but has no custom skin, the API uses the default (classic Steve) skin. Unknown players get a 404. See [Edition Detection](edition-detection.md) for the exact input rules.

## How It Works

At a high level, every request follows the same path: parse the input, check the cache, fetch the skin if needed, render the image, cache the result, and respond. The sections below explain each stage in detail.

## Render Pipeline

The rendering process follows these steps:

1. **Input parsing** -- The API strips `.png` suffixes from the URL parameters (`cleanParams`), then `parsePlayer` validates the player identifier and determines whether the player is Java or Bedrock edition. Malformed identifiers are rejected with HTTP 400. The `parseSize` utility converts the size string to an integer: missing, non-numeric or non-positive values fall back to the endpoint default (128, or 64 for `/ioshead` and `/iosbody`), and anything else is clamped to 8–512.

2. **Cache lookup** -- The API checks the database for a cached render matching the endpoint, normalized player, size, and options. If a valid cache entry exists (less than 1 hour old), it is returned immediately. Cache hits skip all network requests and image processing, making them very fast.

3. **Profile resolution** -- For cache misses, the API resolves the player to a skin URL and model (classic or slim) from the appropriate upstream service. For Java players, a username is first resolved to a UUID via `api.mojang.com`, then the session profile (which contains the skin URL) is fetched from `sessionserver.mojang.com`. For Bedrock players, the GeyserMC API at `api.geysermc.org` handles both gamertag-to-XUID resolution and skin data retrieval. Lookups are cached in memory for 30 minutes. Unknown players get a 404, and upstream failures or timeouts (10 seconds per request by default) get a fallback image: the last render if there is one, otherwise the default skin (`/download` returns 502 instead).

4. **Image rendering** -- The raw skin texture is downloaded from the resolved URL (and cached in memory for 24 hours) and processed into the requested render type. The skin texture is a standard Minecraft skin format -- either 64x64 pixels (new format, used since Minecraft 1.8) or 64x32 pixels (legacy format). Each body part occupies a specific region of this texture, and the rendering code crops, scales, and composites these regions according to the requested output.

5. **Caching** -- The rendered PNG buffer is stored in the database with a 1-hour TTL, keyed by endpoint, normalized player, size, and options. Subsequent requests for the same render will hit the cache until it expires.

6. **Response** -- The PNG buffer is sent to the client with `Content-Type: image/png`, `Cache-Control: public, max-age=3600`, and the security and compression headers.

## Image Processing Libraries

The API uses two image libraries:

- **Sharp** -- Used for head renders. Extracts the 8x8 pixel head region from the skin texture, scales it to the requested size using nearest-neighbor interpolation (preserving pixel art), and optionally composites the hat overlay layer. Also used for full body renders: Sharp decodes the skin to raw pixels once, the body is assembled from individual parts (head, torso, both arms, both legs) by nearest-neighbor sampling, and Sharp encodes the result. Supports both old-format (64x32) and new-format (64x64) skins, and slim (3px-arm) models.

- **node-canvas** -- Used for isometric 3D renders. Applies affine transforms to project each face of the body onto an isometric plane, producing a 3D appearance. The final canvas is scaled down with Lanczos resampling (via Sharp) for smooth output.

## Caching

All renders are cached for **1 hour** in the configured database. The cache key is a combination of the endpoint name, the normalized player, the parsed size, and any options (like `hat` or direction), for example `head:name:notch:128:hat`. This means:

- `GET /head/Notch/128` and `GET /head/Notch/256` are cached separately.
- `GET /head/Notch/128` and `GET /head/Notch/128/hat` are cached separately.
- `GET /avatar/Notch/left/128` and `GET /avatar/Notch/right/128` are cached separately.
- `GET /head/Notch`, `GET /head/notch/128` and `GET /head/Notch/128.png` share one cache entry.
- Repeated requests for the same render within 1 hour are served from cache without hitting the Mojang or GeyserMC APIs.

The lookup query only returns entries whose `created_at` is within the last hour, evaluated with the database's own clock. Expired rows are deleted at startup and every 10 minutes. When the same key is rendered again, the new render overwrites the old row with an `ON CONFLICT (key) DO UPDATE` upsert.

Separately from the database, the API keeps two in-memory caches: player lookups (30 minutes) and downloaded skin textures (24 hours). See [Caching](../rendering/caching.md) for details.

The database backend is configurable. By default, the API uses a local SQLite file (`new_minecraft_heads.db`, or the path in `SQLITE_PATH`). For production deployments, you can set the `DATABASE_URL` environment variable to use PostgreSQL instead. See the [Self-Hosting](self-hosting.md) guide for database configuration details.

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

The `status` field reflects the live check: `red` (HTTP 503) if the Mojang API is unreachable, `yellow` if it returned no data or the check took over 2 seconds, otherwise `green`. A separate `recent_status` field summarizes the checks logged in the last 5 minutes: `red` if more than 50% were errors, `yellow` if any were errors or more than 30% were warnings, otherwise `green`. Health logs older than 7 days are pruned at startup and every 10 minutes.

## Project Architecture

The codebase is organized into route handlers and utility modules:

```
server.js               Entry point: database init, startup, graceful shutdown
app.js                  Express app: middleware (Helmet, compression, CORS, rate limit) and routes
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
    minecraft.js        Player identifier parsing, Mojang + GeyserMC API calls
    imageProcessor.js   All image rendering functions
    imageRoute.js       Shared handler used by every image endpoint
    database.js         SQLite/PostgreSQL abstraction, caching, stats, health logs
    memoryCache.js      In-memory TTL cache for player lookups and skin textures
    metrics.js          Rolling request-latency stats reported by /health
    http.js             Shared axios client for upstream requests (10-second default timeout)
    rateLimit.js        Optional per-IP rate limiter
    errors.js           HttpError class (errors that map to an HTTP status)
    mhfHeads.js         MHF UUID-to-name mappings
    urlHelpers.js       Parameter cleaning, size and direction parsing
```

Every image endpoint is built with `imageRoute` and follows the same pattern: clean parameters, parse the player with `parsePlayer`, build a cache key, check the cache, resolve the skin with `getSkinInfo` and `getSkinImage`, call the appropriate render function, cache the result, and return the PNG.

## Technology Stack

| Component | Technology |
|---|---|
| Runtime | Node.js |
| Framework | Express |
| Image rendering | Sharp, node-canvas |
| Database | SQLite (better-sqlite3) or PostgreSQL (pg) |
| HTTP client | Axios |
| Security | Helmet (HTTP headers), CORS |
| Compression | compression (gzip) |

## Security

The API applies several security measures through Express middleware:

- **Helmet** -- Sets secure HTTP headers (X-Content-Type-Options, X-Frame-Options, Content-Security-Policy, etc.). The `crossOriginResourcePolicy` is set to `cross-origin` so that images can be loaded from any domain.
- **CORS** -- All origins are allowed, since the API is designed to serve images to any website.
- **Compression** -- Gzip compression is applied to all responses.
- **No authentication** -- The API is intentionally open. There are no API keys or access controls at the application level.
- **Optional rate limiting** -- Set `RATE_LIMIT_PER_MINUTE` to enable a per-IP, in-memory limit; requests over the limit get HTTP 429 with a `Retry-After` header. It is disabled by default. Behind a reverse proxy, also set `TRUST_PROXY` so the limiter sees client IPs (see [Self-Hosting](self-hosting.md)).

## License

The Minecraft Heads API is released under the [MIT License](https://github.com/thejacedev/McHeads-API/blob/main/LICENSE). Copyright (c) Jace Sleeman.
