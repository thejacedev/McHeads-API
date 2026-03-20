---
order: 90
title: FAQ
---

# Frequently Asked Questions

Common questions about the Minecraft Heads API, covering editions, sizes, caching,
rate limiting, self-hosting, and edge cases.

---

## What Minecraft editions are supported?

Both **Java Edition** and **Bedrock Edition** are supported.

- **Java Edition** -- pass a Java username (e.g., `Notch`) or a UUID
  (with or without dashes).
- **Bedrock Edition** -- prefix a gamertag with a dot (e.g., `.BedrockPlayer`)
  or pass an XUID that starts with `0000`.

The API auto-detects the edition from the input format. Java lookups go through
the Mojang API; Bedrock lookups go through the GeyserMC API.

---

## What sizes can I request?

You can pass any positive integer as the `size` parameter. There is no hard upper
limit enforced by the API, but keep in mind:

- Minecraft skins are **64x64 pixels** at their native resolution.
- For 2D head renders (`/head`), the 8x8 face region is upscaled with
  nearest-neighbor interpolation, so very large sizes (e.g., 2048+) will simply
  produce large blocky pixels, which is the expected Minecraft aesthetic.
- For isometric renders (`/avatar`, `/ioshead`, `/iosbody`), the internal working
  canvas scales to multiples of 120 px, and the final image is resampled with
  Lanczos3. Sizes up to around 512 px produce good results.
- The default size is **128 px** for most endpoints. The isometric iOS endpoints
  default to **64 px**.

If no size is specified, the default is used. If you pass a non-numeric value, it
falls back to 128.

---

## Is there rate limiting?

The API itself does not enforce rate limiting at the application level. However:

- The **Mojang API** has its own rate limits. If you send too many unique username
  lookups in a short window, Mojang may temporarily block requests. Cached
  responses bypass Mojang entirely, so repeated requests for the same player are
  cheap.
- If you are self-hosting, consider adding a reverse proxy (nginx, Cloudflare)
  with rate limiting to protect against abuse.
- If you are using a hosted instance, check with the operator for their specific
  rate-limiting policy.

---

## How long are images cached?

Rendered images are cached for **1 hour** (3600 seconds). The cache key is built
from the endpoint name, player input, size, and any options:

```
{endpoint}_{input}_{size}_{option}
```

For example, a request to `/head/Notch/256/hat` produces the cache key
`head_Notch_256_hat`. After one hour, the next request for the same key triggers
a fresh render and updates the cache.

The cache lives in either **SQLite** (default, stored in
`new_minecraft_heads.db`) or **PostgreSQL** (when `DATABASE_URL` is set). Expired
entries are not automatically purged on a schedule -- they are simply ignored on
lookup and overwritten on the next request for the same key.

---

## Can I use UUIDs instead of usernames?

Yes. You can pass either a **dashed UUID** or a **short (undashed) UUID**:

```
GET /head/069a79f444e94726a5befca90e38aaf5
GET /head/069a79f4-44e9-4726-a5be-fca90e38aaf5
```

When a UUID is detected, the API skips the username-to-UUID lookup and goes
directly to the Mojang session server for the profile, saving one network round
trip.

---

## What about Bedrock players?

Bedrock players are supported through the **GeyserMC API**
(`api.geysermc.org/v2`). To look up a Bedrock player:

- Prefix the gamertag with a dot: `/head/.BedrockPlayer`
- Or pass the XUID directly (starts with `0000`): `/head/0000000000012345`

If the GeyserMC API returns no skin data for a Bedrock player, the API
automatically falls back to the default **Steve** skin. If the GeyserMC API is
unreachable, the same Steve fallback applies. This means Bedrock requests never
produce a hard error for missing skins.

---

## What are MHF heads?

**MHF** stands for **Minecraft Heads Format**. These are pre-defined player heads
created by Mojang that render as specific mobs or characters. They are commonly
used on Minecraft servers for decorative purposes.

The API exposes the full list at:

```
GET /minecraft/mhf
```

This returns a JSON object mapping UUIDs to MHF names:

```json
{
  "c06f89064c8a49119c29ea1dbd1aab82": "MHF_Steve",
  "f7c77d6e15b5a8d3f5b9a8b5c5d2f8a4": "MHF_Alex",
  "f4254a8e93e4455b8c8a6b6b6f6d6e6f": "MHF_Creeper",
  ...
}
```

