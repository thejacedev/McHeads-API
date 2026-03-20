---
order: 4
title: Error Codes
---

# Error Codes

All API errors are returned as JSON objects with an `error` field. Image
endpoints return `Content-Type: application/json` on error instead of the usual
`image/png`.

---

## Error Response Format

Every error follows the same structure:

```json
{
    "error": "Human-readable error message"
}
```

There is no error code field, stack trace, or additional metadata. The HTTP
status code and the error message together identify the problem.

---

## HTTP 400 -- Bad Request

### Invalid Direction

**Endpoints:** `/avatar`, `/ioshead`, `/iosbody`

Returned when the `direction` parameter is not `left` or `right`:

```
GET /avatar/Notch/up/128
```

```http
HTTP/1.1 400 Bad Request
Content-Type: application/json

{
    "error": "Direction must be \"left\" or \"right\""
}
```

This is the only 400 error the API currently returns. All other invalid inputs
(nonexistent usernames, malformed UUIDs) result in 500 errors because they
manifest as failures during the Mojang/GeyserMC lookup rather than as
client-side validation errors.

---

## HTTP 500 -- Internal Server Error

All 500 errors indicate that the server attempted to process the request but
encountered a failure during profile resolution, rendering, or database
operations.

### Failed to Render Head

**Endpoint:** `/head`

```json
{ "error": "Failed to render head" }
```

Causes:
- The username or UUID does not exist in the Mojang database.
- The Mojang API is unreachable or rate-limiting the server.
- The skin texture URL returned by Mojang is broken or unreachable.
- The skin PNG is corrupted and cannot be parsed by Sharp.
- Sharp encountered an internal error during extraction or resize.

### Failed to Render Player

**Endpoint:** `/player`

```json
{ "error": "Failed to render player" }
```

Causes are the same as head render failures, plus:
- Jimp failed to parse the skin buffer.
- A body part crop operation failed (unlikely unless the skin is malformed).

### Failed to Render Avatar

**Endpoint:** `/avatar`

```json
{ "error": "Failed to render avatar" }
```

Causes are the same as head render failures, plus:
- Canvas failed to load the skin image from the base64 data URL.
- An affine transform produced invalid geometry.
- Sharp's Lanczos3 resize of the canvas output failed.

### Failed to Render iOS Head

**Endpoint:** `/ioshead`

```json
{ "error": "Failed to render iOS head" }
```

Same causes as the avatar render error. This endpoint uses the
`createIsometricHeadRender` function.

### Failed to Render iOS Body

**Endpoint:** `/iosbody`

```json
{ "error": "Failed to render iOS body" }
```

Same causes as the avatar render error. This endpoint uses the
`createIsometricBodyRender` function.

### Failed to Get Skin

**Endpoint:** `/skin`

```json
{ "error": "Failed to get skin" }
```

Causes:
- Username/UUID does not exist.
- Mojang API unreachable.
- Skin texture URL unreachable.

### Failed to Download Skin

**Endpoint:** `/download`

```json
{ "error": "Failed to download skin" }
```

Same causes as the skin endpoint. The download endpoint uses the same
`getRawSkin` function but returns the file with a `Content-Disposition` header.

### Failed to Get Stats

**Endpoints:** `/allstats`, `/allstatsbedrock`, `/allstatsSorted`

```json
{ "error": "Failed to get stats" }
{ "error": "Failed to get bedrock stats" }
{ "error": "Failed to get sorted stats" }
```

Causes:
- Database connection lost.
- Stats table does not exist (should not happen if initialization succeeded).
- PostgreSQL connection pool exhausted.

---

## HTTP 503 -- Service Unavailable

### Health Check Failed

**Endpoint:** `/health`

```json
{
    "status": "red",
    "message": "Health check failed",
    "timestamp": "2026-01-15T12:00:00.000Z",
    "error": "Error details here",
    "response_time": "1500ms"
}
```

The health endpoint returns 503 when the overall system status is `red`. This
can happen if:
- The database is unreachable.
- The Mojang API has been consistently failing.
- The health check logic itself encounters an exception.

A `yellow` status (degraded performance) still returns HTTP 200.

---

## Graceful Fallbacks

Not all failure scenarios produce an error response. Some are handled silently:

### Bedrock Player with No Skin

When a Bedrock player has no custom skin (the GeyserMC API returns an empty
object), the API falls back to the **Steve** skin instead of returning an error:

```js
if (Object.keys(skinResponse.data).length === 0) {
    return getJavaProfile('Steve');
}
```

The client receives a valid PNG of Steve's head/body/avatar. There is no
indication in the response that a fallback occurred.

### Bedrock API Unreachable

If the GeyserMC API request fails entirely (network error, timeout, etc.), the
same Steve fallback applies:

```js
catch (error) {
    return getJavaProfile('Steve');
}
```

### Hat Layer Missing

In the `createAvatarRender` function, the hat layer extraction is wrapped in a
try/catch that silently ignores failures:

```js
try {
    const hat = skin.clone().crop(40, 8, 8, 8)
        .resize(size, size, Jimp.RESIZE_NEAREST_NEIGHBOR);
    avatar.composite(hat, 0, 0);
} catch (hatError) {
    // Silently ignored -- render without hat
}
```

This handles rare cases where a skin texture is valid but the hat region is
malformed or the skin is too small to contain it.

---

## Stats Recording Errors

The `recordStats` function catches and logs errors without propagating them:

```js
async function recordStats(endpoint, input, edition) {
    try {
        // ... update count ...
    } catch (err) {
        console.error('Stats update error:', err);
    }
}
```

A stats database failure will appear in server logs but will never cause a
rendering request to fail. The client is completely unaware of stats errors.

---

## Summary Table

| Status | Error message | Endpoints |
| ------ | ------------- | --------- |
| 400 | Direction must be "left" or "right" | `/avatar`, `/ioshead`, `/iosbody` |
| 500 | Failed to render head | `/head` |
| 500 | Failed to render player | `/player` |
| 500 | Failed to render avatar | `/avatar` |
| 500 | Failed to render iOS head | `/ioshead` |
| 500 | Failed to render iOS body | `/iosbody` |
| 500 | Failed to get skin | `/skin` |
| 500 | Failed to download skin | `/download` |
| 500 | Failed to get stats | `/allstats` |
| 500 | Failed to get bedrock stats | `/allstatsbedrock` |
| 500 | Failed to get sorted stats | `/allstatsSorted` |
| 503 | Health check failed | `/health` |
