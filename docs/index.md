---
order: 1
title: Home
---

# Minecraft Heads API Documentation

The Minecraft Heads API is a free, open-source REST service that renders Minecraft player
heads, full bodies, isometric 3D avatars, and raw skins on the fly. It supports both
**Java Edition** and **Bedrock Edition** players, accepts usernames or UUIDs as input,
and returns optimized PNG images ready to embed in websites, apps, or game overlays.

The server is built on **Express.js** and uses three image-processing libraries --
Sharp, Jimp, and node-canvas -- to handle everything from pixel-level skin extraction
to full isometric 3D projections. Rendered images are cached in either SQLite or
PostgreSQL so repeat requests are served instantly.

---

## Quick Start

Get a player's head (128 px, the default):

```
GET /head/Notch
```

Get a head with the hat overlay at 256 px:

```
GET /head/Notch/256/hat
```

Full 2D body render:

```
GET /player/Notch/128/hat
```

Isometric 3D body, facing right, 200 px wide:

```
GET /avatar/Notch/right/200
```

Isometric 3D head only:

```
GET /ioshead/Notch/right/128
```

Raw skin texture download:

```
GET /skin/Notch
```

Skin file download (triggers browser save-as):

```
GET /download/Notch
```

MHF (Minecraft Heads Format) mob head list:

```
GET /minecraft/mhf
```

---

## Bedrock Edition

Prefix the player identifier with a dot to request a Bedrock player by gamertag,
or pass an XUID that starts with `0000`:

```
GET /head/.BedrockPlayer
GET /head/0000000000012345
```

If a Bedrock player has no custom skin, the API gracefully falls back to the
default Steve skin.

---

## API Endpoints at a Glance

| Endpoint | Description | Parameters |
| -------- | ----------- | ---------- |
| `GET /head/:input/:size?/:option?` | 2D head render | `size` (px), `option` = `hat` |
| `GET /player/:input/:size?/:option?` | 2D full body render | `size` (px), `option` = `hat` |
| `GET /avatar/:input/:direction/:size?` | Isometric 3D body | `direction` = `left` or `right`, `size` (px) |
| `GET /ioshead/:input/:direction/:option?` | Isometric 3D head | `direction` = `left` or `right`, `option` = size (px) |
| `GET /iosbody/:input/:direction/:option?` | Isometric 3D body (alt) | `direction` = `left` or `right`, `option` = size (px) |
| `GET /skin/:input` | Raw skin texture | -- |
| `GET /download/:input` | Skin file download | -- |
| `GET /minecraft/mhf` | MHF mob head list | -- |
| `GET /allstats` | Java request count | -- |
| `GET /allstatsbedrock` | Bedrock request count | -- |
| `GET /allstatsSorted` | All stats, sorted | -- |
| `GET /health` | Health check | -- |

All image endpoints return `Content-Type: image/png`. The `.png` extension is
optional and automatically stripped from parameters, so `/head/Notch/128.png`
works the same as `/head/Notch/128`.

---

## Documentation Sections

### [Rendering](rendering/)

How the API turns a 64x64 skin texture into the images you see: the image
libraries involved, head rendering, body rendering, isometric 3D projection,
and the caching layer.

### [Reference](reference/)

Technical reference material: the Minecraft skin texture format, Mojang and
Geyser API integration, error codes, and environment variable configuration.

---

## Running Locally

```bash
git clone <repo-url>
cd MCHeadsApiUpdated
npm install
npm start          # production
npm run dev        # development with nodemon
```

The server starts on port **3005** by default. Set the `PORT` environment
variable to change it. See [Environment Variables](reference/environment.md) for
all configuration options.

---

## License

MIT License -- Copyright (c) 2026 Jace Sleeman. See `LICENSE` for full text.
