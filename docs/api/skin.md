---
title: Raw Skin Texture
order: 5
---

# Raw Skin Texture

Returns the raw skin texture PNG for a Minecraft player exactly as it is stored on the texture server. No rendering, cropping, or scaling is performed -- the image is proxied directly from the upstream skin server. Players who exist but have no custom skin get the default (classic Steve) texture.

## Endpoint

```
GET /skin/:input
```

## Parameters

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `input` | string | Yes | -- | Player identifier. Accepts a Java username, UUID (with or without dashes), Bedrock XUID prefixed with `0000` (e.g., `00002535468413142004`), Floodgate UUID, or dot-prefixed Bedrock gamertag. |

The `input` parameter automatically has any trailing `.png` suffix stripped before processing.

## How It Works

1. The player profile is resolved via Mojang (Java) or GeyserMC (Bedrock) to obtain the skin texture URL. If the player has no custom skin, the default skin's URL is used.
2. The skin image is fetched from the texture URL as raw binary data (`getSkinImage`, using the shared HTTP client with a 10-second default timeout). Downloaded skins are kept in an in-memory cache for 24 hours, keyed by texture URL.
3. The raw bytes are returned directly to the client with no image processing applied.

### Skin Texture Format

Minecraft skin textures are standard PNG images in one of two formats:

| Format | Dimensions | Description |
|--------|-----------|-------------|
| **Modern** | 64 x 64 | Introduced in Minecraft 1.8. Contains separate textures for left and right limbs, plus overlay layers for all body parts. |
| **Legacy** | 64 x 32 | Used prior to Minecraft 1.8. Contains only the right arm and right leg; the left limbs are drawn as mirror images of them. No overlay layers for body or limbs. |

The skin texture layout follows the standard Minecraft skin mapping:

```
+--------+--------+--------+--------+--------+--------+--------+--------+
| (0,0)                                                          (64,0) |
|  Top of     Top of                  Top of   Top of                   |
|  Right Leg  Right Leg  ...         Head     Head Hat                  |
|                                                                       |
|  Right Leg  Right Leg  Right Arm  Right Arm  Head   Head   Head Hat   |
|  Front      Back       Front      Back       Front  Right  ...        |
|                                                                       |
|  (Only in 64x64 format:)                                             |
|  Left Leg  Left Leg  Left Arm  Left Arm  Torso    Torso              |
|  Front     Back      Front     Back      Overlay  Overlay            |
+--------+--------+--------+--------+--------+--------+--------+--------+
```

## Response

| Header | Value |
|--------|-------|
| `Content-Type` | `image/png` |
| `Cache-Control` | `public, max-age=3600` |

The response body is the raw PNG binary data of the skin texture. The image is either 64x64 or 64x32 pixels depending on the player's skin format.

Unlike the `/download` endpoint, this response does **not** include a `Content-Disposition` header. Browsers will display the image inline rather than triggering a file download.

## Examples

### Get skin by username

```bash
curl -o notch_skin.png https://your-domain.com/skin/Notch
```

```
GET /skin/Notch
```

Returns the raw skin texture PNG for Notch (a legacy 64x32 skin).

### Get skin by UUID

```bash
curl -o skin_uuid.png https://your-domain.com/skin/069a79f444e94726a5befca90e38aaf5
```

```
GET /skin/069a79f444e94726a5befca90e38aaf5
```

Resolves the UUID directly and returns the skin texture.

### Get skin by UUID with dashes

```bash
curl -o skin.png https://your-domain.com/skin/069a79f4-44e9-4726-a5be-fca90e38aaf5
```

Both compact and dashed UUID formats are supported.

### Bedrock player by XUID

```bash
curl -o skin_bedrock.png https://your-domain.com/skin/00002535468413142004
```

The XUID is prefixed with `0000` and resolved via the GeyserMC API. The skin URL comes from the `value` field of the GeyserMC skin record (falling back to `texture_id`).

### Bedrock player by gamertag

```bash
curl -o skin_bedrock.png https://your-domain.com/skin/.SomePlayer
```

The dot prefix triggers a Bedrock gamertag lookup.

### With .png suffix

```bash
curl -o skin.png https://your-domain.com/skin/Notch.png
```

Equivalent to `/skin/Notch`. The `.png` suffix is stripped automatically.

### Check image dimensions

```bash
curl -s https://your-domain.com/skin/Notch | identify -
```

Outputs something like this (`64x64` for modern skins, `64x32` for legacy skins):

```
-    PNG 64x64 64x64+0+0 8-bit sRGB 2.5KB
```

### Embedding in HTML

```html
<img
  src="https://your-domain.com/skin/Notch"
  alt="Notch's skin texture"
  width="256"
  height="256"
  style="image-rendering: pixelated;"
/>
```

Use `image-rendering: pixelated` in CSS to prevent the browser from blurring the 64x64 image when scaling up.

### Use as input for external tools

```bash
# Download and open in GIMP for editing
curl -s https://your-domain.com/skin/Notch -o skin.png && gimp skin.png
```

## Error Responses

| Status | Body | When |
|--------|------|------|
| 400 | `{"error": "Invalid player identifier"}` | The `input` doesn't match any accepted format |
| 404 | `{"error": "Player not found"}` | Mojang or GeyserMC reports that the player doesn't exist |
| 502 | `{"error": "Failed to get skin"}` | Mojang, GeyserMC or the texture server failed or timed out |
| 500 | `{"error": "Failed to get skin"}` | Any other failure |

```
HTTP/1.1 502 Bad Gateway
Content-Type: application/json

{
  "error": "Failed to get skin"
}
```

## Caching

Responses are cached for 1 hour. Cache key format:

```
skin:{playerId}
```

For example, `/skin/Notch` uses `skin:name:notch`. Since this endpoint has no size or option parameters, the key has no further parts. `/download` uses the same key, so the two endpoints share cache entries.

## URL Patterns

```
/skin/Notch
/skin/Notch.png
/skin/069a79f444e94726a5befca90e38aaf5
/skin/069a79f4-44e9-4726-a5be-fca90e38aaf5
/skin/00002535468413142004
/skin/00000000-0000-0000-0009-01febe1ac3f4
/skin/.SomePlayer
```

## Comparison with /download

| Feature | `/skin/:input` | `/download/:input` |
|---------|---------------|-------------------|
| Returns raw skin PNG | Yes | Yes |
| `Content-Disposition` header | No | Yes (`attachment; filename="{input}_skin.png"`, unsafe characters replaced with `_`) |
| Browser behavior | Displays inline | Triggers file download |
| Cached | Yes (1 hour) | Yes (shares `/skin`'s cache entries) |
| Use case | Embedding, programmatic access | User-initiated downloads |

If you need to trigger a browser download dialog, use the `/download` endpoint instead.
