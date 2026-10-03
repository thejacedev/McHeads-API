---
title: Player Body Render
order: 3
---

# Player Body Render

Renders a full front-facing body of a Minecraft player as a flat 2D PNG image. The render composites the head, torso, both arms, and both legs extracted from the skin texture into a single image. It supports both legacy (64x32) and modern (64x64) skin formats, classic and slim arm models, and can optionally include overlay layers.

## Endpoint

```
GET /player/:input/:size?/:option?
```

## Parameters

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `input` | string | Yes | -- | Player identifier. Accepts a Java username, UUID (with or without dashes), Bedrock XUID prefixed with `0000` (e.g., `00002535468413142004`), Floodgate UUID, or dot-prefixed Bedrock gamertag (e.g., `.SomePlayer`). |
| `size` | integer | No | `128` | Base size unit in pixels. The output image dimensions are `size` wide by `size * 2` tall. Missing, non-numeric or non-positive values fall back to 128; other values are clamped to 8–512. |
| `option` | string | No | -- | Pass `"hat"` to composite the overlay layers on top of the base body parts: all of them (head, torso, arms, legs) for 64x64 skins, only the head overlay for legacy 64x32 skins. |

All parameters automatically have any trailing `.png` suffix stripped before processing.

## Output Dimensions

The output image is always `size x (size * 2)` pixels. For the default size of 128, the output is **128 x 256 pixels**.

| Size | Output |
|------|--------|
| 64 | 64 x 128 |
| 128 | 128 x 256 |
| 256 | 256 x 512 |
| 512 | 512 x 1024 |

512 is the maximum: larger sizes are clamped to 512, and sizes below 8 are raised to 8.

## How It Works

The body render (`createBodyRender`) decodes the skin once with Sharp into raw RGBA pixels, then draws each body part onto a blank output buffer by nearest-neighbor sampling its region of the skin. The parts are described by a layout table (`BODY_PARTS`) on a 16x32 grid of skin pixels, so each grid unit is `size / 16` output pixels. Overlays are blended source-over on straight alpha, so semi-transparent overlay pixels are preserved. Sharp then encodes the result as PNG.

Part edges are rounded individually, so parts stay flush with no gaps when `size` isn't a multiple of 16. HD skins (wider than 64 pixels) are supported; texture coordinates are scaled by `width / 64`.

### Body Part Layout

The body parts are positioned on the output canvas as follows (using `size` as the base unit). "Right" and "left" are the player's own sides, so the right arm appears on the viewer's left:

