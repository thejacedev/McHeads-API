# Minecraft Heads API — [mcheads.org](https://mcheads.org)

A self-hosted Node.js/Express API for generating Minecraft player head, avatar, and body renders. Supports both **Java Edition** (Mojang API) and **Bedrock Edition** (GeyserMC API) with automatic edition detection and 1-hour SQLite caching.

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

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `3005` | Port the server listens on |
| `DATABASE_URL` | — | PostgreSQL connection string (uses SQLite if not set) |

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
| `GET /ioshead/:input/:direction` | Isometric head (`left` or `right`) |
| `GET /iosbody/:input/:direction` | Isometric body (`left` or `right`) |

### Utility

| Endpoint | Description |
|---|---|
| `GET /minecraft/mhf` | List all MHF preset heads |
| `GET /allstats` | Java Edition usage stats |
| `GET /allstatsbedrock` | Bedrock Edition usage stats |
| `GET /allstatsSorted` | All stats sorted by usage |
| `GET /health` | API health status |

### Parameters

- `:input` — Java username, Java UUID, Bedrock XUID (`0000…`), or Bedrock gamertag (`.Name`)
- `:size` — Output size in pixels (default: `128`)
- `:direction` — `left` or `right` (iOS endpoints only)

## Usage Examples

```bash
# Java — username
curl http://localhost:3005/avatar/Notch/left/64

# Java — UUID
curl http://localhost:3005/head/069a79f444e94726a5befca90e38aaf5/256

# Bedrock — gamertag
curl http://localhost:3005/head/.ExampleGamertag/128

# Bedrock — XUID
curl http://localhost:3005/avatar/0000123456789/64

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
| Starts with `0000` | Bedrock (XUID) |
| Starts with `.` | Bedrock (gamertag) |
| Anything else | Java (username or UUID) |

Bedrock players fall back to the Steve skin if no skin data is found.

## Caching

All renders are cached for **1 hour** in a local SQLite database. Cache keys include the endpoint, input, size, and options. The database file is excluded from version control.

## Project Structure

```
server.js           Main entry point
routes/             Route handlers (one per endpoint group)
utils/
  minecraft.js      Mojang + GeyserMC API integration
  imageProcessor.js Sharp/Jimp image rendering
  database.js       SQLite caching and stats
  mhfHeads.js       MHF UUID mappings
  urlHelpers.js     Parameter sanitization
```

## Contributing

Pull requests are welcome. For major changes please open an issue first.

1. Fork the repo
2. Create a feature branch (`git checkout -b feature/my-feature`)
3. Commit your changes
4. Push and open a PR

## License

[MIT](LICENSE) — Jace Sleeman
