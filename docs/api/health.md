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

When called, the health endpoint performs the following checks:

1. **Database check**: The database connection is implicitly verified by querying health log history. If the query succeeds, the database is marked as `green`.
2. **Mojang API check**: A test request is made to `https://api.mojang.com/users/profiles/minecraft/Notch` with a 5-second timeout.
   - If the response contains data, the external API status is `green`.
   - If the response is empty or slow, the status is `yellow`.
   - If the request fails or times out, the status is `red`.
3. **Response time**: The total time to complete all checks is measured in milliseconds.
4. **Health log history**: Recent health check logs are retrieved from the database to calculate the 24-hour summary and recent check statistics.

### Status Determination

The overall status is determined by combining the results of all checks:

| Condition | Overall Status | HTTP Code |
|-----------|---------------|-----------|
| All checks pass | `green` | 200 |
| External API slow OR response time > 2000ms | `yellow` | 200 |
| External API unreachable | `red` | 503 |
| Health check itself throws an error | `red` | 503 |

Each health check result is logged to the database for historical tracking.

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
  "recent_checks": 5,
  "response_time_avg": 42,
  "last_24h_summary": {
    "green": 1200,
    "yellow": 15,
    "red": 0
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
| `recent_checks` | integer | Number of health checks logged in the last 5 minutes |
| `response_time_avg` | integer | Average response time of recent health checks in milliseconds |
| `last_24h_summary` | object | Counts of each status level over the last 24 hours (up to 1440 entries) |

### Response Shape (Degraded)

When external APIs are slow:

```json
{
  "status": "yellow",
  "message": "Performance degraded",
  "timestamp": "2026-03-20T12:00:00.000Z",
  "services": {
    "database": "green",
    "external_apis": "yellow",
    "response_time": "2150ms"
  },
  "uptime_seconds": 86400,
  "memory_usage": {
    "used": 72,
    "total": 128
  },
  "recent_checks": 5,
  "response_time_avg": 1800,
  "last_24h_summary": {
    "green": 1100,
    "yellow": 115,
    "red": 0
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
  "recent_checks": 5,
  "response_time_avg": 4500,
  "last_24h_summary": {
    "green": 900,
    "yellow": 100,
    "red": 215
  }
}
```

HTTP status code is `503 Service Unavailable` when the overall status is `red`.

### Response Shape (Health Check Failure)

When the health check itself fails:

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

Returns `200` when healthy, `503` when the status is `red`.

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
    "yellow": 15,
    "red": 0
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

The table is pruned to keep only the most recent 10,000 entries during database initialization.

## Recent Check Window

The health status calculation uses health logs from the **last 5 minutes** to determine the current state:

- If more than 50% of recent checks are `red`, the aggregated status is `red`.
- If any checks are `red` or more than 30% are `yellow`, the aggregated status is `yellow`.
- Otherwise, the status is `green`.
- If there are no recent checks (no logs in the last 5 minutes), the status defaults to `red` with the message `"No recent health checks"`.

## Caching

This endpoint is not cached. Each request performs a live check against the Mojang API and queries the database for historical data to ensure the health report is always current.
