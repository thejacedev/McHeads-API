---
title: Skin Download
order: 7
---

# Skin Download

Returns the raw skin texture PNG for a Minecraft player with a `Content-Disposition: attachment` header, causing browsers to trigger a file download dialog instead of displaying the image inline. The downloaded file is named `{input}_skin.png`.

## Endpoint

```
GET /download/:input
```

## Parameters

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `input` | string | Yes | -- | Player identifier. Accepts a Java username, UUID (with or without dashes), Bedrock XUID (starts with `0000`), or dot-prefixed Bedrock gamertag. |

The `input` parameter automatically has any trailing `.png` suffix stripped before processing.

## How It Works

1. The player profile is resolved via Mojang (Java) or GeyserMC (Bedrock) to obtain the skin texture URL.
2. The skin image is fetched from the texture URL as raw binary data.
3. The response is sent with both `Content-Type: image/png` and a `Content-Disposition: attachment` header that specifies the download filename.

### Response Headers

| Header | Value | Purpose |
|--------|-------|---------|
| `Content-Type` | `image/png` | Identifies the file as a PNG image |
| `Content-Disposition` | `attachment; filename="{input}_skin.png"` | Triggers browser download with the specified filename |

The filename uses the original `input` value (after `.png` stripping). For example:

| Input | Filename |
|-------|----------|
| `Notch` | `Notch_skin.png` |
| `069a79f444e94726a5befca90e38aaf5` | `069a79f444e94726a5befca90e38aaf5_skin.png` |
| `.SomePlayer` | `.SomePlayer_skin.png` |
| `Notch.png` | `Notch_skin.png` (`.png` stripped first) |

## Response

The response body is the raw PNG binary data of the skin texture, identical to what `/skin/:input` returns. The image is either 64x64 or 64x32 pixels depending on the player's skin format.

## Examples

### Download by username

```bash
curl -OJ https://your-domain.com/download/Notch
```

The `-OJ` flags tell curl to use the filename from the `Content-Disposition` header, saving the file as `Notch_skin.png`.

```bash
curl -o notch.png https://your-domain.com/download/Notch
```

Or specify a custom output filename with `-o`.

### Download by UUID

```bash
curl -OJ https://your-domain.com/download/069a79f444e94726a5befca90e38aaf5
```

Saves as `069a79f444e94726a5befca90e38aaf5_skin.png`.

### Download by UUID with dashes

```bash
curl -OJ https://your-domain.com/download/069a79f4-44e9-4726-a5be-fca90e38aaf5
```

### Bedrock player by XUID

```bash
curl -OJ https://your-domain.com/download/0000000000000001
```

### Bedrock player by gamertag

```bash
curl -OJ https://your-domain.com/download/.SomePlayer
```

### With .png suffix

```bash
curl -OJ https://your-domain.com/download/Notch.png
```

Equivalent to `/download/Notch`. The `.png` suffix is stripped from the input before constructing the filename, so the downloaded file is still `Notch_skin.png`.

### Verify download headers

```bash
curl -I https://your-domain.com/download/Notch
```

Returns:

```
HTTP/1.1 200 OK
Content-Type: image/png
Content-Disposition: attachment; filename="Notch_skin.png"
```

### Browser download link

```html
<a href="https://your-domain.com/download/Notch">Download Notch's Skin</a>
```

Clicking this link in a browser will trigger a file download dialog with the filename `Notch_skin.png`.

### Download and edit workflow

```bash
# Download the skin
curl -OJ https://your-domain.com/download/Notch

# Edit in your favorite image editor
gimp Notch_skin.png

# Upload the modified skin to your Minecraft account
# (via minecraft.net or your launcher)
```

### JavaScript fetch example

```javascript
async function downloadSkin(username) {
    const response = await fetch(`https://your-domain.com/download/${username}`);
    const blob = await response.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${username}_skin.png`;
    a.click();
    URL.revokeObjectURL(url);
}
```

## Error Responses

### Player not found or skin fetch failure

```
HTTP/1.1 500 Internal Server Error
Content-Type: application/json

{
  "error": "Failed to download skin"
}
```

This is returned when the player cannot be resolved, the skin URL is missing, or the upstream skin server is unreachable.

## Caching

Unlike most other endpoints, the `/download` endpoint does **not** cache responses in the database. Each request fetches the skin fresh from the upstream provider. This ensures that downloaded skins are always up-to-date, which is important for users who are downloading skins to edit and re-upload.

Usage statistics are still recorded for each request.

## URL Patterns

```
/download/Notch
/download/Notch.png
/download/069a79f444e94726a5befca90e38aaf5
/download/069a79f4-44e9-4726-a5be-fca90e38aaf5
/download/0000000000000001
/download/.SomePlayer
```

## Comparison with /skin

| Feature | `/skin/:input` | `/download/:input` |
|---------|---------------|-------------------|
| Returns raw skin PNG | Yes | Yes |
| `Content-Disposition` header | No | Yes (`attachment; filename="{input}_skin.png"`) |
| Browser behavior | Displays image inline | Triggers file download |
| Database cache | Yes (1 hour) | No |
| Stats tracking | Yes | Yes |
| Use case | Embedding, API consumption | User-initiated file download |

Use `/skin` when you want to display or process the skin programmatically. Use `/download` when you want to provide a download link for end users.
