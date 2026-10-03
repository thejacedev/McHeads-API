---
title: Health Check
order: 10
---

# Health Check

Returns a comprehensive JSON report on the health and status of the API, including service availability, response times, memory usage, uptime, and a 24-hour summary of recent health checks. This endpoint is designed for monitoring systems and dashboards.

## Endpoint

```
GET /health
```

## Parameters

This endpoint takes no parameters.

## How It Works

When called, the health endpoint performs the following steps:

1. **Mojang API check**: A test request is made to `https://api.mojang.com/users/profiles/minecraft/Notch` using the shared HTTP client, which has a 5-second timeout.
   - If the response contains data, the external API status is `green`.
   - If the response is empty, the status is `yellow`.
   - If the request fails or times out, the status is `red`.
2. **Response time**: The time taken by the check is measured in milliseconds.
3. **Live status**: `status` and `message` are determined from this check (see below).
4. **Logging**: The result is written to the health log table *before* the history is read, so the current check counts towards the history.
5. **Health log history**: The logged checks are summarized: `recent_status`, `recent_message`, `response_time_avg` and `recent_checks` cover the last 5 minutes, and `last_24h_summary` counts checks by status over the last 24 hours. The database connection is implicitly verified by these queries; if they succeed, `services.database` is `green`.

### Status Determination

The `status` and `message` fields reflect the live check, and always match the HTTP code:

| Condition | `status` | `message` | HTTP Code |
|-----------|----------|-----------|-----------|
| Mojang returned data and the check took 2000 ms or less | `green` | `All systems operational` | 200 |
| Mojang returned no data, or the check took more than 2000 ms | `yellow` | `Performance degraded` | 200 |
| Mojang request failed or timed out | `red` | `External API issues detected` | 503 |
| Health check itself throws an error (e.g. a database query fails) | `red` | `Health check failed` | 503 |

Historical checks never override `status` or `message`; their assessment is reported separately in `recent_status` and `recent_message`. Each health check result is logged to the database for historical tracking.

## Response

| Header | Value |
|--------|-------|
| `Content-Type` | `application/json` |

### Response Shape (Success)

```json
{
  "status": "green",
  "message": "All systems operational",
  "timestamp": "2026-03-20T12:00:00.000Z",
  "services": {
    "database": "green",
    "external_apis": "green",
    "response_time": "45ms"
  },
  "uptime_seconds": 86400,
  "memory_usage": {
    "used": 64,
    "total": 128
  },
  "recent_status": "green",
  "recent_message": "All systems operational",
  "uptime": 86400.512,
  "response_time_avg": 42,
  "recent_checks": 5,
  "last_24h_summary": {
    "green": 1200,
    "yellow": 15
  }
}
```

### Field Reference

