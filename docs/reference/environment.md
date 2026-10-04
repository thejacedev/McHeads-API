---
order: 5
title: Environment Variables
---

# Environment Variables

The Minecraft Heads API reads its configuration from environment variables,
loaded via the `dotenv` package from a `.env` file in the project root. All
variables are optional -- the API has sensible defaults for local development.

---

## Variable Reference

### PORT

The TCP port the Express server listens on.

| Property | Value |
| -------- | ----- |
| **Variable** | `PORT` |
| **Type** | Integer |
| **Default** | `3005` |
| **Required** | No |

```bash
PORT=8080
```

The server binds to all interfaces (`0.0.0.0`) on the specified port. On
startup, it logs the port:

```
Minecraft Heads API running on port 8080
Health check: http://localhost:8080/health
```

Common values:
- `3005` -- default, good for local development.
- `3000` -- common Node.js convention.
- `8080` -- common alternative when port 80 is restricted.
- `80` or `443` -- production with direct exposure (usually behind a reverse
  proxy instead).

---

### DATABASE_URL

PostgreSQL connection string. When set, the API uses PostgreSQL instead of
SQLite for caching, stats, and health logs.

| Property | Value |
| -------- | ----- |
| **Variable** | `DATABASE_URL` |
| **Type** | String (PostgreSQL connection URI) |
| **Default** | Not set (SQLite used) |
| **Required** | No |

```bash
DATABASE_URL=postgresql://user:password@host:5432/database
```

The connection string follows the standard PostgreSQL URI format:

```
postgresql://[user[:password]@][host][:port][/database][?param=value]
```

When `DATABASE_URL` is set, the API:

1. Creates a **pg connection pool** instead of opening a SQLite file.
2. Prefixes all table names with `mcheads_` to avoid conflicts with other
   applications sharing the same database (`mcheads_cache`, `mcheads_stats`,
   `mcheads_health_logs`).
3. Uses `BYTEA` columns for image data instead of SQLite `BLOB`.
4. Uses `TIMESTAMPTZ` columns instead of `DATETIME`.
5. Uses `SERIAL` primary keys instead of `AUTOINCREMENT`.

