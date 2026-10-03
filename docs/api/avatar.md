---
title: Avatar (Isometric Body)
order: 4
---

# Avatar -- Isometric 3D Body Render

Renders a full-body isometric 3D projection of a Minecraft player. The render uses canvas 2D transforms to simulate a three-dimensional view of the player model, showing the front face, one side, and the top of the head. The direction parameter controls which side of the player is visible.

## Endpoint

```
GET /avatar/:input/:direction/:size?
```

## Parameters

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `input` | string | Yes | -- | Player identifier. Accepts a Java username, UUID (with or without dashes), Bedrock XUID prefixed with `0000` (e.g., `00002535468413142004`), Floodgate UUID, or dot-prefixed Bedrock gamertag. |
| `direction` | string | **Yes** | -- | Viewing direction. Must be exactly `"left"` or `"right"`. Determines which side of the player body is visible in the isometric projection. **Returns 400 if invalid.** |
| `size` | integer | No | `128` | Base output width in pixels. The height is determined by the aspect ratio of the isometric projection (approximately `size * 2.04`). Missing, non-numeric or non-positive values fall back to 128; other values are clamped to 8–512. |

All parameters automatically have any trailing `.png` suffix stripped before processing.

## Direction Is Required

Unlike most endpoints, the `direction` parameter is **mandatory**. If the second path segment is anything other than `"left"` or `"right"` (for example `/avatar/Notch/128`, where `128` is taken as the direction), the API returns a `400 Bad Request`:

```json
{
  "error": "Direction must be \"left\" or \"right\""
}
```

If the direction segment is left out entirely (`/avatar/Notch`), the URL doesn't match this route and Express answers with its default `404 Not Found` page.

The direction controls the viewing angle of the isometric projection:

- **`right`**: The player faces toward the right. The player's right side (head, near arm and near leg) and the top of the head are visible. This is the default rendering direction (the transforms are written for this orientation).
- **`left`**: The player faces toward the left. This is achieved by flipping the canvas horizontally (`ctx.scale(-1, 1)`) after the right-facing render, producing a mirror image.

## How It Works

The isometric body render is the most computationally intensive endpoint. It uses the HTML5 Canvas API (via node-canvas) with 2D affine transforms to project each face of each body part onto an isometric plane.

### Rendering Pipeline

1. **Fetch skin**: The route resolves the player's skin URL and model (classic or slim), and `getSkinImage` downloads the skin PNG (or takes it from the in-memory skin cache). The renderer, `createIsometricBodyRender(skinBuffer, size, direction, slim)`, receives the PNG buffer.
2. **Load and scale**: Parse the skin into a canvas-compatible `Image` object. Scale it up using nearest-neighbor rendering until the block size is large enough for the target output.
3. **Detect format**: Check if the skin is modern (64x64) or legacy (64x32) to determine limb handling. Legacy skins only store the right limbs, so the left arm and left leg are drawn by mirroring them. For slim-model modern skins, the arms are drawn 3 pixels wide instead of 4.
4. **Composite body parts**: Using `ctx.transform()` with custom affine matrices, draw each visible face of each body part (legs, arms, torso, head) in back-to-front order.
5. **Apply overlays**: For modern skins, overlay layers for each body part are drawn on top with slightly larger transforms to simulate the outer layer sitting above the skin.
6. **Scale output**: The intermediate canvas is rendered at a high resolution, then scaled down to the requested `size` using Lanczos3 resampling via Sharp for high-quality anti-aliased output.

### Canvas Transforms

Each visible face of a body part is drawn using a 2D affine transform that simulates 3D projection. The transforms use `ctx.transform(a, b, c, d, e, f)` where:

- The front face uses a vertical shear: `transform(1, -0.5, 0, 1, x, y)` -- tilts the face to create depth
- The side face uses the opposite shear: `transform(1, 0.5, 0, 1, x, y)`
- The top face uses a combined transform: `transform(1, -0.5, 1, 0.5, x, y)` -- creates the diamond-shaped top plane

For the `left` direction, the entire canvas is horizontally flipped before drawing:

```javascript
if (direction === 'left') {
    ctx.translate(rectWidth, 0);
    ctx.scale(-1, 1);
}
```

### Internal Canvas Dimensions

The intermediate canvas size is calculated from the `side` parameter (an internal scaling variable):

