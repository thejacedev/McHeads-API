---
order: 5
title: Caching
---

# Caching

Every rendered image is cached for **1 hour** (3600 seconds) to avoid redundant
skin fetches and re-renders. The caching layer supports two backends -- SQLite
for local/development use and PostgreSQL for production deployments -- and is
transparent to the rest of the application. On top of the database cache, the
API keeps two in-memory caches for player lookups and skin textures, and sends
HTTP cache headers so browsers and proxies can cache images too.

---

## Cache Backends

### SQLite (Default)

When no `DATABASE_URL` environment variable is set, the API uses
**better-sqlite3** to store cache entries in a local file, by default:

```
./new_minecraft_heads.db
```

Set `SQLITE_PATH` to use a different file. SQLite is configured with **WAL
(Write-Ahead Logging)** mode for better concurrent read performance:

```js
db = new Database(process.env.SQLITE_PATH || './new_minecraft_heads.db');
db.pragma('journal_mode = WAL');
```

No external database setup is required. The database file is created
automatically on first run.

### PostgreSQL

When `DATABASE_URL` is set, the API switches to **pg** (node-postgres) with
connection pooling:

```js
const { Pool } = require('pg');
db = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: sslConfig()
});
```

`sslConfig()` enables TLS without certificate verification by default, which
works with self-signed certificates. Set `DATABASE_SSL=verify` (or
`DATABASE_CA_CERT`) to verify the server certificate, or `DATABASE_SSL=false` to
disable TLS for local PostgreSQL instances. See
[Environment Variables](../reference/environment.md#database_ssl).

Table names are prefixed with `mcheads_` in PostgreSQL mode to avoid conflicts
with other applications sharing the same database:

| SQLite table | PostgreSQL table |
| ------------ | ---------------- |
| `cache` | `mcheads_cache` |
| `stats` | `mcheads_stats` |
| `health_logs` | `mcheads_health_logs` |

---

## Cache Schema

The cache table stores rendered image buffers alongside their content type and
creation timestamp:

```sql
-- SQLite
CREATE TABLE IF NOT EXISTS cache (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    key TEXT UNIQUE NOT NULL,
    data BLOB,
    content_type TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- PostgreSQL
CREATE TABLE IF NOT EXISTS mcheads_cache (
    id SERIAL PRIMARY KEY,
    key TEXT UNIQUE NOT NULL,
    data BYTEA,
    content_type TEXT,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);
```

The `key` column has a UNIQUE constraint, so upserts are used to update
existing entries.

---

## Cache Key Format

Cache keys are built by the `getCacheKey` function by joining the endpoint, the
normalized player ID, and any further parts with `:`:

```js
function getCacheKey(endpoint, playerId, ...parts) {
    return [endpoint, playerId, ...parts].join(':');
}
```

The player ID comes from `parsePlayer` and is normalized so that equivalent
inputs share an entry:

| Input type | Player ID | Example |
| ---------- | --------- | ------- |
| Java username | `name:<lowercased username>` | `name:notch` |
| Java UUID (dashed or not) | `uuid:<32 lowercase hex>` | `uuid:069a79f444e94726a5befca90e38aaf5` |
| Bedrock XUID or Floodgate UUID | `xuid:<digits>` | `xuid:2535468413142004` |
| Bedrock gamertag | `gt:<lowercased gamertag>` | `gt:someplayer` |

The remaining parts are the parsed size plus `hat`/`nohat` for `/head` and
`/player`, or the direction then the parsed size for `/avatar`, `/ioshead` and
`/iosbody`. `/skin` and `/download` have no further parts. This produces keys
like:

| Request | Cache key |
| ------- | --------- |
| `GET /head/Notch/64/hat` | `head:name:notch:64:hat` |
| `GET /head/Notch/128` | `head:name:notch:128:nohat` |
| `GET /player/Notch` | `player:name:notch:128:nohat` |
| `GET /skin/Notch` | `skin:name:notch` |
| `GET /download/Notch` | `skin:name:notch` (shared with `/skin`) |
| `GET /avatar/Notch/right/128` | `avatar:name:notch:right:128` |
| `GET /ioshead/Notch/left` | `ioshead:name:notch:left:64` |
| `GET /head/00000000-0000-0000-0009-01febe1ac3f4` | `head:xuid:2535468413142004:128:nohat` |

Each unique combination of endpoint, player, size, and option gets its own
cache entry. This means `/head/Notch/128` and `/head/Notch/256` are cached
independently, while `/head/Notch`, `/head/notch/128` and `/head/Notch/128.png`
share one entry. Because the key uses the parsed size, a size above 512 shares
the entry for 512.

`/download` returns the same bytes as `/skin`, so it uses the `skin` endpoint
name and shares `/skin`'s entries.

---

## Hit / Miss Flow

Every image endpoint is built with `imageRoute` (`utils/imageRoute.js`) and
follows the same cache-check pattern:

```
Request arrives
    |
    v
parsePlayer(input) + parse size/options  (invalid --> 400)
    |
    v
Build cache key
    |
    v
getFromCache(key)   (errors are logged and treated as a miss)
    |
    +-- HIT: use the cached PNG
    |
    +-- MISS: getSkinInfo(player)      (in-memory, 10 min; 404 / 502 on failure)
    |         getSkinImage(skinUrl)    (in-memory, 24 h; 502 on failure)
    |         render(skin, ...)        (Sharp / Canvas)
    |         saveToCache(key, png)    (not awaited; errors are logged)
    |
    v
recordStats(edition)
    |
    v
Send PNG with Content-Type: image/png
             Cache-Control: public, max-age=3600
```

### Cache Lookup

```js
async function getFromCache(key) {
    const rows = await query(
        `SELECT data, CASE WHEN created_at > ${ago(CACHE_TTL)} THEN 1 ELSE 0 END AS fresh
         FROM ${T.cache} WHERE key = ?`,
        [key]
    );
    if (!rows[0]) return null;
    return { data: rows[0].data, fresh: Number(rows[0].fresh) === 1 };
}
```

The lookup returns the cached image and whether it is still fresh. The 1-hour
cutoff is computed in SQL with the database's own clock, in the same clock and
format that `CURRENT_TIMESTAMP` uses when the row is written:

- SQLite: `datetime('now', '-1 hour')`
- PostgreSQL: `NOW() - INTERVAL '1 hour'`

A fresh entry is served immediately. An entry older than 1 hour is re-rendered,
but the old image is kept as a fallback (see [Stale Fallback](#stale-fallback)).

> Earlier versions compared `created_at` with an ISO 8601 timestamp generated in
> JavaScript. SQLite stores `CURRENT_TIMESTAMP` as `YYYY-MM-DD HH:MM:SS` text, so
> the comparison almost always failed and SQLite cache entries were effectively
> never hit. Evaluating the TTL in SQL fixed this.

### Cache Write

```js
async function saveToCache(key, data, contentType) {
    await query(
        `INSERT INTO ${T.cache} (key, data, content_type, created_at) VALUES (?, ?, ?, CURRENT_TIMESTAMP)
         ON CONFLICT (key) DO UPDATE SET
            data = excluded.data, content_type = excluded.content_type, created_at = excluded.created_at`,
        [key, data, contentType]
    );
}
```

The same `ON CONFLICT (key) DO UPDATE` upsert is used on both SQLite and
PostgreSQL, so a re-rendered entry overwrites the old row in place instead of
accumulating duplicate rows.

### Stale Fallback

When an entry is older than 1 hour, the API re-renders it. If that fails because
an upstream service (Mojang, GeyserMC or the texture server) returned an error or
timed out, the API serves the old image instead of a 502:

- The response is `200` with `Cache-Control: public, max-age=60`, so clients ask
  again soon and pick up a fresh render once the upstream recovers.
- The server logs one line such as
  `Failed to render head, serving stale image: Mojang request failed: timeout of 10000ms exceeded (GET https://...)`.
- Players that were never cached (or whose entry was pruned) still get a 502.

Upstream timeouts default to 10 seconds per request (`UPSTREAM_TIMEOUT_MS`).

### Cache Errors

Cache read and write errors never fail a request. A failed read is logged as
`Cache read error:` and the image is rendered as if it were a miss; a failed
write is logged as `Cache write error:` and the rendered image is still sent.

---

## TTL and Expiration

The cache TTL is **1 hour**, defined as `CACHE_TTL` in `utils/database.js` and
evaluated in SQL on every lookup. Rows are kept for **24 hours**
(`CACHE_RETENTION`) so they can serve as a stale fallback, then deleted by
`pruneDatabase`, which runs once at startup and then every 10 minutes:

```js
async function pruneDatabase() {
    try {
        await query(`DELETE FROM ${T.cache} WHERE created_at <= ${ago(CACHE_RETENTION)}`);
        await query(`DELETE FROM ${T.health_logs} WHERE timestamp <= ${ago(HEALTH_LOG_RETENTION)}`);
    } catch (err) {
        console.error('Database prune error:', err);
    }
}
```

This means:

- **Old entries don't accumulate** -- keys that were requested once and never
  again are removed within about 10 minutes of turning 24 hours old.
- **Concurrent misses still render independently** -- if a popular key expires
  and many requests arrive at once, each one misses the database cache and
  renders. The in-memory caches below make sure they share a single player
  lookup and a single skin download, and the upsert means the last write wins.

---

## In-Memory Caches

Two bounded in-memory caches (`TtlCache` in `utils/memoryCache.js`) sit in front
of the upstream services:

| Cache | Key | Value | TTL | Max entries |
| ----- | --- | ----- | --- | ----------- |
| Player lookups | normalized player ID | `{ skinUrl, slim }` | 10 minutes | 5000 |
| Skin textures | texture URL | skin PNG buffer | 24 hours | 500 |

They store promises, so concurrent requests for the same player or texture
share one in-flight lookup instead of each calling Mojang, GeyserMC or the
texture server. Failed lookups are removed immediately and are not cached, so
the next request retries. When a cache is full, the oldest entries are evicted
first.

Texture URLs are content-addressed (a changed skin gets a new URL), so a cached
skin PNG never goes stale. The player lookup cache means a skin change can take
up to 10 minutes to be picked up by renders that miss the database cache.

These caches live in the Node.js process, so they are empty after a restart and
are not shared between multiple API instances.

---

## HTTP Cache Headers

All image responses, whether served from the cache or freshly rendered, include:

```
Cache-Control: public, max-age=3600
```

This matches the server-side cache lifetime and lets browsers, CDNs and reverse
proxies cache images for up to an hour.

---

## Stats Tracking

In addition to caching rendered images, the database tracks request counts per
edition. Every image endpoint calls `recordStats` each time it serves an image,
including cache hits:

```js
async function recordStats(edition) {
    try {
        await query(`UPDATE ${T.stats} SET count = count + 1 WHERE edition = ?`, [edition]);
    } catch (err) {
        console.error('Stats update error:', err);
    }
}
```

The stats table has two rows, initialized on startup:

| edition | count |
| ------- | ----- |
| java | 0 |
| bedrock | 0 |

Stats are incremented asynchronously and errors are caught and logged so that a
stats failure never blocks a render response.

---

## Health Logging

The health check endpoint (`/health`) also writes to the database:

```sql
CREATE TABLE IF NOT EXISTS health_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    status TEXT NOT NULL,        -- 'green', 'yellow', 'red'
    message TEXT,
    response_time INTEGER,       -- milliseconds
    timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
);
```

Health logs older than **7 days** are deleted by the same `pruneDatabase` job,
at startup and every 10 minutes. The health endpoint summarizes the logs from
the last 5 minutes (`recent_status`, `external_api_latency_avg`, `recent_checks`) and
counts them by status over the last 24 hours (`last_24h_summary`).

---

## Database Initialization

The `initDatabase` function is called once at server startup, before the Express
listener begins accepting requests:

```js
initDatabase().then(() => {
    const server = app.listen(PORT, () => { ... });
    // ... SIGINT / SIGTERM handlers ...
}).catch(err => {
    console.error('Failed to initialize database:', err);
    process.exit(1);
});
```

It creates all three tables (`cache`, `stats`, `health_logs`) if they do not
exist, seeds the stats table with zero counts for `java` and `bedrock`, runs
`pruneDatabase` once, and starts the 10-minute prune timer. If initialization
fails, the server exits with code 1.

---

## Shutdown

On `SIGINT` (Ctrl-C) or `SIGTERM`, the server shuts down gracefully: it stops
accepting new connections, waits for in-flight requests to finish, then closes
the database connection and exits:

```js
server.close(async () => {
    await closeDatabase();  // stops the prune timer; db.close() for SQLite, db.end() for PostgreSQL
    console.log('Database connection closed.');
    process.exit(0);
});
```

If shutdown takes longer than 10 seconds, the process is forced to exit with
code 1. This ensures that SQLite's WAL checkpoint completes and PostgreSQL
connections are properly terminated.
