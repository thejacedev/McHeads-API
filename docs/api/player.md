---
title: Player Body Render
order: 3
---

# Player Body Render

Renders a full front-facing body of a Minecraft player as a flat 2D PNG image. The render composites the head, torso, both arms, and both legs extracted from the skin texture into a single image. It supports both legacy (64x32) and modern (64x64) skin formats and can optionally include overlay layers.

## Endpoint

```
GET /player/:input/:size?/:option?
```

## Parameters

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `input` | string | Yes | -- | Player identifier. Accepts a Java username, UUID (with or without dashes), Bedrock XUID (starts with `0000`), or dot-prefixed Bedrock gamertag (e.g., `.SomePlayer`). |
| `size` | integer | No | `128` | Base size unit in pixels. The output image dimensions are `size` wide by `size * 2` tall. |
| `option` | string | No | -- | Pass `"hat"` to composite all overlay layers (head, torso, arms, legs) on top of the base body parts. |

All parameters automatically have any trailing `.png` suffix stripped before processing.

## Output Dimensions

The output image is always `size x (size * 2)` pixels. For the default size of 128, the output is **128 x 256 pixels**.

| Size | Output |
|------|--------|
| 64 | 64 x 128 |
| 128 | 128 x 256 |
| 256 | 256 x 512 |
| 512 | 512 x 1024 |

## How It Works

The body render uses Jimp to composite individual body parts from the skin texture onto a blank canvas. Each part is cropped from its location on the skin, scaled with nearest-neighbor resampling, and positioned according to the Minecraft player model proportions.

### Body Part Layout

The body parts are positioned on the output canvas as follows (using `size` as the base unit):

| Part | Skin Crop (x, y, w, h) | Canvas Position (x, y) | Scaled Size (w, h) |
|------|------------------------|----------------------|-------------------|
| Head | (8, 8, 8, 8) | (size/4, 0) | size/2, size/2 |
| Torso | (20, 20, 8, 12) | (size/4, size/2) | size/2, size*3/4 |
| Left Arm | (44, 20, 4, 12) | (0, size/2) | size/4, size*3/4 |
| Right Arm | (36, 52, 4, 12)* | (size*3/4, size/2) | size/4, size*3/4 |
| Left Leg | (4, 20, 4, 12) | (size/4, size*5/4) | size/4, size*3/4 |
| Right Leg | (20, 52, 4, 12)* | (size/2, size*5/4) | size/4, size*3/4 |

*Right arm and right leg coordinates are for the modern (64x64) skin format. See the legacy format section below.

### Legacy vs. Modern Skin Formats

The renderer detects the skin format by checking the image height:

- **Modern format** (64x64): The skin has distinct textures for left and right limbs. Right arm and right leg are extracted from the bottom half of the skin.
- **Legacy format** (64x32): The skin only defines left-side limbs. The right arm and right leg are created by horizontally flipping the left arm and left leg respectively.

```javascript
const isNewFormat = skin.bitmap.height >= 64;
```

### Hat/Overlay Layers

When the `hat` option is enabled, overlay layers are composited on top of each body part:

| Part | Overlay Crop (x, y, w, h) | Notes |
|------|--------------------------|-------|
| Head overlay | (40, 8, 8, 8) | Always available |
| Torso overlay | (20, 36, 8, 12) | Always available |
| Left Arm overlay | (44, 36, 4, 12) | Always available |
| Right Arm overlay | (52, 52, 4, 12) | Modern format only |
| Left Leg overlay | (4, 36, 4, 12) | Always available |
| Right Leg overlay | (4, 52, 4, 12) | Modern format only |

For legacy skins, right-side overlay layers are not rendered because they do not exist in the 64x32 texture.

## Response

| Header | Value |
|--------|-------|
| `Content-Type` | `image/png` |

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

Returns a 128x256 PNG with all overlay layers (hat, jacket, sleeves, pants) composited on top.

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

### Player not found or render failure

```
HTTP/1.1 500 Internal Server Error
Content-Type: application/json

{
  "error": "Failed to render player"
}
```

This error is returned when the player cannot be resolved, the skin has no URL, or the image processing fails.

## Caching

Responses are cached for 1 hour. Cache key format:

```
player_{input}_{size|default}_{option|default}
```

## URL Patterns

```
/player/Notch
/player/Notch/256
/player/Notch/256/hat
/player/Notch.png
/player/069a79f444e94726a5befca90e38aaf5
/player/069a79f4-44e9-4726-a5be-fca90e38aaf5/128/hat
/player/0000000000000001/64
/player/.SomePlayer/128/hat
```

## Visual Layout

The following diagram shows how the body parts are arranged in the output image. Each cell represents a quarter of the `size` unit:

```
         +------+------+
         | Head | Head |     <- size/2 x size/2, centered
         +------+------+
  +------+------+------+------+
  | Left |  Torso      | Right|  <- size/4 x size*3/4 (arms)
  | Arm  |             | Arm  |     size/2 x size*3/4 (torso)
  |      |             |      |
  +------+------+------+------+
         | Left | Right|
         | Leg  | Leg  |     <- size/4 x size*3/4 each
         |      |      |
         +------+------+
```

Total output: `size` wide, `size * 2` tall.
