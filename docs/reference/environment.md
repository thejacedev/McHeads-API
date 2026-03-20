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
database file `./new_minecraft_heads.db` in the project root. The file is
created automatically on first run.

---

### DATABASE_SSL

Controls SSL for the PostgreSQL connection. Only relevant when `DATABASE_URL`
is set.

| Property | Value |
| -------- | ----- |
| **Variable** | `DATABASE_SSL` |
| **Type** | String (`"true"` or `"false"`) |
| **Default** | `true` (SSL enabled) |
| **Required** | No |

```bash
DATABASE_SSL=false
```

When SSL is enabled (the default), the connection uses:

```js
ssl: { rejectUnauthorized: false }
```

This allows connections to PostgreSQL instances with self-signed certificates,
which is common with managed database services like Heroku Postgres, Railway,
and Render.

Set `DATABASE_SSL=false` when connecting to a local PostgreSQL instance that
does not support SSL:

```js
ssl: false
```

This variable is ignored when using SQLite (i.e., when `DATABASE_URL` is not
set).

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
DATABASE_SSL=true
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

The database module (`utils/database.js`) reads the variables immediately on
import:

```js
const usePostgres = !!process.env.DATABASE_URL;
```

This means the database backend is determined once at startup and cannot be
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
| SSL | N/A | Configurable |
| Deployment | Single server only | Multi-server capable |
| File on disk | `new_minecraft_heads.db` | N/A |

### When to Use SQLite

- Local development.
- Single-server deployments with moderate traffic.
- No need to share cache across multiple API instances.
- Simplest possible setup (zero configuration).

### When to Use PostgreSQL

- Production deployments with high traffic.
- Multiple API instances sharing a cache (horizontal scaling).
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
