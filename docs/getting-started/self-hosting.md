---
title: Self-Hosting
order: 3
---

# Self-Hosting

The Minecraft Heads API can be self-hosted on your own server. This guide covers local development, production configuration, Docker deployment, and Railway deployment.

## Prerequisites

- **Node.js 18+** -- The API uses modern JavaScript features and native dependencies.
- **Build tools** -- The `canvas` and `sharp` npm packages require native compilation. On most systems, these install prebuilt binaries automatically. If they fail, you may need to install system dependencies.

### System Dependencies for Canvas

On Debian/Ubuntu:

```bash
sudo apt-get install -y build-essential libcairo2-dev libjpeg-dev libpango1.0-dev libgif-dev librsvg2-dev
```

On Fedora:

```bash
sudo dnf install gcc-c++ cairo-devel pango-devel libjpeg-turbo-devel giflib-devel librsvg2-devel
```

On macOS (via Homebrew):

```bash
brew install pkg-config cairo pango libpng jpeg giflib librsvg
```

## Quick Start

Clone the repository and install dependencies:

```bash
git clone https://github.com/thejacedev/McHeads-API.git
cd McHeads-API
npm install
```

Start the development server with hot reload:

```bash
npm run dev
```

The API will start on port 3005 by default. Test it with:

```bash
curl -o test_head.png http://localhost:3005/head/Notch/128
```

For production without hot reload:

```bash
npm start
```

## Environment Variables

Create a `.env` file in the project root. You can copy the included example:

```bash
cp .env.example .env
```

### Available Variables

| Variable | Default | Description |
|---|---|---|
| `PORT` | `3005` | The port the HTTP server listens on |
| `DATABASE_URL` | _(none)_ | PostgreSQL connection string. If not set, the API uses a local SQLite file |
| `DATABASE_SSL` | `true` | Set to `false` to disable SSL for the PostgreSQL connection |

### Minimal Configuration (SQLite)

For local development or small deployments, no configuration is needed. The API creates a SQLite database file (`new_minecraft_heads.db`) in the project root automatically:

```env
PORT=3005
```

This is the simplest setup. SQLite handles caching, stats, and health logs in a single file with no external dependencies.

### PostgreSQL Configuration

For production deployments with higher traffic, configure PostgreSQL by setting `DATABASE_URL`:

```env
PORT=3005
DATABASE_URL=postgresql://mcheads:password@localhost:5432/mcheads
```

The API creates the required tables automatically on startup (`mcheads_stats`, `mcheads_cache`, `mcheads_health_logs`). Table names are prefixed with `mcheads_` when using PostgreSQL, so the API can share a database with other applications without naming conflicts.

If your PostgreSQL instance does not use SSL (common for local development), disable it:

```env
DATABASE_URL=postgresql://mcheads:password@localhost:5432/mcheads
DATABASE_SSL=false
```

## Database Details

### SQLite (Default)

- Database file: `new_minecraft_heads.db` in the project root
- Uses WAL (Write-Ahead Logging) journal mode for better concurrent read performance
- Tables: `stats`, `cache`, `health_logs`
- No setup required; the file is created on first run
- The database file is excluded from version control via `.gitignore`

### PostgreSQL

- Requires an existing PostgreSQL server (version 12+)
- Tables: `mcheads_stats`, `mcheads_cache`, `mcheads_health_logs`
- SSL enabled by default (set `DATABASE_SSL=false` to disable)
- Connection pooling handled by the `pg` library's `Pool` class
- Tables are created automatically on startup via `CREATE TABLE IF NOT EXISTS`

Both backends provide identical functionality. The API abstracts the differences internally.

## Docker Deployment

Create a `Dockerfile` in the project root:

```dockerfile
FROM node:20-slim

# Install canvas system dependencies
RUN apt-get update && apt-get install -y \
    build-essential \
    libcairo2-dev \
    libjpeg-dev \
    libpango1.0-dev \
    libgif-dev \
    librsvg2-dev \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package*.json ./
RUN npm ci --only=production

COPY . .

EXPOSE 3005

CMD ["node", "server.js"]
```

