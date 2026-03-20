---
title: Quick Start
order: 2
---

# Quick Start

This guide walks through using the Minecraft Heads API to fetch player renders. All endpoints return PNG images and require no authentication.

## Base URL

The public instance is available at:

```
https://api.mcheads.org
```

If you are self-hosting, replace this with your own server address (e.g., `http://localhost:3005`).

## Player Input Formats

Every render endpoint accepts a `:input` parameter that identifies the player. The API accepts several formats:

| Format | Example | Edition |
|---|---|---|
| Java username | `Notch` | Java |
| Java UUID (no dashes) | `069a79f444e94726a5befca90e38aaf5` | Java |
| Java UUID (with dashes) | `069a79f4-44e9-4726-a5be-fca90e38aaf5` | Java |
| Bedrock XUID | `0000123456789` | Bedrock |
| Bedrock gamertag | `.ExampleGamertag` | Bedrock |

Bedrock gamertags must be prefixed with a dot (`.`) to distinguish them from Java usernames.

## Get a Player Head

The `/head` endpoint renders the front face of a player's head, scaled to the requested pixel size.

```
GET /head/:input/:size
```

**Examples:**

```bash
# 128x128 head of Notch
curl -o notch_head.png https://api.mcheads.org/head/Notch/128

# 64x64 head using a UUID
curl -o head.png https://api.mcheads.org/head/069a79f444e94726a5befca90e38aaf5/64

# 256x256 head of a Bedrock player
curl -o bedrock_head.png https://api.mcheads.org/head/.ExampleGamertag/256
```

The size parameter is optional and defaults to `128` if omitted:

```bash
# Defaults to 128x128
curl -o head.png https://api.mcheads.org/head/Notch
```

### Head with Hat Overlay

Add `/hat` to include the hat overlay layer (the second layer on a Minecraft skin that sits on top of the head):

```bash
curl -o notch_hat.png https://api.mcheads.org/head/Notch/128/hat
```

This composites the overlay on top of the base head, which is useful for players whose skins include hats, masks, or other head decorations.

## Get a Full Body

The `/player` endpoint renders the player's full body, including head, torso, arms, and legs.

```
GET /player/:input/:size
```

The output image dimensions are `size` wide by `size * 2` tall, since a Minecraft player body is roughly twice as tall as it is wide.

**Examples:**

```bash
# Full body at 128px wide (128x256 output)
curl -o notch_body.png https://api.mcheads.org/player/Notch/128

# Full body at 256px wide (256x512 output)
curl -o body_large.png https://api.mcheads.org/player/Notch/256

# Full body with hat overlay layers
curl -o body_hat.png https://api.mcheads.org/player/Notch/128/hat
```

The body render supports both old-format (64x32) and new-format (64x64) skins. For old-format skins, the right arm and right leg are mirrored copies of the left side.

## Get an Isometric View

The `/avatar` endpoint renders a 3D isometric full body, projected at an angle so you can see the front and one side of the player.

```
GET /avatar/:input/:direction/:size
```

The `:direction` parameter must be either `left` or `right`, controlling which side of the player is visible:

```bash
# Isometric body, left-facing, 128px
curl -o notch_iso_left.png https://api.mcheads.org/avatar/Notch/left/128

# Isometric body, right-facing, 256px
curl -o notch_iso_right.png https://api.mcheads.org/avatar/Notch/right/256
```

### Isometric Head Only

If you only need the head in isometric view:

```
GET /ioshead/:input/:direction
```

```bash
curl -o iso_head.png https://api.mcheads.org/ioshead/Notch/left
```

### Isometric Body (Alternative)

The `/iosbody` endpoint is an alternative isometric body render:

```
GET /iosbody/:input/:direction
```

```bash
curl -o iso_body.png https://api.mcheads.org/iosbody/Notch/right
```

The `/ioshead` and `/iosbody` endpoints default to a size of `64` pixels. You can pass a size as the third path segment if you need a different resolution.

## Get a Raw Skin

The `/skin` endpoint returns the original skin texture file as a PNG, without any rendering or cropping.

```
GET /skin/:input
```

```bash
# View the raw skin texture
curl -o notch_skin.png https://api.mcheads.org/skin/Notch
```

This returns the full 64x64 (or 64x32 for legacy skins) texture file exactly as stored by Mojang or GeyserMC.

### Download as File Attachment

The `/download` endpoint works the same as `/skin`, but sets the `Content-Disposition` header so the browser downloads the file instead of displaying it:

```
GET /download/:input
```

```bash
curl -OJ https://api.mcheads.org/download/Notch
```

The downloaded file will be named `{input}_skin.png` (e.g., `Notch_skin.png`).

## MHF Preset Heads

Mojang provides a set of well-known UUIDs for common mob and item textures. You can use these with any render endpoint:

```bash
# Creeper head
curl -o creeper.png https://api.mcheads.org/head/MHF_Creeper/128

# Skeleton head
curl -o skeleton.png https://api.mcheads.org/head/MHF_Skeleton/128
```

To list all available MHF heads:

```bash
curl https://api.mcheads.org/minecraft/mhf
```

This returns a JSON array of available MHF names and their UUIDs.

## Using in HTML

Since all render endpoints return PNG images, you can use them directly in `<img>` tags:

```html
<!-- Player head as an avatar -->
<img src="https://api.mcheads.org/head/Notch/64" alt="Notch" />

<!-- Full body in a profile card -->
<img src="https://api.mcheads.org/player/Notch/128" alt="Notch's skin" />

<!-- Isometric render -->
<img src="https://api.mcheads.org/avatar/Notch/left/128" alt="Notch 3D" />
```

The API sets CORS headers, so requests from any origin are allowed. Images can be loaded from any website without cross-origin issues.

## Appending .png

All endpoints support an optional `.png` suffix on the last path segment. The API strips it automatically, so these are equivalent:

```
GET /head/Notch/128
GET /head/Notch/128.png
```

This is useful when embedding in contexts that expect image URLs to end with a file extension.

## Error Handling

If a render fails (player not found, upstream API error, etc.), the API returns a JSON error response with an appropriate HTTP status code:

```json
{
    "error": "Failed to render head"
}
```

Common error scenarios:

| Scenario | HTTP Status | Response |
|---|---|---|
| Invalid player name or UUID | 500 | `{"error": "Failed to render head"}` |
| Invalid direction (not `left`/`right`) | 400 | `{"error": "Direction must be \"left\" or \"right\""}` |
| Upstream API down | 500 | `{"error": "Failed to render head"}` |

## Response Headers

All image responses include:

- `Content-Type: image/png`
- CORS headers (via the `cors` middleware)
- Security headers (via Helmet)
- Gzip compression (via the `compression` middleware)
