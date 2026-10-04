# Minecraft Heads API — [mcheads.org](https://mcheads.org)

A self-hosted Node.js/Express API for generating Minecraft player head, avatar, and body renders. Supports both **Java Edition** (Mojang API) and **Bedrock Edition** (GeyserMC API) with automatic edition detection and 1-hour caching in SQLite (default) or PostgreSQL.

| | | | | | |
|:---:|:---:|:---:|:---:|:---:|:---:|
| ![head](https://api.mcheads.org/head/JaceDev/80) | ![hat](https://api.mcheads.org/head/JaceDev/80/hat) | ![avatar left](https://api.mcheads.org/avatar/JaceDev/left/80) | ![avatar right](https://api.mcheads.org/avatar/JaceDev/right/80) | ![player](https://api.mcheads.org/player/JaceDev/80) | ![head iso](https://api.mcheads.org/ioshead/JaceDev/left) |
| `/head` | `/head hat` | `/avatar left` | `/avatar right` | `/player` | `/ioshead` |

## Quick Start

```bash
git clone https://github.com/thejacedev/McHeads-API.git
cd McHeads-API
npm install
npm start
```

For development with hot reload:
```bash
npm run dev
```

Run the test suite (Node's built-in test runner, Node 20+):
```bash
npm test
```

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `3005` | Port the server listens on |
| `DATABASE_URL` | — | PostgreSQL connection string (uses SQLite if not set) |
| `DATABASE_SSL` | — | Unset: TLS without certificate verification (works with self-signed certificates). `verify`: TLS verified against the system CAs. `false`: no TLS |
| `DATABASE_CA_CERT` | — | Path to a CA certificate file; when set, the PostgreSQL server certificate is verified against it |
| `SQLITE_PATH` | `./new_minecraft_heads.db` | SQLite database file (used when `DATABASE_URL` is not set) |
| `RATE_LIMIT_PER_MINUTE` | — | Per-IP request limit per minute, held in memory. Unset or `0` disables it |
| `TRUST_PROXY` | — | Express `trust proxy` setting (`true`, a hop count, or addresses). Set it behind a reverse proxy so rate limiting sees client IPs |

Copy `.env.example` to `.env` and fill in your values.

## API Reference

### Player Renders

| Endpoint | Description |
|---|---|
| `GET /head/:input/:size?` | Head render (base skin only) |
| `GET /head/:input/:size?/hat` | Head render with hat overlay layer |
| `GET /avatar/:input/:direction/:size?` | Isometric full body (`left` or `right`) |
| `GET /player/:input/:size?` | Full body render |
| `GET /skin/:input` | Raw skin texture PNG |
| `GET /download/:input` | Download skin as file attachment |

### iOS / Isometric Renders

| Endpoint | Description |
|---|---|
| `GET /ioshead/:input/:direction/:size?` | Isometric head (`left` or `right`, default size `64`) |
| `GET /iosbody/:input/:direction/:size?` | Isometric body (`left` or `right`, default size `64`) |

### Utility

| Endpoint | Description |
|---|---|
| `GET /minecraft/mhf` | List all MHF preset heads |
| `GET /allstats` | Java Edition usage stats |
| `GET /allstatsbedrock` | Bedrock Edition usage stats |
| `GET /allstatsSorted` | All stats sorted by usage |
| `GET /health` | API health status |

### Parameters

- `:input` — Java username, Java UUID, Bedrock XUID prefixed with `0000` (e.g. `00002535468413142004`), Floodgate UUID, or Bedrock gamertag (`.Name`)
- `:size` — Output size in pixels (default: `128`, or `64` for `/ioshead` and `/iosbody`). Missing, non-numeric or non-positive values use the default; anything else is clamped to 8–512
- `:direction` — `left` or `right` (`/avatar`, `/ioshead` and `/iosbody`)

### Errors

Errors are JSON of the form `{"error": "..."}`:

| Status | When |
|---|---|
| `400` | Invalid player identifier, or a direction other than `left`/`right` |
| `404` | Player not found |
| `429` | Too many requests (only when `RATE_LIMIT_PER_MINUTE` is set; includes `Retry-After`) |
| `502` | Mojang, GeyserMC or the texture server failed or timed out |
| `500` | Anything else |

## Usage Examples

```bash
# Java — username
curl http://localhost:3005/avatar/Notch/left/64

# Java — UUID
curl http://localhost:3005/head/069a79f444e94726a5befca90e38aaf5/256

# Bedrock — gamertag
curl http://localhost:3005/head/.ExampleGamertag/128

# Bedrock — XUID (prefixed with 0000)
curl http://localhost:3005/head/00002535468413142004/64

# Bedrock — Floodgate UUID
curl http://localhost:3005/avatar/00000000-0000-0000-0009-01febe1ac3f4/left/64

# Head with hat overlay
curl http://localhost:3005/head/Notch/128/hat

# MHF preset head
curl http://localhost:3005/head/MHF_Creeper/128

# Isometric render
curl http://localhost:3005/iosbody/Notch/left
```

## Edition Detection

| Input format | Edition |
|---|---|
| Starts with `.` (1–16 characters after the dot) | Bedrock (gamertag) |
| UUID whose first 16 hex digits are zero | Bedrock (Floodgate UUID; the XUID is the low 64 bits) |
| Any other UUID (dashed or 32 hex) | Java (UUID) |
| `0000` followed by digits, 17+ characters in total | Bedrock (XUID) |
| Matches `^[A-Za-z0-9_]{1,16}$` | Java (username) |
| Anything else | Rejected with `400` |

Players who exist but have no custom skin get the default (classic Steve) skin. Unknown players get a `404`.

## Caching

All renders are cached for **1 hour** in the database (SQLite by default, or PostgreSQL). Cache keys include the endpoint, the normalized player, and the parsed size and options (e.g. `head:name:notch:64:hat`). Player lookups and downloaded skin textures are also cached in memory. Image responses send `Cache-Control: public, max-age=3600`. The SQLite database file is excluded from version control.

## Project Structure

```
server.js           Entry point: database init, startup, graceful shutdown
app.js              Express app: middleware and routes
routes/             Route handlers (one per endpoint group)
test/               Test suite (npm test)
utils/
  minecraft.js      Player identifier parsing, Mojang + GeyserMC API integration
  imageProcessor.js Sharp/canvas image rendering
  imageRoute.js     Shared handler for image endpoints (cache, render, errors)
  database.js       SQLite/PostgreSQL caching, stats and health logs
  memoryCache.js    In-memory TTL cache for player lookups and skins
  http.js           Shared axios client for upstream requests (5 s timeout)
  rateLimit.js      Optional per-IP rate limiter
  errors.js         HttpError class
  mhfHeads.js       MHF UUID mappings
  urlHelpers.js     Parameter cleaning, size and direction parsing
```

## Contributing

Pull requests are welcome. For major changes please open an issue first.

1. Fork the repo
2. Create a feature branch (`git checkout -b feature/my-feature`)
3. Commit your changes
4. Push and open a PR

## License

[MIT](LICENSE) — Jace Sleeman
