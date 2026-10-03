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

## How Image Endpoints Report Errors

All image endpoints (`/head`, `/player`, `/avatar`, `/ioshead`, `/iosbody`,
`/skin`, `/download`) share one handler in `utils/imageRoute.js`. Client errors
(status below 500) are returned with their own message. Anything else is logged
on the server and answered with the endpoint's generic message:

```js
function sendError(res, error, errorMessage) {
    if (error instanceof HttpError && error.status < 500) {
        return res.status(error.status).json({ error: error.message });
    }

    console.error(`${errorMessage}:`, error.cause || error);
    res.status(error instanceof HttpError ? error.status : 500).json({ error: errorMessage });
}
```

The generic message for each endpoint, used for both 502 and 500 responses:

| Endpoint | Generic message |
| -------- | --------------- |
| `/head` | `Failed to render head` |
| `/player` | `Failed to render player` |
| `/avatar` | `Failed to render avatar` |
| `/ioshead` | `Failed to render iOS head` |
| `/iosbody` | `Failed to render iOS body` |
| `/skin` | `Failed to get skin` |
| `/download` | `Failed to download skin` |

---

## HTTP 400 -- Bad Request

### Invalid Player Identifier

**Endpoints:** all image endpoints

Returned when `:input` doesn't match any accepted format. The check happens
before any upstream request is made:

```
GET /head/ThisNameIsWayTooLong/64
```

```http
HTTP/1.1 400 Bad Request
Content-Type: application/json

{
    "error": "Invalid player identifier"
}
```

Accepted formats are a Java username matching `^[A-Za-z0-9_]{1,16}$`, a UUID
(dashed or 32 hex digits, including Floodgate UUIDs), `0000` followed by digits
with a total length of at least 17 (a Bedrock XUID), or a dot followed by a
gamertag of 1-16 letters, digits, spaces, `_`, `#` or `-` that starts with a
letter or digit. See [Edition Detection](../getting-started/edition-detection.md).

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

The player identifier is validated first, so a request with both an invalid
identifier and an invalid direction gets the identifier error. If the direction
segment is left out entirely (`/avatar/Notch`), the URL matches no route and
Express answers with its default HTML `404 Not Found` page instead.

---

## HTTP 404 -- Not Found

### Player Not Found

**Endpoints:** all image endpoints

```json
{ "error": "Player not found" }
```

Returned when the upstream service reports that the player doesn't exist:

- The Mojang username lookup answers 404 or 204.
- The Mojang session server answers 404 or 204 for the UUID.
- GeyserMC answers 503 "Unable to find user" for a gamertag it has never seen.

Players who exist but have no custom skin are **not** a 404; they are rendered
with the default skin (see [Default Skin](#default-skin) below).

Requests to URLs that match no route at all get Express's default HTML 404
page rather than this JSON body.

---

## HTTP 429 -- Too Many Requests

**Endpoints:** all endpoints, only when `RATE_LIMIT_PER_MINUTE` is set

```http
HTTP/1.1 429 Too Many Requests
Retry-After: 37
Content-Type: application/json

{
    "error": "Too many requests"
}
```

Returned when a client IP exceeds the per-minute limit. `Retry-After` gives the
number of seconds until the current one-minute window resets. Rate limiting is
disabled by default; see [Environment Variables](environment.md#rate_limit_per_minute).

---

## HTTP 502 -- Bad Gateway

**Endpoints:** all image endpoints

Returned with the endpoint's generic message when an upstream service fails:

```json
{ "error": "Failed to render head" }
```

Causes:
- The Mojang API, Mojang session server, GeyserMC API or texture server is
  unreachable or answers with an unexpected status (for example a 500, or a
  429 when Mojang is rate limiting the server).
- An upstream request takes longer than 5 seconds (the shared HTTP client's
  timeout). A Java username lookup makes up to three requests (name to UUID,
  profile, texture), each with its own timeout.
- An upstream response is larger than 1 MB.
- GeyserMC answers 503 for any reason other than "Unable to find user".

Failed lookups are not cached, so the next request retries the upstream
service.

---

## HTTP 500 -- Internal Server Error

**Endpoints:** image and stats endpoints

Image endpoints return their generic message with HTTP 500 for any failure that
isn't one of the cases above, for example:

- The skin PNG cannot be decoded, or (for `/head` and `/player`) has
  unsupported dimensions, i.e. is neither square nor 2:1.
- Sharp or Canvas encounters an internal error while rendering.

Cache read and write errors are **not** among these: they are logged
(`Cache read error:` / `Cache write error:`) and the request continues, rendering
the image if the cache couldn't be read.

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

The health endpoint returns 503 whenever its `status` is `red`. This happens
when:
- The live Mojang API check fails or times out (message
  `External API issues detected`, with the full health report in the body).
- The health check logic itself throws, for example because the database is
  unreachable (the shorter body shown above).

A `yellow` status (degraded performance) still returns HTTP 200. The history of
earlier checks is reported in `recent_status` and does not affect the HTTP
code.

---

## Default Skin

Not every missing piece of data produces an error response.

### Player with No Custom Skin

When a player exists but has no custom skin, the API uses its built-in default
skin (classic Steve, `DEFAULT_SKIN` in `utils/minecraft.js`) instead of
returning an error:

- **Java** -- the session server profile has no `SKIN` texture.
- **Bedrock** -- GeyserMC returns an empty object (`{}`) for the XUID.

```js
// Players on a default skin have no SKIN entry in their textures.
const textures = profile.properties?.find(property => property.name === 'textures');
return textures ? parseTextures(textures.value) : DEFAULT_SKIN;
```

The client receives a valid PNG rendered from the default skin. There is no
indication in the response that the default skin was used. The API never
substitutes another player's skin, and unknown players get a 404.

---

## Stats Recording Errors

The `recordStats` function catches and logs errors without propagating them:

```js
async function recordStats(edition) {
    try {
        await query(`UPDATE ${T.stats} SET count = count + 1 WHERE edition = ?`, [edition]);
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
| 400 | Invalid player identifier | All image endpoints |
| 400 | Direction must be "left" or "right" | `/avatar`, `/ioshead`, `/iosbody` |
| 404 | Player not found | All image endpoints |
| 429 | Too many requests | All endpoints (only when rate limiting is enabled) |
| 502 / 500 | Failed to render head | `/head` |
| 502 / 500 | Failed to render player | `/player` |
| 502 / 500 | Failed to render avatar | `/avatar` |
| 502 / 500 | Failed to render iOS head | `/ioshead` |
| 502 / 500 | Failed to render iOS body | `/iosbody` |
| 502 / 500 | Failed to get skin | `/skin` |
| 502 / 500 | Failed to download skin | `/download` |
| 500 | Failed to get stats | `/allstats` |
| 500 | Failed to get bedrock stats | `/allstatsbedrock` |
| 500 | Failed to get sorted stats | `/allstatsSorted` |
| 503 | Health check failed / External API issues detected | `/health` |