| Field | Type | Description |
|-------|------|-------------|
| `status` | string | Overall system status: `"green"`, `"yellow"`, or `"red"` |
| `message` | string | Human-readable status message |
| `timestamp` | string | ISO 8601 timestamp of this health check |
| `services` | object | Individual service health statuses |
| `services.database` | string | Database connection status (always `"green"` if the check completes) |
| `services.external_apis` | string | Mojang API reachability: `"green"`, `"yellow"`, or `"red"` |
| `services.response_time` | string | Time taken to complete this health check, formatted as `"{ms}ms"` |
| `uptime_seconds` | integer | Seconds since the Node.js process started |
| `memory_usage` | object | Current heap memory usage |
| `memory_usage.used` | integer | Used heap memory in megabytes (rounded) |
| `memory_usage.total` | integer | Total heap memory in megabytes (rounded) |
| `recent_status` | string | Assessment of the checks logged in the last 5 minutes: `"green"`, `"yellow"`, or `"red"` (see [Recent Check Window](#recent-check-window)) |
| `recent_message` | string | Human-readable message for `recent_status` |
| `uptime` | number | Seconds since the Node.js process started, unrounded (`process.uptime()`) |
| `response_time_avg` | integer | Average response time of the checks logged in the last 5 minutes, in milliseconds |
| `recent_checks` | integer | Number of health checks logged in the last 5 minutes, including this one |
| `last_24h_summary` | object | Number of checks logged in the last 24 hours, keyed by status. Statuses with no checks are omitted |

### Response Shape (Degraded)

When the Mojang check takes more than 2 seconds (or returns no data, in which case `external_apis` is also `yellow`):

```json
{
  "status": "yellow",
  "message": "Performance degraded",
  "timestamp": "2026-03-20T12:00:00.000Z",
  "services": {
    "database": "green",
    "external_apis": "green",
    "response_time": "2150ms"
  },
  "uptime_seconds": 86400,
  "memory_usage": {
    "used": 72,
    "total": 128
  },
  "recent_status": "yellow",
  "recent_message": "Some services experiencing issues",
  "uptime": 86400.512,
  "response_time_avg": 1800,
  "recent_checks": 5,
  "last_24h_summary": {
    "green": 1100,
    "yellow": 115
  }
}
```

### Response Shape (Critical)

When the Mojang API is unreachable:

```json
{
  "status": "red",
  "message": "External API issues detected",
  "timestamp": "2026-03-20T12:00:00.000Z",
  "services": {
    "database": "green",
    "external_apis": "red",
    "response_time": "5023ms"
  },
  "uptime_seconds": 86400,
  "memory_usage": {
    "used": 68,
    "total": 128
  },
  "recent_status": "red",
  "recent_message": "Multiple service errors detected",
  "uptime": 86400.512,
  "response_time_avg": 4500,
  "recent_checks": 5,
  "last_24h_summary": {
    "green": 900,
    "yellow": 100,
    "red": 215
  }
}
```

HTTP status code is `503 Service Unavailable` when `status` is `red`.

### Response Shape (Health Check Failure)

When the health check itself fails (for example, a database query throws):

```json
{
  "status": "red",
  "message": "Health check failed",
  "timestamp": "2026-03-20T12:00:00.000Z",
  "error": "Database connection lost",
  "response_time": "15ms"
}
```

HTTP status code is `503`.

## Examples

### Basic health check

```bash
curl https://your-domain.com/health
```

```
GET /health
```

### Pretty-print

```bash
curl -s https://your-domain.com/health | jq .
```

### Check only the status field

```bash
curl -s https://your-domain.com/health | jq '.status'
```

Returns:

```
"green"
```

### Check with HTTP status code

```bash
curl -s -o /dev/null -w "%{http_code}" https://your-domain.com/health
```

Returns `200` when `status` is `green` or `yellow`, `503` when it is `red`.

### Monitoring script

```bash
#!/bin/bash
STATUS=$(curl -s -o /dev/null -w "%{http_code}" https://your-domain.com/health)

if [ "$STATUS" -ne 200 ]; then
    echo "ALERT: Minecraft Heads API is unhealthy (HTTP $STATUS)"
    # Send notification...
fi
```

### Detailed monitoring

```bash
curl -s https://your-domain.com/health | jq '{
  status: .status,
  message: .message,
  uptime_hours: (.uptime_seconds / 3600 | floor),
  memory_mb: .memory_usage.used,
  response_ms: .services.response_time,
  mojang_api: .services.external_apis,
  checks_24h: .last_24h_summary
}'
```

Output:

```json
{
  "status": "green",
  "message": "All systems operational",
  "uptime_hours": 72,
  "memory_mb": 64,
  "response_ms": "45ms",
  "mojang_api": "green",
  "checks_24h": {
    "green": 1200,
    "yellow": 15
  }
}
```

### JavaScript example

```javascript
async function checkHealth() {
    try {
        const response = await fetch('https://your-domain.com/health');
        const health = await response.json();

        if (health.status === 'red') {
            console.error('API is DOWN:', health.message);
        } else if (health.status === 'yellow') {
            console.warn('API is DEGRADED:', health.message);
        } else {
            console.log('API is HEALTHY');
        }

        console.log(`Uptime: ${Math.floor(health.uptime_seconds / 3600)}h`);
        console.log(`Memory: ${health.memory_usage.used}MB / ${health.memory_usage.total}MB`);
        console.log(`Response time: ${health.services.response_time}`);
    } catch (error) {
        console.error('Cannot reach API:', error.message);
    }
}
```

### Docker/Kubernetes health probe

```yaml
# Kubernetes liveness probe
livenessProbe:
  httpGet:
    path: /health
    port: 3005
  initialDelaySeconds: 10
  periodSeconds: 30
  failureThreshold: 3

# Kubernetes readiness probe
readinessProbe:
  httpGet:
    path: /health
    port: 3005
  initialDelaySeconds: 5
  periodSeconds: 15
```

```dockerfile
# Docker HEALTHCHECK
HEALTHCHECK --interval=30s --timeout=10s --retries=3 \
  CMD curl -f http://localhost:3005/health || exit 1
```

If rate limiting is enabled (`RATE_LIMIT_PER_MINUTE`), requests to `/health` count towards the per-IP limit like every other endpoint, and a probe over the limit gets HTTP 429.

## Health Log Storage

Each health check result is logged to the `health_logs` table:

```sql
CREATE TABLE health_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    status TEXT NOT NULL,
    message TEXT,
    response_time INTEGER,
    timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
);
```

Logs older than 7 days are deleted at startup and every 10 minutes. Time windows (7 days, 24 hours, 5 minutes) are evaluated in SQL using the database's own clock.

## Recent Check Window

The `recent_status` and `recent_message` fields summarize the health logs from the **last 5 minutes**. They do not affect `status`, `message` or the HTTP code:

| Condition (evaluated in order) | `recent_status` | `recent_message` |
|-----------|-----------------|------------------|
| No checks logged in the last 5 minutes | `red` | `No recent health checks` |
| More than 50% of recent checks are `red` | `red` | `Multiple service errors detected` |
| Any recent check is `red`, or more than 30% are `yellow` | `yellow` | `Some services experiencing issues` |
| Otherwise | `green` | `All systems operational` |

Because the current check is logged before the history is read, `recent_checks` is normally at least 1, and `"No recent health checks"` only appears if writing the log entry failed.

## Caching

This endpoint is not cached. Each request performs a live check against the Mojang API and queries the database for historical data to ensure the health report is always current.
