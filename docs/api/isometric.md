---
title: Isometric Renders (ioshead / iosbody)
order: 6
---

# Isometric Renders

Two endpoints provide isometric 3D renders of individual body parts: `/ioshead` renders just the head, and `/iosbody` renders the full body. Both use canvas 2D affine transforms to simulate a three-dimensional isometric projection, and both require a direction parameter.

## Endpoints

```
GET /ioshead/:input/:direction/:option?
GET /iosbody/:input/:direction/:option?
```

## Parameters

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `input` | string | Yes | -- | Player identifier. Accepts a Java username, UUID (with or without dashes), Bedrock XUID (starts with `0000`), or dot-prefixed Bedrock gamertag. |
| `direction` | string | **Yes** | -- | Viewing direction. Must be exactly `"left"` or `"right"`. **Returns 400 if missing or invalid.** |
| `option` | string/integer | No | `64` | Size override in pixels. Parsed as an integer; falls back to 64 if not a valid number or if omitted. |

All parameters automatically have any trailing `.png` suffix stripped before processing.

### Size Handling

Unlike most endpoints that use a dedicated `size` parameter, these endpoints use the `option` parameter as a size override:

```javascript
const size = option ? parseInt(option, 10) || 64 : 64;
```

This means the default output size is **64 pixels**, not 128 as with other endpoints.

## Direction Is Required

Both endpoints validate the `direction` parameter. If it is missing, omitted, or anything other than `"left"` or `"right"`, a `400 Bad Request` is returned:

```json
{
  "error": "Direction must be \"left\" or \"right\""
}
```

- **`right`**: The player/head faces toward the right, showing the left side and top.
- **`left`**: A horizontally mirrored version of the right-facing render.

## /ioshead -- Isometric Head Render

Renders only the head of the player in an isometric 3D projection. The output shows three visible faces of the head cube: the front, one side, and the top.

### How It Works

1. **Fetch skin**: Download the skin texture from Mojang or GeyserMC.
2. **Scale skin**: The skin image is scaled up using nearest-neighbor rendering until the internal block size is large enough for quality output.
3. **Draw head faces**: Six faces are drawn using canvas affine transforms:
   - Back-left face: `transform(-1, -0.5, 0, 1, ...)`
   - Back-right face: `transform(1, -0.5, 0, 1, ...)`
   - Right side face: `transform(1, -0.5, 0, 1, ...)`
   - Front face: `transform(1, 0.5, 0, 1, ...)`
   - Top face: `transform(1, -0.5, 1, 0.5, ...)`
4. **Draw hat overlay**: The hat overlay layer faces are drawn on top with slightly larger dimensions to simulate the outer layer.
5. **Scale output**: The high-resolution intermediate canvas is scaled down to the requested size using Lanczos3 resampling via Sharp.

### Skin Coordinates Used

| Face | Source Region (x, y, w, h) | Description |
|------|---------------------------|-------------|
| Front | `(blockSize, blockSize, blockSize, blockSize)` | Front of the head |
| Left | `(0, blockSize, blockSize, blockSize)` | Left side of the head |
| Right | `(blockSize*2, blockSize, blockSize, blockSize)` | Right side of the head |
| Top | `(blockSize, 0, blockSize, blockSize)` | Top of the head |
| Back-left | `(blockSize*6, blockSize, blockSize, blockSize)` | Back-left detail |
| Back-right | `(blockSize*7, blockSize, blockSize, blockSize)` | Back-right detail |
| Hat overlay front | `(blockSize*4, blockSize, blockSize, blockSize)` | Hat front overlay |
| Hat overlay side | `(blockSize*5, blockSize, blockSize, blockSize)` | Hat side overlay |
| Hat overlay top | `(halfBlock*10, 0, blockSize, blockSize)` | Hat top overlay |

### Output Dimensions

The output is a square image: `size x size` pixels. Default is **64 x 64**.

### Examples

```bash
# Default 64x64 isometric head facing right
curl -o ioshead.png https://your-domain.com/ioshead/Notch/right

# 128px isometric head facing left
curl -o ioshead_left.png https://your-domain.com/ioshead/Notch/left/128

# Using a UUID
curl -o ioshead_uuid.png https://your-domain.com/ioshead/069a79f444e94726a5befca90e38aaf5/right/256

# Bedrock player
curl -o ioshead_bedrock.png https://your-domain.com/ioshead/.SomePlayer/right

# With .png suffix
curl -o ioshead.png https://your-domain.com/ioshead/Notch.png/right/128.png
```