```
Canvas width:  side * 2.5
Canvas height: side * 5.1
```

The final output preserves the aspect ratio. For a `size` of 128, the output is approximately **128 x 261 pixels**.

## Response

| Header | Value |
|--------|-------|
| `Content-Type` | `image/png` |
| `Cache-Control` | `public, max-age=3600` |

The response body is the raw PNG binary data. The output dimensions are `size` wide by approximately `size * 2.04` tall (the exact height depends on the internal scaling calculations).

## Examples

### Right-facing isometric render

```bash
curl -o avatar_right.png https://your-domain.com/avatar/Notch/right
```

```
GET /avatar/Notch/right
```

Returns a 128-pixel-wide isometric body render of Notch facing right.

### Left-facing isometric render

```bash
curl -o avatar_left.png https://your-domain.com/avatar/Notch/left
```

```
GET /avatar/Notch/left
```

Returns a mirrored isometric render facing left.

### Custom size

```bash
curl -o avatar_256.png https://your-domain.com/avatar/Notch/right/256
```

```
GET /avatar/Notch/right/256
```

Returns a 256-pixel-wide isometric render.

### Using a UUID

```bash
curl -o avatar_uuid.png https://your-domain.com/avatar/069a79f444e94726a5befca90e38aaf5/left/128
```

### Bedrock player

```bash
curl -o avatar_bedrock.png https://your-domain.com/avatar/.SomePlayer/right/128
```

### With .png suffix

```bash
curl -o avatar.png https://your-domain.com/avatar/Notch.png/right/128.png
```

Equivalent to `/avatar/Notch/right/128`.

### Embedding in HTML

```html
<img
  src="https://your-domain.com/avatar/Notch/right/64"
  alt="Notch isometric"
/>
```

Note that the height is not exactly `2 * width` for this endpoint, so avoid setting an explicit `height` attribute unless you know the exact aspect ratio.

## Error Responses

### Missing or invalid direction

```
HTTP/1.1 400 Bad Request
Content-Type: application/json

{
  "error": "Direction must be \"left\" or \"right\""
}
```

This is returned when the `direction` segment is not one of the two accepted values.

### Invalid player identifier

```
HTTP/1.1 400 Bad Request
Content-Type: application/json

{
  "error": "Invalid player identifier"
}
```

### Player not found

```
HTTP/1.1 404 Not Found
Content-Type: application/json

{
  "error": "Player not found"
}
```

Players who exist but have no custom skin are rendered with the default skin instead.

### Upstream or render failure

```
HTTP/1.1 502 Bad Gateway
Content-Type: application/json

{
  "error": "Failed to render avatar"
}
```

HTTP 502 is returned when Mojang, GeyserMC or the texture server fails or doesn't answer within 5 seconds. Any other failure, such as the canvas rendering failing, returns the same message with HTTP 500.

## Caching

Responses are cached for 1 hour. Cache key format:

```
avatar:{playerId}:{direction}:{size}
```

For example, `/avatar/Notch/right/128` uses `avatar:name:notch:right:128`. The `playerId` is normalized and the size is the parsed value. Note that the direction is part of the cache key, so left and right renders of the same player at the same size are cached separately.

## URL Patterns

```
/avatar/Notch/right
/avatar/Notch/left
/avatar/Notch/right/256
/avatar/Notch.png/right/128.png
/avatar/069a79f444e94726a5befca90e38aaf5/left
/avatar/069a79f4-44e9-4726-a5be-fca90e38aaf5/right/64
/avatar/00002535468413142004/left/128
/avatar/00000000-0000-0000-0009-01febe1ac3f4/right
/avatar/.SomePlayer/right
```

## Comparison with Other Isometric Endpoints

| Endpoint | Body Parts Rendered | Default Size | Direction Required |
|----------|-------------------|-------------|-------------------|
| `/avatar` | Full body (head + torso + arms + legs) | 128 | Yes |
| `/ioshead` | Head only | 64 | Yes |
| `/iosbody` | Full body (head + torso + arms + legs) | 64 | Yes |

The `/avatar` endpoint and `/iosbody` endpoint both render isometric full-body views using the same `createIsometricBodyRender` function. The difference is that `/avatar` defaults to size 128 and accepts size as a route parameter, while `/iosbody` defaults to size 64 and accepts size as the `option` parameter.
