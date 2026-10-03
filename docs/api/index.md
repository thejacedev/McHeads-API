---
title: API Overview
order: 1
---

# Minecraft Heads API

The Minecraft Heads API is a RESTful image rendering service that generates PNG images of Minecraft player skins. It supports both **Java Edition** (via Mojang) and **Bedrock Edition** (via GeyserMC) players, providing flat head renders, full body renders, isometric 3D projections, raw skin textures, and more.

## Base URL

```
https://your-domain.com
```

The API runs on the port defined by the `PORT` environment variable, defaulting to `3005` in development.

```
http://localhost:3005
```

## Key Concepts

### All Render Endpoints Return PNG Images

Every endpoint that renders a player (`/head`, `/player`, `/avatar`, `/skin`, `/ioshead`, `/iosbody`, `/download`) responds with `Content-Type: image/png` and `Cache-Control: public, max-age=3600`. The binary PNG data is sent directly in the response body. There is no JSON wrapper around image responses -- the response _is_ the image.

```bash
# Save a head render to a file
curl -o notch_head.png https://your-domain.com/head/Notch

# Pipe directly into an image viewer
curl -s https://your-domain.com/head/Notch | display
```

### The `.png` Suffix Is Automatically Stripped

All URL parameters are cleaned before processing. If any parameter ends with `.png`, that suffix is removed. This means the following URLs are equivalent:

```
/head/Notch
/head/Notch.png
/head/Notch/256.png
/head/Notch.png/256.png/hat.png
```

This is handled by the `cleanParams` utility, which runs `replace(/\.png$/i, '')` on every route parameter. It allows you to construct URLs that look like direct image links in HTML or Markdown without any special handling.

### Default Size Is 128 Pixels

When a size parameter is optional and omitted, the API defaults to **128 pixels** (64 for `/ioshead` and `/iosbody`). The `parseSize` utility parses the size string to an integer after stripping `.png`. Missing, non-numeric or non-positive values fall back to the endpoint default; any other value is clamped to the range **8–512**, so `/head/Notch/4` returns an 8x8 image and `/head/Notch/2000` a 512x512 one.

| Endpoint | Default Size | Output Dimensions |
|----------|-------------|-------------------|
| `/head` | 128 | 128 x 128 |
| `/player` | 128 | 128 x 256 |
| `/avatar` | 128 | 128 x ~261 (aspect ratio preserved) |
| `/ioshead` | 64 | 64 x 64 |
| `/iosbody` | 64 | 64 x ~131 (aspect ratio preserved) |
| `/skin` | N/A | 64 x 64 or 64 x 32 (raw texture) |

### 1-Hour Cache

Rendered images are cached in the database (SQLite or PostgreSQL) for **1 hour**. The cache key is composed of the endpoint name, the normalized player, and the parsed size and options. Subsequent requests for the same render within that hour are served directly from the cache without re-fetching the skin from Mojang/GeyserMC or re-rendering.

```
Cache key format: {endpoint}:{playerId}:{part}...
Examples:         head:name:notch:64:hat
                  avatar:name:notch:right:128
                  skin:name:notch
TTL: 3600 seconds (1 hour)
```

The `playerId` is `name:<lowercased username>`, `uuid:<32 lowercase hex>`, `xuid:<digits>` or `gt:<lowercased gamertag>`, so `/head/Notch` and `/head/notch/128.png` share an entry. Expired entries are ignored on read and deleted at startup and every 10 minutes. `/download` shares `/skin`'s entries. See [Caching](../rendering/caching.md) for the in-memory caches as well.

## Player Input Types

The `input` parameter accepted by all player-facing endpoints supports these identifier formats:

| Format | Example | Edition | Resolution |
|--------|---------|---------|------------|
| **Username** | `Notch` | Java | Must match `^[A-Za-z0-9_]{1,16}$`. Looked up via `api.mojang.com` to get UUID, then session server for textures |
| **UUID** | `069a79f444e94726a5befca90e38aaf5` | Java | Sent directly to Mojang session server (dashes optional) |
| **XUID** | `00002535468413142004` | Bedrock | `0000` followed by digits, at least 17 characters; leading zeros are stripped and the XUID is resolved via the GeyserMC skin API |
| **Floodgate UUID** | `00000000-0000-0000-0009-01febe1ac3f4` | Bedrock | A UUID whose first 16 hex digits are zero; the low 64 bits are the XUID |
| **Dot-prefix gamertag** | `.SomePlayer` | Bedrock | Starts with `.`, followed by 1-16 letters, digits, spaces, `_`, `#` or `-` (first character a letter or digit); gamertag looked up via GeyserMC for XUID, then skin |