Available MHF heads include: Steve, Alex, Creeper, Zombie, Skeleton, Spider,
Enderman, Slime, Ghast, Blaze, Pig, Cow, Chicken, Sheep, Squid, Villager, Golem,
Ocelot, Herobrine, LavaSlime, Mooshroom, CaveSpider, Wolf, and Witch.

---

## Is the API free to use?

Yes. The Minecraft Heads API is open source under the **MIT License**. You are
free to use it in personal projects, commercial products, server plugins, or
anything else. Attribution is appreciated but not required.

---

## Can I self-host it?

Absolutely. Self-hosting is straightforward:

1. Clone the repository.
2. Run `npm install` to install dependencies (Sharp, Jimp, canvas, etc.).
3. Run `npm start` to start the server on port 3005.

By default, the API uses **SQLite** for caching and stats, which requires no
external database setup. If you prefer PostgreSQL, set the `DATABASE_URL`
environment variable. See [Environment Variables](reference/environment.md) for
details.

System requirements for self-hosting:

- **Node.js** 18+ (for native module compatibility with Sharp and canvas).
- **Build tools** for native modules: `build-essential`, `libcairo2-dev`,
  `libjpeg-dev`, `libpango1.0-dev`, `libgif-dev`, and `librsvg2-dev` on
  Debian/Ubuntu; equivalent packages on other distributions.
- Approximately **100 MB disk** for `node_modules` (Sharp ships prebuilt
  binaries for most platforms).

---

## What if the Mojang API is down?

If the Mojang API is unreachable or returns an error:

- **Cached responses** are still served normally. The 1-hour cache means most
  popular players will continue to work even during an outage.
- **Uncached requests** will return a `500` error with a JSON body:
  ```json
  { "error": "Failed to render head" }
  ```
- The `/health` endpoint actively checks Mojang API availability and reports
  the current status. A `red` external API status indicates Mojang is
  unreachable; `yellow` indicates a slow response.

For Bedrock players, if the GeyserMC API is down, the API falls back to the
Steve skin rather than returning an error.

---

## Can I append .png to URLs?

Yes. The API automatically strips `.png` suffixes from all parameters. These
requests are equivalent:

```
GET /head/Notch/128
GET /head/Notch/128.png
```

This is useful when embedding images in HTML or Markdown where the URL is
expected to end with an image extension.

---

## What image format is returned?

All image endpoints return **PNG** format with `Content-Type: image/png`. PNG is
used because it supports transparency (important for hat overlays and isometric
renders) and lossless compression (important for the blocky pixel art aesthetic
of Minecraft skins).

---

## How does the hat/overlay layer work?

Minecraft skins have two layers: a **base layer** and an **overlay (hat) layer**.
The overlay sits on top of the base and is commonly used for glasses, hats, beards,
or other accessories.

To include the hat layer in a head or body render, pass `hat` as the option
parameter:

```
GET /head/Notch/128/hat
GET /player/Notch/128/hat
```

Isometric renders (`/avatar`, `/ioshead`, `/iosbody`) include overlay layers from
the skin by default as part of the isometric face composition. They read all six
cube faces plus their overlay counterparts.

---

## What is the difference between /avatar and /iosbody?

Both endpoints produce an isometric 3D body render using the same underlying
`createIsometricBodyRender` function. The difference is in the URL format:

- `/avatar/:input/:direction/:size?` -- the size is the third path segment.
- `/iosbody/:input/:direction/:option?` -- the size is passed as the `option`
  segment, and defaults to 64 instead of 128.

The `/ioshead` and `/iosbody` routes were originally created for an iOS
application and use a slightly different parameter layout. Both route families
produce identical image output.

---

## How are stats tracked?

Every request to a rendering endpoint increments a counter in the database,
grouped by edition (`java` or `bedrock`). You can query these stats:

| Endpoint | Returns |
| -------- | ------- |
| `GET /allstats` | Java request count |
| `GET /allstatsbedrock` | Bedrock request count |
| `GET /allstatsSorted` | All editions sorted by count |

Stats are stored in the same database (SQLite or PostgreSQL) used for caching.
