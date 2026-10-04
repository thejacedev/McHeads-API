---
order: 1
title: Reference Overview
---

# Reference

Technical reference material for the Minecraft Heads API. This section covers
the underlying data formats, external API integrations, error handling, and
server configuration.

---

## What's in This Section

### [Skin Format](skin-format.md)

The Minecraft skin texture format: how a 64x64 (or 64x32) PNG is laid out, what
each pixel region represents, where the overlay layers live, and how legacy skins
differ from modern skins.

### [Mojang API](mojang-api.md)

How the API resolves a username or UUID to a downloadable skin texture. Covers
the three-step Mojang lookup for Java Edition and the GeyserMC lookup for
Bedrock Edition, including the base64-encoded texture property format.

### [Error Codes](error-codes.md)

All error responses the API can return, including HTTP status codes, JSON error
bodies, and the default skin used for players who have no custom skin.

### [Environment Variables](environment.md)

Every environment variable the server reads, with defaults and explanations.
Covers port configuration, database selection (SQLite vs PostgreSQL), TLS
settings, rate limiting, and reverse proxy configuration.

---

## Quick Reference Table

| Topic | Key facts |
| ----- | --------- |
| Skin format | 64x64 PNG (modern) or 64x32 PNG (legacy) |
| Head face region | 8x8 pixels at (8, 8) |
| Hat overlay region | 8x8 pixels at (40, 8) |
| Java API | api.mojang.com + sessionserver.mojang.com |
| Bedrock API | api.geysermc.org/v2 |
| Cache TTL | 1 hour fresh, kept 24 h as a fallback (database), plus in-memory player (10 min) and skin (24 h) caches |
| Size range | 8–512 px (default 128, or 64 for `/ioshead` and `/iosbody`) |
| Upstream timeout | 10 seconds per request (`UPSTREAM_TIMEOUT_MS`) |
| Default port | 3005 |
| Default database | SQLite (new_minecraft_heads.db) |
| Error format | `{ "error": "message" }` |
| Image format | PNG (image/png) |

---

## Source File Map

| File | Purpose |
| ---- | ------- |
| `utils/minecraft.js` | Player identifier parsing, Mojang and GeyserMC API integration |
| `utils/imageProcessor.js` | All rendering functions |
| `utils/imageRoute.js` | Shared handler for image endpoints: cache, render, error responses |
| `utils/database.js` | Cache, stats, and health log storage |
| `utils/memoryCache.js` | In-memory TTL cache for player lookups and skin textures |
| `utils/metrics.js` | Rolling request-latency stats (`response_time_avg`, `response_time_p95`) reported by `/health` |
| `utils/http.js` | Shared axios client for upstream requests (10-second default timeout) |
| `utils/rateLimit.js` | Optional per-IP rate limiter |
| `utils/errors.js` | `HttpError`, an error that maps to an HTTP status |
| `utils/urlHelpers.js` | Parameter cleaning, size and direction parsing |
| `utils/mhfHeads.js` | MHF head UUID-to-name mapping |
| `routes/head.js` | `/head` endpoint |
| `routes/player.js` | `/player` endpoint |
| `routes/avatar.js` | `/avatar` endpoint |
| `routes/ios.js` | `/ioshead` and `/iosbody` endpoints |
| `routes/skin.js` | `/skin` endpoint |
| `routes/download.js` | `/download` endpoint |
| `routes/mhf.js` | `/minecraft/mhf` endpoint |
| `routes/stats.js` | `/allstats`, `/allstatsbedrock`, `/allstatsSorted` |
| `routes/health.js` | `/health` endpoint |
| `app.js` | Express app: middleware and routes |
| `server.js` | Startup (database init, listen) and graceful shutdown |
