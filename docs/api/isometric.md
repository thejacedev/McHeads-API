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
| `input` | string | Yes | -- | Player identifier. Accepts a Java username, UUID (with or without dashes), Bedrock XUID prefixed with `0000` (e.g., `00002535468413142004`), Floodgate UUID, or dot-prefixed Bedrock gamertag. |
| `direction` | string | **Yes** | -- | Viewing direction. Must be exactly `"left"` or `"right"`. **Returns 400 if invalid.** |
| `option` | string/integer | No | `64` | Size in pixels. Missing, non-numeric or non-positive values fall back to 64; other values are clamped to 8–512. |

All parameters automatically have any trailing `.png` suffix stripped before processing.

### Size Handling

Unlike most endpoints that use a dedicated `size` parameter, these endpoints take the size as their third (`option`) parameter, parsed with a fallback of 64:

```javascript
function parseIsometricParams({ direction, option }) {
    const dir = parseDirection(direction);
    const sizeInt = parseSize(option, 64);
    return { dir, sizeInt, cacheParts: [dir, sizeInt] };
}
```

This means the default output size is **64 pixels**, not 128 as with other endpoints. As everywhere else, sizes are clamped to 8–512.

## Direction Is Required

Both endpoints validate the `direction` parameter. If it is anything other than `"left"` or `"right"`, a `400 Bad Request` is returned:

```json
{
  "error": "Direction must be \"left\" or \"right\""
}
```

If the direction segment is left out entirely (`/ioshead/Notch`), the URL doesn't match the route and Express answers with its default `404 Not Found` page.

- **`right`**: The player/head faces toward the right, showing the player's right side and the top.
- **`left`**: A horizontally mirrored version of the right-facing render.

## /ioshead -- Isometric Head Render

Renders only the head of the player in an isometric 3D projection. The output shows three visible faces of the head cube: the front, one side, and the top.

### How It Works

1. **Fetch skin**: The route resolves the skin URL and downloads the skin PNG (or takes it from the in-memory skin cache); `createIsometricHeadRender(skinBuffer, size, direction)` receives the buffer.
2. **Scale skin**: The skin image is scaled up using nearest-neighbor rendering until the internal block size is large enough for quality output.
3. **Draw head faces**: `drawIsometricHead` (shared with the body render) draws 8 faces with canvas affine transforms, back to front: the hat's left and back faces (which show through the hat edges), then the head's front `transform(1, -0.5, 0, 1, ...)`, right side `transform(1, 0.5, 0, 1, ...)` and top `transform(1, -0.5, 1, 0.5, ...)`.
4. **Draw hat overlay**: The hat's right side, front and top are drawn on top, about 1.1x larger, to simulate the outer layer. The hat layer is always drawn; there is no `hat` option.
5. **Scale output**: The high-resolution intermediate canvas is scaled down to the requested size using Lanczos3 resampling via Sharp.

### Skin Coordinates Used

Positions are in units of `blockSize` (one 8-pixel block of the scaled skin); each region is sampled with a 1-pixel inset.

| Face | Source Region (x, y) | Skin pixels |
|------|---------------------|-------------|
| Hat left (behind the head) | `(blockSize*6, blockSize)` | (48, 8) |
| Hat back (behind the head) | `(blockSize*7, blockSize)` | (56, 8) |
| Head front | `(blockSize, blockSize)` | (8, 8) |
| Head right side | `(0, blockSize)` | (0, 8) |
| Head top | `(blockSize, 0)` | (8, 0) |
| Hat right side | `(blockSize*4, blockSize)` | (32, 8) |
| Hat front | `(blockSize*5, blockSize)` | (40, 8) |
| Hat top | `(halfBlock*10, 0)` | (40, 0) |

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

HTTP/1.1 400 Bad Request
{"error": "Invalid player identifier"}

HTTP/1.1 404 Not Found
{"error": "Player not found"}

HTTP/1.1 502 Bad Gateway
{"error": "Failed to render iOS head"}

HTTP/1.1 500 Internal Server Error
{"error": "Failed to render iOS head"}
```

502 means Mojang, GeyserMC or the texture server failed or timed out; 500 covers any other failure.

---

## /iosbody -- Isometric Body Render

Renders the full body of the player in an isometric 3D projection. This uses the same `createIsometricBodyRender` function as the `/avatar` endpoint but with a different default size and parameter structure.

### How It Works

The rendering pipeline is identical to the `/avatar` endpoint. See the [Avatar documentation](avatar.md) for full details on the isometric body rendering process. In summary:

1. Fetch and scale the skin texture.
2. Detect legacy (64x32) vs. modern (64x64) format. Legacy skins only store the right limbs, so the left arm and left leg are mirrored from them.
3. Draw each visible face of each body part (legs, arms, torso, head) using canvas affine transforms in back-to-front order. Slim-model modern skins get 3px-wide arms.
4. Draw overlay layers for modern skins.
5. Scale the final output to the requested size using Lanczos3 resampling.

### Body Parts Rendered

The isometric body render draws all body parts in this order (back-to-front, described for a right-facing render):

1. Legs: right leg front, left leg front (mirrored from the right leg on legacy skins), right leg side, with leg overlays if modern
2. Far (left) arm: front and top (mirrored from the right arm on legacy skins), with overlay if modern
3. Torso (front face + side face, with overlay if modern)
4. Near (right) arm: outer side, front and top, with overlay if modern
5. Head (all visible faces + hat overlay)

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

HTTP/1.1 400 Bad Request
{"error": "Invalid player identifier"}

HTTP/1.1 404 Not Found
{"error": "Player not found"}

HTTP/1.1 502 Bad Gateway
{"error": "Failed to render iOS body"}

HTTP/1.1 500 Internal Server Error
{"error": "Failed to render iOS body"}
```

---

## Caching

Both endpoints cache responses for 1 hour. Cache key formats:

```
ioshead:{playerId}:{direction}:{size}
iosbody:{playerId}:{direction}:{size}
```

The `playerId` is normalized and the size is the parsed value, so `/ioshead/Notch/right` and `/ioshead/notch/right/64` share the key `ioshead:name:notch:right:64`. Responses carry `Cache-Control: public, max-age=3600`.

## URL Patterns

### /ioshead

```
/ioshead/Notch/right
/ioshead/Notch/left
/ioshead/Notch/right/128
/ioshead/Notch.png/right/64.png
/ioshead/069a79f444e94726a5befca90e38aaf5/left
/ioshead/.SomePlayer/right/256
/ioshead/00002535468413142004/left
```

### /iosbody

```
/iosbody/Notch/right
/iosbody/Notch/left
/iosbody/Notch/right/128
/iosbody/Notch.png/left/64.png
/iosbody/069a79f444e94726a5befca90e38aaf5/right
/iosbody/.SomePlayer/left/256
/iosbody/00000000-0000-0000-0009-01febe1ac3f4/right/128
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