```html
<img src="https://your-domain.com/ioshead/Notch/right/64" alt="Notch 3D head" />
```

### Error Responses

```
HTTP/1.1 400 Bad Request
{"error": "Direction must be \"left\" or \"right\""}

HTTP/1.1 500 Internal Server Error
{"error": "Failed to render iOS head"}
```

---

## /iosbody -- Isometric Body Render

Renders the full body of the player in an isometric 3D projection. This uses the same `createIsometricBodyRender` function as the `/avatar` endpoint but with a different default size and parameter structure.

### How It Works

The rendering pipeline is identical to the `/avatar` endpoint. See the [Avatar documentation](avatar.md) for full details on the isometric body rendering process. In summary:

1. Fetch and scale the skin texture.
2. Detect legacy (64x32) vs. modern (64x64) format.
3. Draw each visible face of each body part (legs, arms, torso, head) using canvas affine transforms in back-to-front order.
4. Draw overlay layers for modern skins.
5. Scale the final output to the requested size using Lanczos3 resampling.

### Body Parts Rendered

The isometric body render draws all body parts in this order (back-to-front):

1. Back leg (far side)
2. Back arm (far side, with overlay if modern)
3. Front leg (near side, with overlay if modern)
4. Torso (front face + side face, with overlay if modern)
5. Front arm (near side, with overlay if modern)
6. Head (all visible faces + hat overlay)

### Output Dimensions

The output width is `size` pixels. The height preserves the aspect ratio of the isometric projection at approximately `size * 2.04`. Default size is **64**, producing roughly **64 x 131 pixels**.

### Examples

```bash
# Default 64px isometric body facing right
curl -o iosbody.png https://your-domain.com/iosbody/Notch/right

# 128px isometric body facing left
curl -o iosbody_left.png https://your-domain.com/iosbody/Notch/left/128

# Large render
curl -o iosbody_large.png https://your-domain.com/iosbody/Notch/right/512

# Using a UUID
curl -o iosbody_uuid.png https://your-domain.com/iosbody/069a79f444e94726a5befca90e38aaf5/left/256

# Bedrock player
curl -o iosbody_bedrock.png https://your-domain.com/iosbody/.SomePlayer/right

# With .png suffix
curl -o iosbody.png https://your-domain.com/iosbody/Notch.png/right/128.png
```

```html
<img src="https://your-domain.com/iosbody/Notch/right/64" alt="Notch 3D body" />
```

### Error Responses

```
HTTP/1.1 400 Bad Request
{"error": "Direction must be \"left\" or \"right\""}

HTTP/1.1 500 Internal Server Error
{"error": "Failed to render iOS body"}
```

---

## Caching

Both endpoints cache responses for 1 hour. Cache key formats:

```
ioshead_{input}_{direction}_{option|default}
iosbody_{input}_{direction}_{option|default}
```

## URL Patterns

### /ioshead

```
/ioshead/Notch/right
/ioshead/Notch/left
/ioshead/Notch/right/128
/ioshead/Notch.png/right/64.png
/ioshead/069a79f444e94726a5befca90e38aaf5/left
/ioshead/.SomePlayer/right/256
```

### /iosbody

```
/iosbody/Notch/right
/iosbody/Notch/left
/iosbody/Notch/right/128
/iosbody/Notch.png/left/64.png
/iosbody/069a79f444e94726a5befca90e38aaf5/right
/iosbody/.SomePlayer/left/256
```

## Comparison Table

| Feature | `/ioshead` | `/iosbody` | `/avatar` |
|---------|-----------|-----------|----------|
| Renders | Head only | Full body | Full body |
| Default size | 64 | 64 | 128 |
| Size parameter | `option` (3rd param) | `option` (3rd param) | `size` (3rd param) |
| Direction required | Yes | Yes | Yes |
| Render function | `createIsometricHeadRender` | `createIsometricBodyRender` | `createIsometricBodyRender` |
| Output shape | Square (size x size) | Tall (~size x size*2.04) | Tall (~size x size*2.04) |
