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
- **Bedrock Edition** -- prefix a gamertag with a dot (e.g., `.BedrockPlayer`),
  pass an XUID prefixed with `0000` (e.g., `00002535468413142004`), or pass a
  Floodgate UUID (e.g., `00000000-0000-0000-0009-01febe1ac3f4`).

The API auto-detects the edition from the input format. Java lookups go through
the Mojang API; Bedrock lookups go through the GeyserMC API. Input that matches
no format is rejected with HTTP 400 `{"error": "Invalid player identifier"}`.

---

## What sizes can I request?

Sizes from **8 to 512** pixels. Larger values are clamped to 512 and smaller
positive values are raised to 8, so `/head/Notch/2000` returns a 512x512 image.
Keep in mind:

- Minecraft skins are **64x64 pixels** at their native resolution.
- For 2D head renders (`/head`), the 8x8 face region is upscaled with
  nearest-neighbor interpolation, so large sizes simply produce large blocky
  pixels, which is the expected Minecraft aesthetic.
- For isometric renders (`/avatar`, `/ioshead`, `/iosbody`), the internal working
  canvas scales to multiples of 120 px, and the final image is resampled with
  Lanczos3.
- The default size is **128 px** for most endpoints. The isometric iOS endpoints
  default to **64 px**.

If no size is specified, or you pass a non-numeric, zero or negative value, the
endpoint's default is used.

---

## Is there rate limiting?

Rate limiting is optional and off by default. A server operator can enable a
per-IP limit by setting `RATE_LIMIT_PER_MINUTE`; requests over the limit get
HTTP 429 `{"error": "Too many requests"}` with a `Retry-After` header. In
addition:

- The **Mojang API** has its own rate limits. If you send too many unique username
  lookups in a short window, Mojang may temporarily block requests. Cached
  responses bypass Mojang entirely, so repeated requests for the same player are
  cheap.
- If you are self-hosting behind a reverse proxy, set `TRUST_PROXY` so the
  built-in limiter sees client IPs instead of the proxy's. The limiter keeps its
  counts in memory per process; you can also rate limit at the proxy (nginx,
  Cloudflare).
- If you are using a hosted instance, check with the operator for their specific
  rate-limiting policy.

---

## How long are images cached?

Rendered images are cached for **1 hour** (3600 seconds), and image responses
send `Cache-Control: public, max-age=3600`. The cache key is built from the
endpoint name, the normalized player, and the parsed size and options:

```
{endpoint}:{playerId}:{part}...
```

For example, a request to `/head/Notch/256/hat` produces the cache key
`head:name:notch:256:hat`, and `/avatar/Notch/right/128` produces
`avatar:name:notch:right:128`. Usernames and gamertags are lowercased, so
`/head/Notch` and `/head/notch` share an entry. After one hour, the next request
for the same key triggers a fresh render and updates the cache.

The cache lives in either **SQLite** (default, stored in
`new_minecraft_heads.db` or `SQLITE_PATH`) or **PostgreSQL** (when `DATABASE_URL`
is set). Expired entries are ignored on lookup and deleted at startup and every
10 minutes. Player lookups (10 minutes) and downloaded skin textures (24 hours)
are also cached in memory.

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
- Or pass the XUID prefixed with `0000`: `/head/00002535468413142004`
- Or pass a Floodgate UUID: `/head/00000000-0000-0000-0009-01febe1ac3f4`

If GeyserMC has no skin stored for the player (it returns `{}`), the API uses
the default (classic Steve) skin. If GeyserMC doesn't know the gamertag, the
API returns `404 Player not found`. If the GeyserMC API fails or times out, the
API returns a `502` error, the same as for Java players when Mojang is down.

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
  "6ab4317889fd490597f60f67d9d76fd9": "MHF_Alex",
  "057b1c4713214863a6fe8887f9ec265f": "MHF_Creeper",
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
2. Run `npm install` to install dependencies (Sharp, canvas, etc.).
3. Run `npm start` to start the server on port 3005.

By default, the API uses **SQLite** for caching and stats, which requires no
external database setup. If you prefer PostgreSQL, set the `DATABASE_URL`
environment variable. See [Environment Variables](reference/environment.md) for
details.

System requirements for self-hosting:

- **Node.js** 20+ (`better-sqlite3` 12 requires it; the test suite uses Node's
  built-in test runner).
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
- **Uncached requests** will return a `502` error with the endpoint's generic
  message once the upstream request fails or times out (after 10 seconds by default), unless an older cached copy of the image exists:
  ```json
  { "error": "Failed to render head" }
  ```
- The `/health` endpoint actively checks Mojang API availability and reports
  the current status. A `red` external API status indicates Mojang is
  unreachable; `yellow` indicates a slow response.

For Bedrock players, a GeyserMC outage is handled the same way: cached
responses still work and uncached requests get a `502`.

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

For `/player`, `hat` adds every overlay layer on 64x64 skins, but only the head
overlay on legacy 64x32 skins, which have no other overlay regions.

Isometric renders (`/avatar`, `/ioshead`, `/iosbody`) include overlay layers from
the skin by default as part of the isometric face composition.

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

Every image served by a rendering endpoint, including images served from the
cache, increments a counter in the database, grouped by edition (`java` or
`bedrock`). Failed requests are not counted. You can query these stats:

| Endpoint | Returns |
| -------- | ------- |
| `GET /allstats` | Java request count |
| `GET /allstatsbedrock` | Bedrock request count |
| `GET /allstatsSorted` | All editions sorted by count |

Stats are stored in the same database (SQLite or PostgreSQL) used for caching.
