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
| `input` | string | Yes | -- | Player identifier. Accepts a Java username (e.g., `Notch`), a Java UUID (with or without dashes), a Bedrock XUID prefixed with `0000` (e.g., `00002535468413142004`), a Floodgate UUID, or a dot-prefixed Bedrock gamertag (e.g., `.SomePlayer`). |
| `size` | integer | No | `128` | Output image width and height in pixels. The rendered image is always square. Missing, non-numeric or non-positive values fall back to 128; other values are clamped to 8–512. |
| `option` | string | No | -- | Pass `"hat"` to composite the hat overlay layer on top of the base face. Any other value or omission skips the overlay. |

All parameters automatically have any trailing `.png` suffix stripped before processing.

## How It Works

1. The player's skin texture URL is resolved via Mojang (Java) or GeyserMC (Bedrock), and the skin PNG is downloaded (or taken from the in-memory skin cache).
2. The 8x8 face region is extracted from the skin at pixel coordinates `(8, 8)` using Sharp's `extract` method. For HD skins wider than 64 pixels, the coordinates and region size are scaled by `width / 64`.
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
| `Cache-Control` | `public, max-age=3600` |

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
curl -o head_bedrock.png https://your-domain.com/head/00002535468413142004/128
```

The XUID (`2535468413142004`) is prefixed with `0000` and routed through the GeyserMC API. A Floodgate UUID such as `00000000-0000-0000-0009-01febe1ac3f4` resolves to the same player.

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
curl -o creeper_head.png https://your-domain.com/head/057b1c4713214863a6fe8887f9ec265f/128
```

MHF (Minecraft Head Format) UUIDs from the `/minecraft/mhf` endpoint can be used as the `input` parameter to render mob heads.

## Error Responses

### Invalid player identifier

```
HTTP/1.1 400 Bad Request
Content-Type: application/json

{
  "error": "Invalid player identifier"
}
```

The `input` doesn't match any accepted format (for example a name with spaces or longer than 16 characters).

### Player not found

```
HTTP/1.1 404 Not Found
Content-Type: application/json

{
  "error": "Player not found"
}
```

Mojang or GeyserMC reports that the player doesn't exist. Players who exist but have no custom skin are rendered with the default skin instead.

### Upstream failure

```
HTTP/1.1 502 Bad Gateway
Content-Type: application/json

{
  "error": "Failed to render head"
}
```

Only when no fallback image can be rendered: if Mojang, GeyserMC or the texture server returns an error or doesn't answer within 10 seconds (`UPSTREAM_TIMEOUT_MS`), the endpoint normally answers 200 with the last render (or, for a player it has never rendered, the default skin) and `Cache-Control: public, max-age=60`. Any other failure (for example a skin that can't be decoded) returns the same message with HTTP 500.

## Caching

Responses are cached for 1 hour using a database-backed cache. The cache key is constructed as:

```
head:{playerId}:{size}:{hat|nohat}
```

The `playerId` is normalized (`name:<lowercased username>`, `uuid:<32 lowercase hex>`, `xuid:<digits>` or `gt:<lowercased gamertag>`) and the size is the parsed value. For example, `/head/Notch/64/hat` uses `head:name:notch:64:hat`, and `/head/Notch` and `/head/notch/128` both use `head:name:notch:128:nohat`. Cached responses are served with the same headers and binary data without re-rendering.

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
/head/00002535468413142004
/head/00000000-0000-0000-0009-01febe1ac3f4/64
/head/.SomePlayer/128
```
