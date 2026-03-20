---
order: 5
title: Caching
---

# Caching

Every rendered image is cached for **1 hour** (3600 seconds) to avoid redundant
skin fetches and re-renders. The caching layer supports two backends -- SQLite
for local/development use and PostgreSQL for production deployments -- and is
transparent to the rest of the application.

---

## Cache Backends

### SQLite (Default)

When no `DATABASE_URL` environment variable is set, the API uses
**better-sqlite3** to store cache entries in a local file:

```
./new_minecraft_heads.db
```

SQLite is configured with **WAL (Write-Ahead Logging)** mode for better
concurrent read performance:

```js
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
    ssl: process.env.DATABASE_SSL === 'false'
        ? false
        : { rejectUnauthorized: false }
});
```

SSL is enabled by default. Set `DATABASE_SSL=false` to disable it for local
PostgreSQL instances.

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

The `key` column has a UNIQUE constraint, so upserts (insert-or-replace) are
used to update existing entries.

---

## Cache Key Format

Cache keys are built by the `getCacheKey` function:

```js
function getCacheKey(endpoint, input, size, option) {
    return `${endpoint}_${input}_${size || 'default'}_${option || 'default'}`;
}
```

This produces keys like:

| Request | Cache key |
| ------- | --------- |
| `GET /head/Notch/256/hat` | `head_Notch_256_hat` |
| `GET /head/Notch/128` | `head_Notch_128_default` |
| `GET /player/Notch` | `player_Notch_default_default` |
| `GET /skin/Notch` | `skin_Notch_default_default` |
| `GET /avatar/Notch/right/200` | `avatar_Notch_right_200` |
| `GET /ioshead/Notch/left` | `ioshead_Notch_left_default` |

Each unique combination of endpoint, player, size, and option gets its own
cache entry. This means `/head/Notch/128` and `/head/Notch/256` are cached
independently.

---

## Hit / Miss Flow

Every rendering endpoint follows the same cache-check pattern:

```
Request arrives
    |
    v
Build cache key from parameters
    |
    v
getFromCache(key)
    |
    +-- HIT: return cached data immediately
    |         (set Content-Type from cached content_type)
    |
    +-- MISS: continue to render pipeline
              |
              v
         Resolve player profile (Mojang/GeyserMC)
              |
              v
         Render image (Sharp/Jimp/Canvas)
              |
              v
         saveToCache(key, buffer, 'image/png')
              |
              v
         Return rendered buffer to client
```

### Cache Lookup

```js
async function getFromCache(key) {
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    // SQLite:
    return db.prepare(
        `SELECT data, content_type FROM cache
         WHERE key = ? AND created_at > ?`
    ).get(key, oneHourAgo) || null;
}
```

The lookup filters by both the key and the `created_at` timestamp. Any entry
older than 1 hour is treated as a miss, even though the row still exists in the
database.

### Cache Write

```js
async function saveToCache(key, data, contentType) {
    // SQLite:
    db.prepare(
        `INSERT OR REPLACE INTO cache (key, data, content_type)
         VALUES (?, ?, ?)`
    ).run(key, data, contentType);
}
```

The `INSERT OR REPLACE` (SQLite) or `ON CONFLICT ... DO UPDATE` (PostgreSQL)
ensures that expired entries are overwritten in-place rather than accumulating
duplicate rows.

---

## TTL and Expiration

The cache TTL is **1 hour** (60 * 60 * 1000 milliseconds), hardcoded in
`getFromCache`. There is no background cleanup job. Expired entries remain in the
database until they are overwritten by a new request for the same key.

This means:

- **Stale entries accumulate** for keys that were requested once but never again.
  Over time, the database file grows. For high-traffic deployments, consider
  adding a periodic cleanup cron job.
- **No thundering herd protection** -- if a popular key expires and 100 requests
  arrive simultaneously, all 100 will miss the cache and trigger independent
  renders. The last one to finish writes to the cache; the others' writes are
  effectively no-ops because of the REPLACE/UPSERT behavior.

---

## Stats Tracking

In addition to caching rendered images, the database tracks request counts per
edition. Every rendering endpoint calls `recordStats` after resolving the
player profile:

```js
async function recordStats(endpoint, input, edition) {
    db.prepare(
        `UPDATE stats SET count = count + 1 WHERE edition = ?`
    ).run(edition);
}
```

The stats table has two rows, initialized on startup:

| edition | count |
| ------- | ----- |
| java | 0 |
| bedrock | 0 |

Stats are incremented asynchronously and errors are caught silently so that a
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

Health logs are capped at **10,000 rows** by a cleanup query that runs during
database initialization. The health status endpoint reads the most recent 100
logs to compute an aggregate status.

---

## Database Initialization

The `initDatabase` function is called once at server startup, before the Express
listener begins accepting requests:

```js
initDatabase().then(() => {
    app.listen(PORT, () => { ... });
}).catch(err => {
    console.error('Failed to initialize database:', err);
    process.exit(1);
});
```

It creates all three tables (`cache`, `stats`, `health_logs`) if they do not
exist and seeds the stats table with zero counts for `java` and `bedrock`. If
initialization fails, the server exits with code 1.

---

## Shutdown

On `SIGINT` (Ctrl-C), the server gracefully closes the database connection:

```js
process.on('SIGINT', () => {
    closeDatabase();  // db.close() for SQLite, db.end() for PostgreSQL
    process.exit(0);
});
```

This ensures that SQLite's WAL checkpoint completes and PostgreSQL connections
are properly terminated.
