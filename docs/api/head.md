---
title: Head Render
order: 2
---

# Head Render

Renders the front face of a Minecraft player's head as a flat 2D PNG image. The face is extracted from the 8x8 pixel region of the skin texture at coordinates (8, 8) and scaled up to the requested size using nearest-neighbor interpolation to preserve the pixel art style.

## Endpoint

```
GET /head/:input/:size?/:option?
```

## Parameters

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `input` | string | Yes | -- | Player identifier. Accepts a Java username (e.g., `Notch`), a Java UUID (with or without dashes), a Bedrock XUID (starts with `0000`), or a dot-prefixed Bedrock gamertag (e.g., `.SomePlayer`). |
| `size` | integer | No | `128` | Output image width and height in pixels. The rendered image is always square. Any value that cannot be parsed as an integer falls back to 128. |
| `option` | string | No | -- | Pass `"hat"` to composite the hat overlay layer on top of the base face. Any other value or omission skips the overlay. |

All parameters automatically have any trailing `.png` suffix stripped before processing.

## How It Works

1. The player's skin texture URL is resolved via Mojang (Java) or GeyserMC (Bedrock).
2. The 8x8 face region is extracted from the skin at pixel coordinates `(8, 8)` using Sharp's `extract` method.
3. The extracted face is scaled to the requested `size` using nearest-neighbor resampling (`kernel: 'nearest'`).
4. If the `hat` option is specified, the 8x8 hat overlay region at coordinates `(40, 8)` is extracted, scaled to the same size, and composited on top of the face.
5. The final image is encoded as PNG and returned.

### Skin Texture Coordinates

```
Face region:    x=8,  y=8,  width=8, height=8
Hat overlay:    x=40, y=8,  width=8, height=8
```

These coordinates correspond to the standard Minecraft skin layout. The face is located in the second 8x8 block of the second row, and the hat overlay is in the sixth block of that same row.

## Response

| Header | Value |
|--------|-------|
| `Content-Type` | `image/png` |

The response body is the raw PNG binary data. The image dimensions are `size x size` pixels.

## Examples

### Basic head render (default 128x128)

```bash
curl -o head.png https://your-domain.com/head/Notch
```

```
GET /head/Notch
```

Returns a 128x128 PNG of Notch's face.

### Custom size

```bash
curl -o head_64.png https://your-domain.com/head/Notch/64
```

```
GET /head/Notch/64
```

Returns a 64x64 PNG.

### With hat overlay

```bash
curl -o head_hat.png https://your-domain.com/head/Notch/128/hat
```

```
GET /head/Notch/128/hat
```

Returns a 128x128 PNG with the hat layer composited on top.

### Using a UUID

```bash
curl -o head_uuid.png https://your-domain.com/head/069a79f444e94726a5befca90e38aaf5/256
```

```
GET /head/069a79f444e94726a5befca90e38aaf5/256
```

Resolves the UUID directly against the Mojang session server (no username lookup needed). Returns a 256x256 PNG.

### Using a UUID with dashes

```bash
curl -o head_uuid.png https://your-domain.com/head/069a79f4-44e9-4726-a5be-fca90e38aaf5
```

Both dash-separated and compact UUID formats are accepted.

### Bedrock player by XUID

```bash
curl -o head_bedrock.png https://your-domain.com/head/0000000000000001/128
```

XUIDs starting with `0000` are routed through the GeyserMC API.

### Bedrock player by gamertag

```bash
curl -o head_bedrock.png https://your-domain.com/head/.SomePlayer/128
```

The dot prefix signals a Bedrock gamertag lookup via GeyserMC.

### With .png suffix (auto-stripped)

```bash
curl -o head.png https://your-domain.com/head/Notch.png/128.png/hat.png
```

The `.png` suffix on each parameter is stripped automatically, making this equivalent to `/head/Notch/128/hat`.

### Embedding in HTML

```html
<img src="https://your-domain.com/head/Notch/64" alt="Notch" width="64" height="64" />
```

Since the API returns a PNG directly with permissive CORS headers, it works as an image source on any website.

### Using an MHF preset

```bash
curl -o creeper_head.png https://your-domain.com/head/f4254a8e93e4455b8c8a6b6b6f6d6e6f/128
```

MHF (Minecraft Head Format) UUIDs from the `/minecraft/mhf` endpoint can be used as the `input` parameter to render mob heads.

## Error Responses

### Player not found or skin fetch failure

```
HTTP/1.1 500 Internal Server Error
Content-Type: application/json

{
  "error": "Failed to render head"
}
```

This occurs when the Mojang/GeyserMC API cannot resolve the player, the player has no skin URL, or the skin image cannot be downloaded.

## Caching

Responses are cached for 1 hour using a database-backed cache. The cache key is constructed as:

```
head_{input}_{size|default}_{option|default}
```

For example, `head_Notch_128_hat` or `head_Notch_default_default`. Cached responses are served with the same `Content-Type` and binary data without re-rendering.

## URL Patterns

All of these are valid URL patterns for this endpoint:

```
/head/Notch
/head/Notch/256
/head/Notch/256/hat
/head/Notch.png
/head/Notch/256.png
/head/Notch.png/256.png/hat.png
/head/069a79f444e94726a5befca90e38aaf5
/head/069a79f4-44e9-4726-a5be-fca90e38aaf5/64/hat
/head/0000000000000001
/head/.SomePlayer/128
```