Any other input is rejected with `400 {"error": "Invalid player identifier"}`. If a player exists but has no custom skin, the API uses the default (classic Steve) skin; unknown players get `404 {"error": "Player not found"}`. See [Edition Detection](../getting-started/edition-detection.md) for details.

## Endpoint Summary

| Method | Path | Description |
|--------|------|-------------|
| `GET` | [`/head/:input/:size?/:option?`](head.md) | Flat 2D head render (face from skin texture) |
| `GET` | [`/player/:input/:size?/:option?`](player.md) | Full front-facing body render |
| `GET` | [`/avatar/:input/:direction/:size?`](avatar.md) | Isometric 3D full-body render |
| `GET` | [`/skin/:input`](skin.md) | Raw 64x64 skin texture PNG |
| `GET` | [`/ioshead/:input/:direction/:option?`](isometric.md) | Isometric 3D head-only render |
| `GET` | [`/iosbody/:input/:direction/:option?`](isometric.md) | Isometric 3D body render |
| `GET` | [`/download/:input`](download.md) | Skin texture download (with attachment header) |
| `GET` | [`/minecraft/mhf`](mhf.md) | JSON list of MHF preset UUIDs |
| `GET` | [`/allstats`](stats.md) | Java edition usage counts |
| `GET` | [`/allstatsbedrock`](stats.md) | Bedrock edition usage counts |
| `GET` | [`/allstatsSorted`](stats.md) | All stats sorted by usage |
| `GET` | [`/health`](health.md) | Service health check |

## Response Codes

| Code | Meaning |
|------|---------|
| `200` | Successful render or data response |
| `400` | Bad request: invalid player identifier, or a `direction` other than `left`/`right` |
| `404` | Player not found |
| `429` | Too many requests (only when the server sets `RATE_LIMIT_PER_MINUTE`) |
| `500` | Internal error (render failed, database error) |
| `502` | Upstream failure: Mojang, GeyserMC or the texture server failed or timed out |
| `503` | Service unavailable (health check reports red status) |

## Error Response Format

When an error occurs on a render endpoint, the API responds with JSON:

```json
{
  "error": "Player not found"
}
```

Client errors (400, 404, 429) carry a specific message. For 502 and 500 errors the message is the endpoint's generic one (`"Failed to render head"`, `"Failed to render player"`, `"Failed to render avatar"`, etc.). Every error uses the same `{ "error": "..." }` shape. See [Error Codes](../reference/error-codes.md) for the full list.

## CORS and Security

The API uses the following middleware:

- **Helmet** with `crossOriginResourcePolicy: "cross-origin"` -- allows images to be embedded on any domain
- **CORS** enabled globally -- all origins permitted
- **Compression** via gzip/deflate for all responses

This means you can use the API directly in `<img>` tags, CSS `background-image` properties, or fetch calls from any web page without CORS issues.

```html
<img src="https://your-domain.com/head/Notch/64" alt="Notch's head" />
```

## Rate Limits

Rate limiting is off by default. A server operator can enable a per-IP limit with the `RATE_LIMIT_PER_MINUTE` environment variable; requests over the limit get `429 {"error": "Too many requests"}` with a `Retry-After` header giving the seconds until the window resets. Upstream providers (Mojang API, GeyserMC API) may also throttle requests. The 1-hour render cache and the in-memory player and skin caches reduce upstream calls for frequently requested players.

## Technology Stack

- **Runtime**: Node.js with Express
- **Image Processing**: Sharp (head and flat body renders), node-canvas (isometric 3D transforms)
- **Database**: SQLite (via better-sqlite3) or PostgreSQL (via pg), selected by the `DATABASE_URL` environment variable
- **Skin Sources**: Mojang Session Server (Java), GeyserMC API (Bedrock)