When `DATABASE_URL` is **not** set, the API uses **better-sqlite3** with the
database file `./new_minecraft_heads.db` in the project root (or the path in
[`SQLITE_PATH`](#sqlite_path)). The file is created automatically on first run.

---

### DATABASE_SSL

Controls TLS for the PostgreSQL connection. Only relevant when `DATABASE_URL`
is set.

| Property | Value |
| -------- | ----- |
| **Variable** | `DATABASE_SSL` |
| **Type** | String (unset, `"verify"` or `"false"`) |
| **Default** | Unset (TLS without certificate verification) |
| **Required** | No |

| Value | Behavior |
| ----- | -------- |
| _(unset)_ | TLS without certificate verification, so self-signed certificates (Railway, Heroku, ...) work. If [`DATABASE_CA_CERT`](#database_ca_cert) is set, the certificate is verified against it |
| `verify` | TLS **with certificate verification**, against `DATABASE_CA_CERT` if set, otherwise against the system CAs |
| `false` | No TLS |

Any other value behaves the same as leaving it unset.

```bash
DATABASE_SSL=false
```

The setting is translated into the `ssl` option of the `pg` connection pool:

```js
function sslConfig() {
    if (process.env.DATABASE_SSL === 'false') return false;
    if (process.env.DATABASE_CA_CERT) {
        return { ca: require('fs').readFileSync(process.env.DATABASE_CA_CERT, 'utf8') };
    }
    if (process.env.DATABASE_SSL === 'verify') return true;
    return { rejectUnauthorized: false };
}
```

Set `DATABASE_SSL=false` when connecting to a local PostgreSQL instance that
does not support TLS.

**Troubleshooting:** if the server fails to connect with
`self-signed certificate in certificate chain` after setting
`DATABASE_SSL=verify`, your provider signs its certificates with its own CA.
Set [`DATABASE_CA_CERT`](#database_ca_cert) to the provider's CA certificate,
or remove `DATABASE_SSL=verify` to skip verification.

This variable is ignored when using SQLite (i.e., when `DATABASE_URL` is not
set).

---

### DATABASE_CA_CERT

Path to a CA certificate file used to verify the PostgreSQL server's
certificate. Only used when `DATABASE_URL` is set and `DATABASE_SSL` is not `false`. Setting it turns certificate verification on.

| Property | Value |
| -------- | ----- |
| **Variable** | `DATABASE_CA_CERT` |
| **Type** | String (file path) |
| **Default** | Not set |
| **Required** | No |

```bash
DATABASE_CA_CERT=/etc/ssl/certs/provider-ca.pem
```

Use this for providers that sign their server certificates with their own CA,
such as Supabase, Aiven and DigitalOcean, when you want the server's identity
checked. (`DATABASE_SSL=verify` alone checks against the system CAs, which fails
for these providers with `self-signed certificate in certificate chain`.)

The file is read once when the database module loads, so a missing or
unreadable file stops the server from starting.

---

### SQLITE_PATH

Path of the SQLite database file. Only used when `DATABASE_URL` is not set.

| Property | Value |
| -------- | ----- |
| **Variable** | `SQLITE_PATH` |
| **Type** | String (file path) |
| **Default** | `./new_minecraft_heads.db` |
| **Required** | No |

```bash
SQLITE_PATH=/var/lib/mcheads/heads.db
```

Relative paths are resolved against the working directory. The file is created
if it does not exist. SQLite also creates `-wal` and `-shm` files next to it
because the database runs in WAL mode.

---

### RATE_LIMIT_PER_MINUTE

Enables a per-IP request limit.

| Property | Value |
| -------- | ----- |
| **Variable** | `RATE_LIMIT_PER_MINUTE` |
| **Type** | Integer |
| **Default** | Not set (rate limiting disabled) |
| **Required** | No |

```bash
RATE_LIMIT_PER_MINUTE=120
```

When set to a positive number, each client IP may make that many requests per
one-minute window, across all endpoints. Further requests in the same window
get:

```http
HTTP/1.1 429 Too Many Requests
Retry-After: 37
Content-Type: application/json

{"error": "Too many requests"}
```

`Retry-After` is the number of seconds until the window resets. Unset, `0`, or
a non-numeric value disables the limiter.

The limiter uses a fixed window and keeps its counts in memory, so each API
process counts separately and the counts reset on restart. Behind a reverse
proxy, also set [`TRUST_PROXY`](#trust_proxy); otherwise every request appears
to come from the proxy's IP and all clients share one limit.

---

### UPSTREAM_TIMEOUT_MS

Timeout for each request to Mojang, GeyserMC and the texture server.

| Property | Value |
| -------- | ----- |
| **Variable** | `UPSTREAM_TIMEOUT_MS` |
| **Type** | Integer (milliseconds) |
| **Default** | `10000` (10 seconds) |
| **Required** | No |

```bash
UPSTREAM_TIMEOUT_MS=8000
```

A request that takes longer is abandoned. The API then serves a fallback image
(the last render, or the default skin for players it has never rendered;
`/download` returns HTTP 502 instead). Mojang's
session server has occasional multi-second spikes, so very low values cause
avoidable errors. The `/health` Mojang check always uses its own 5-second
timeout.

---

### TRUST_PROXY

Sets Express's `trust proxy` setting, which controls how `req.ip` (used by the
rate limiter) is derived from `X-Forwarded-For`.

| Property | Value |
| -------- | ----- |
| **Variable** | `TRUST_PROXY` |
| **Type** | `true`, an integer hop count, or a list of trusted addresses |
| **Default** | Not set (`X-Forwarded-For` is ignored) |
| **Required** | No |

```bash
TRUST_PROXY=1
```

The value is parsed as follows:

- `true` -- trust every proxy (the boolean `true`).
- A number such as `1` -- trust that many proxy hops in front of the server.
- Anything else -- passed to Express unchanged, e.g. `loopback` or a
  comma-separated list of addresses or subnets.

Set it when the API runs behind nginx, a load balancer, or a hosting platform's
proxy, so rate limiting sees client IPs.

---

## Example .env Files

### Minimal (SQLite, default port)

```env
# No configuration needed -- all defaults apply.
# The .env file can be empty or absent.
```

### Local Development with Custom Port

```env
PORT=3000
```

### Production with PostgreSQL

```env
PORT=8080
DATABASE_URL=postgresql://mcheads:secretpassword@db.example.com:5432/mcheads_production
# Verify the server certificate against the system CAs
DATABASE_SSL=verify
```

### PostgreSQL Provider with Its Own CA

```env
DATABASE_URL=postgresql://mcheads:secretpassword@db.example.com:5432/mcheads
DATABASE_CA_CERT=/etc/ssl/certs/provider-ca.pem
```

### Behind a Reverse Proxy with Rate Limiting

```env
PORT=3005
RATE_LIMIT_PER_MINUTE=120
TRUST_PROXY=1
```

### Local PostgreSQL (No SSL)

```env
PORT=3005
DATABASE_URL=postgresql://localhost:5432/mcheads_dev
DATABASE_SSL=false
```

---

## How Variables Are Loaded

The `dotenv` package is loaded at the very top of `server.js`:

```js
require('dotenv').config();
```

This reads the `.env` file from the current working directory and populates
`process.env`. Variables set in the actual system environment take precedence
over `.env` file values.

`server.js` then loads the Express app (`app.js`), which reads `TRUST_PROXY` and
`RATE_LIMIT_PER_MINUTE` (and, through `utils/http.js`, `UPSTREAM_TIMEOUT_MS`),
and the database module (`utils/database.js`), which
reads `DATABASE_URL`, `DATABASE_SSL`, `DATABASE_CA_CERT` and `SQLITE_PATH`
immediately on import:

```js
const usePostgres = !!process.env.DATABASE_URL;
```

This means the configuration is determined once at startup and cannot be
changed at runtime.

---

## Database Backend Comparison

| Feature | SQLite | PostgreSQL |
| ------- | ------ | ---------- |
| Setup required | None | Connection string |
| Table prefix | None | `mcheads_` |
| Image storage type | `BLOB` | `BYTEA` |
| Timestamp type | `DATETIME` | `TIMESTAMPTZ` |
| Concurrency | WAL mode (readers don't block) | Full MVCC |
| Connection pooling | N/A (single file) | pg Pool |
| TLS | N/A | On, unverified by default (`DATABASE_SSL`, `DATABASE_CA_CERT`) |
| Deployment | Single server only | Multi-server capable |
| File on disk | `new_minecraft_heads.db` | N/A |

### When to Use SQLite

- Local development.
- Single-server deployments with moderate traffic.
- No need to share cache across multiple API instances.
- Simplest possible setup (zero configuration).

### When to Use PostgreSQL

- Production deployments with high traffic.
- Multiple API instances sharing a cache (horizontal scaling). Note that the
  optional rate limiter still counts per instance.
- Managed database services with automatic backups.
- Integration with existing PostgreSQL infrastructure.

---

## Verifying Configuration

After starting the server, check the console output to confirm which database
backend is active:

```
Using SQLite database
Minecraft Heads API running on port 3005
```

or:

```
Using PostgreSQL database
Minecraft Heads API running on port 8080
```

The `/health` endpoint also confirms the server is running and reports the
current status of external API connectivity.
