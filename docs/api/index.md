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

Every endpoint that renders a player (`/head`, `/player`, `/avatar`, `/skin`, `/ioshead`, `/iosbody`, `/download`) responds with `Content-Type: image/png`. The binary PNG data is sent directly in the response body. There is no JSON wrapper around image responses -- the response _is_ the image.

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

When a size parameter is optional and omitted, the API defaults to **128 pixels**. The `parseSize` utility parses the size string to an integer after stripping `.png`, falling back to 128 if the value is missing or not a valid number.

| Endpoint | Default Size | Output Dimensions |
|----------|-------------|-------------------|
| `/head` | 128 | 128 x 128 |
| `/player` | 128 | 128 x 256 |
| `/avatar` | 128 | 128 x ~261 (aspect ratio preserved) |
| `/ioshead` | 64 | 64 x 64 |
| `/iosbody` | 64 | 64 x ~131 (aspect ratio preserved) |
| `/skin` | N/A | 64 x 64 (raw texture) |

### 1-Hour Cache

Rendered images are cached in the database (SQLite or PostgreSQL) for **1 hour**. The cache key is composed of the endpoint name, player input, size, and option values. Subsequent requests for the same render within that hour are served directly from the cache without re-fetching the skin from Mojang/GeyserMC or re-rendering.

```
Cache key format: {endpoint}_{input}_{size|default}_{option|default}
TTL: 3600 seconds (1 hour)
```

Cache entries older than 1 hour are ignored on read but not actively purged. The `saveToCache` function uses `INSERT OR REPLACE` (SQLite) or `ON CONFLICT DO UPDATE` (PostgreSQL) to overwrite stale entries.

## Player Input Types

The `input` parameter accepted by all player-facing endpoints supports three identifier formats:

| Format | Example | Edition | Resolution |
|--------|---------|---------|------------|
| **Username** | `Notch` | Java | Looked up via `api.mojang.com` to get UUID, then session server for textures |
| **UUID** | `069a79f444e94726a5befca90e38aaf5` | Java | Sent directly to Mojang session server (dashes optional) |
| **XUID** | `0000000000000001` | Bedrock | Starts with `0000`; resolved via GeyserMC skin API |
| **Dot-prefix gamertag** | `.SomePlayer` | Bedrock | Starts with `.`; gamertag looked up via GeyserMC for XUID, then skin |

If a Bedrock player has no skin data available, the API falls back to the default Steve skin.

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
| `400` | Bad request (e.g., missing required `direction` parameter) |
| `500` | Internal error (skin fetch failed, render failed, profile not found) |
| `503` | Service unavailable (health check reports red status) |

## Error Response Format

When an error occurs on a render endpoint, the API responds with JSON:

```json
{
  "error": "Failed to render head"
}
```

The error message varies by endpoint (`"Failed to render head"`, `"Failed to render player"`, `"Failed to render avatar"`, etc.) but always uses the same `{ "error": "..." }` shape.

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

The API does not enforce rate limits at the application level. However, upstream providers (Mojang API, GeyserMC API) may throttle requests. The 1-hour cache helps reduce upstream calls for frequently requested players.

## Technology Stack

- **Runtime**: Node.js with Express
- **Image Processing**: Sharp (head renders), Jimp (body compositing), node-canvas (isometric 3D transforms)
- **Database**: SQLite (via better-sqlite3) or PostgreSQL (via pg), selected by the `DATABASE_URL` environment variable
- **Skin Sources**: Mojang Session Server (Java), GeyserMC API (Bedrock)