| Part | Skin Crop (x, y, w, h) | Canvas Position (x, y) | Scaled Size (w, h) |
|------|------------------------|----------------------|-------------------|
| Head | (8, 8, 8, 8) | (size/4, 0) | size/2, size/2 |
| Torso | (20, 20, 8, 12) | (size/4, size/2) | size/2, size*3/4 |
| Right Arm (viewer's left) | (44, 20, 4, 12) | (0, size/2) | size/4, size*3/4 |
| Left Arm (viewer's right) | (36, 52, 4, 12)* | (size*3/4, size/2) | size/4, size*3/4 |
| Right Leg (viewer's left) | (4, 20, 4, 12) | (size/4, size*5/4) | size/4, size*3/4 |
| Left Leg (viewer's right) | (20, 52, 4, 12)* | (size/2, size*5/4) | size/4, size*3/4 |

*Left arm and left leg coordinates are for the modern (64x64) skin format. See the legacy format section below.

### Slim (Alex) Arms

When the player's skin uses the slim model (Mojang's or GeyserMC's textures data contains `metadata.model: "slim"`), the arms are 3 skin pixels wide instead of 4: each arm is cropped 3 pixels wide and drawn `size*3/16` wide. The right arm (viewer's left) is shifted 1 grid unit (`size/16`) toward the torso so it stays attached. Slim arms only apply to modern-format (square) skins.

### Legacy vs. Modern Skin Formats

The renderer detects the skin format from the image dimensions:

- **Modern format** (64x64, or any square HD size): The skin has distinct textures for left and right limbs. The left arm and left leg are extracted from the bottom half of the skin.
- **Legacy format** (64x32, or any 2:1 HD size): The skin only stores the right arm and right leg. The left arm and left leg are drawn as horizontally mirrored copies of them.

```javascript
function skinFormat(width, height) {
    if (!width || (height !== width && height * 2 !== width)) {
        throw new Error(`Unsupported skin dimensions: ${width}x${height}`);
    }
    return { scale: width / 64, isNewFormat: height === width };
}
```

### Hat/Overlay Layers

When the `hat` option is enabled, overlay layers are composited on top of each body part:

| Part | Overlay Crop (x, y, w, h) | Notes |
|------|--------------------------|-------|
| Head overlay | (40, 8, 8, 8) | All skins |
| Torso overlay | (20, 36, 8, 12) | Modern format only |
| Right Arm overlay | (44, 36, 4, 12) | Modern format only |
| Left Arm overlay | (52, 52, 4, 12) | Modern format only |
| Right Leg overlay | (4, 36, 4, 12) | Modern format only |
| Left Leg overlay | (4, 52, 4, 12) | Modern format only |

For legacy skins, only the head overlay is drawn, because the 64x32 texture has no other overlay regions.

## Response

| Header | Value |
|--------|-------|
| `Content-Type` | `image/png` |
| `Cache-Control` | `public, max-age=3600` |

The response body is the raw PNG binary data.

## Examples

### Default body render (128x256)

```bash
curl -o player.png https://your-domain.com/player/Notch
```

```
GET /player/Notch
```

Returns a 128x256 PNG of Notch's full body.

### Custom size

```bash
curl -o player_64.png https://your-domain.com/player/Notch/64
```

```
GET /player/Notch/64
```

Returns a 64x128 PNG.

### With overlay layers

```bash
curl -o player_hat.png https://your-domain.com/player/Notch/128/hat
```

```
GET /player/Notch/128/hat
```

Returns a 128x256 PNG with the overlay layers composited on top: hat, jacket, sleeves and pants for a 64x64 skin. Notch's skin is a legacy 64x32 skin, so in this example only the hat layer is added.

### Large render

```bash
curl -o player_large.png https://your-domain.com/player/Notch/512/hat
```

```
GET /player/Notch/512/hat
```

Returns a 512x1024 PNG with overlays.

### Using a UUID

```bash
curl -o player_uuid.png https://your-domain.com/player/069a79f444e94726a5befca90e38aaf5/256
```

### Bedrock player

```bash
curl -o player_bedrock.png https://your-domain.com/player/.SomePlayer/128/hat
```

### With .png suffix

```bash
curl -o player.png https://your-domain.com/player/Notch.png/128.png
```

Equivalent to `/player/Notch/128`.

### Embedding in HTML

```html
<img
  src="https://your-domain.com/player/Notch/64/hat"
  alt="Notch's body"
  width="64"
  height="128"
/>
```

## Error Responses

| Status | Body | When |
|--------|------|------|
| 400 | `{"error": "Invalid player identifier"}` | The `input` doesn't match any accepted format |
| 404 | `{"error": "Player not found"}` | Mojang or GeyserMC reports that the player doesn't exist |
| 502 | `{"error": "Failed to render player"}` | Mojang, GeyserMC or the texture server failed or timed out |
| 500 | `{"error": "Failed to render player"}` | Any other failure, e.g. a skin with unsupported dimensions |

```
HTTP/1.1 404 Not Found
Content-Type: application/json

{
  "error": "Player not found"
}
```

Players who exist but have no custom skin are rendered with the default skin rather than returning an error.

## Caching

Responses are cached for 1 hour. Cache key format:

```
player:{playerId}:{size}:{hat|nohat}
```

For example, `/player/Notch/128/hat` uses `player:name:notch:128:hat`. The `playerId` is normalized and the size is the parsed value, so `/player/Notch` and `/player/notch/128` share an entry.

## URL Patterns

```
/player/Notch
/player/Notch/256
/player/Notch/256/hat
/player/Notch.png
/player/069a79f444e94726a5befca90e38aaf5
/player/069a79f4-44e9-4726-a5be-fca90e38aaf5/128/hat
/player/00002535468413142004/64
/player/00000000-0000-0000-0009-01febe1ac3f4/128
/player/.SomePlayer/128/hat
```

## Visual Layout

The following diagram shows how the body parts are arranged in the output image, as seen by the viewer. Each cell represents a quarter of the `size` unit:

```
         +------+------+
         | Head | Head |     <- size/2 x size/2, centered
         +------+------+
  +------+------+------+------+
  | Right|  Torso      | Left |  <- size/4 x size*3/4 (arms; size*3/16 wide when slim)
  | Arm  |             | Arm  |     size/2 x size*3/4 (torso)
  |      |             |      |
  +------+------+------+------+
         | Right| Left |
         | Leg  | Leg  |     <- size/4 x size*3/4 each
         |      |      |
         +------+------+
```

Total output: `size` wide, `size * 2` tall.