Build and run:

```bash
docker build -t mcheads-api .
docker run -d \
    -p 3005:3005 \
    --name mcheads \
    mcheads-api
```

### Docker with PostgreSQL

Use Docker Compose to run the API alongside a PostgreSQL instance:

```yaml
# docker-compose.yml
version: "3.8"

services:
    api:
        build: .
        ports:
            - "3005:3005"
        environment:
            - PORT=3005
            - DATABASE_URL=postgresql://mcheads:mcheads@db:5432/mcheads
            - DATABASE_SSL=false
        depends_on:
            - db
        restart: unless-stopped

    db:
        image: postgres:16-alpine
        environment:
            - POSTGRES_USER=mcheads
            - POSTGRES_PASSWORD=mcheads
            - POSTGRES_DB=mcheads
        volumes:
            - pgdata:/var/lib/postgresql/data
        restart: unless-stopped

volumes:
    pgdata:
```

Start the stack:

```bash
docker compose up -d
```

The API will be available at `http://localhost:3005`. PostgreSQL data is persisted in the `pgdata` Docker volume.

## Railway Deployment

[Railway](https://railway.app) can deploy the API directly from a GitHub repository.

1. Push your code to a GitHub repository (or fork the original).

2. Create a new project on Railway and connect your GitHub repo.

3. Railway detects the Node.js project automatically and runs `npm install` followed by `npm start`.

4. Add a PostgreSQL plugin to the project from the Railway dashboard.

5. Set the environment variables in the Railway service settings:

    ```
    PORT=3005
    DATABASE_URL=${{Postgres.DATABASE_URL}}
    ```

    Railway injects the `DATABASE_URL` from the PostgreSQL plugin automatically when you reference it with `${{Postgres.DATABASE_URL}}`.

6. Deploy. Railway assigns a public URL to your service.

The API works on Railway's free and paid tiers. The `canvas` native dependency compiles successfully in Railway's build environment without additional configuration.

## Reverse Proxy with Nginx

For production, place the API behind Nginx to handle TLS termination and static caching:

```nginx
server {
    listen 443 ssl http2;
    server_name api.mcheads.org;

    ssl_certificate     /etc/letsencrypt/live/api.mcheads.org/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/api.mcheads.org/privkey.pem;

    location / {
        proxy_pass http://127.0.0.1:3005;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;

        # Cache rendered images at the proxy level
        proxy_cache_valid 200 1h;
    }
}
```

## Process Management

For production deployments on a VPS, use a process manager to keep the API running:

### systemd

Create `/etc/systemd/system/mcheads.service`:

```ini
[Unit]
Description=Minecraft Heads API
After=network.target

[Service]
Type=simple
User=mcheads
WorkingDirectory=/opt/mcheads-api
ExecStart=/usr/bin/node server.js
Restart=on-failure
RestartSec=10
Environment=PORT=3005

[Install]
WantedBy=multi-user.target
```

Enable and start:

```bash
sudo systemctl enable mcheads
sudo systemctl start mcheads
```

### PM2

```bash
npm install -g pm2
pm2 start server.js --name mcheads
pm2 save
pm2 startup
```

## Verifying the Installation

After starting the API, verify that everything is working:

```bash
# Health check (returns JSON)
curl http://localhost:3005/health

# Render a head (saves a PNG file)
curl -o test.png http://localhost:3005/head/Notch/128

# Check stats
curl http://localhost:3005/allstats
```

The health endpoint checks connectivity to the Mojang API and reports the overall system status. A `green` status means all systems are operational.

## Graceful Shutdown

The API listens for `SIGINT` (Ctrl+C) and closes the database connection before exiting. This prevents SQLite WAL file corruption and ensures PostgreSQL connections are released cleanly.
