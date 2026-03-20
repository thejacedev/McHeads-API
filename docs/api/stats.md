---
title: Usage Statistics
order: 9
---

# Usage Statistics

Three endpoints provide API usage statistics, tracking how many render requests have been served for Java and Bedrock edition players. Statistics are stored in the database and incremented on every render request.

## Endpoints

```
GET /allstats
GET /allstatsbedrock
GET /allstatsSorted
```

## How Statistics Are Tracked

Every time a render endpoint (`/head`, `/player`, `/avatar`, `/skin`, `/ioshead`, `/iosbody`, `/download`) processes a request, it calls `recordStats(endpoint, input, edition)`. This increments a counter in the `stats` table for the corresponding edition (`java` or `bedrock`).

Edition detection is based on the input format:
- Inputs starting with `0000` or `.` are classified as **Bedrock**
- All other inputs are classified as **Java**

The stats table has two rows, one for each edition, each with a cumulative count.

---

## GET /allstats -- Java Edition Counts

Returns the total number of requests served for Java edition players.

### Response Shape

```json
{
  "head": 12345
}
```

| Field | Type | Description |
|-------|------|-------------|
| `head` | integer | Total number of Java edition requests across all render endpoints |

> **Note**: The field is named `head` for historical reasons, but it represents the total count across all endpoints (head, player, avatar, skin, etc.), not just head renders.

### Example

```bash
curl https://your-domain.com/allstats
```

```
GET /allstats
```

Response:

```json
{
  "head": 48721
}
```

### Pretty-print

```bash
curl -s https://your-domain.com/allstats | jq .
```

---

## GET /allstatsbedrock -- Bedrock Edition Counts

Returns the total number of requests served for Bedrock edition players.

### Response Shape

```json
{
  "head": 5678
}
```

| Field | Type | Description |
|-------|------|-------------|
| `head` | integer | Total number of Bedrock edition requests across all render endpoints |

### Example

```bash
curl https://your-domain.com/allstatsbedrock
```

```
GET /allstatsbedrock
```

Response:

```json
{
  "head": 3291
}
```

---

## GET /allstatsSorted -- All Stats Sorted by Usage

Returns all statistics across both editions, sorted by count in descending order. This gives a complete view of API usage ranked from most to least active edition.

### Response Shape

```json
[
  {
    "endpoint": "head",
    "edition": "java",
    "count": 48721
  },
  {
    "endpoint": "head",
    "edition": "bedrock",
    "count": 3291
  }
]
```

The response is a JSON array of objects, sorted by `count` descending.

| Field | Type | Description |
|-------|------|-------------|
| `endpoint` | string | Always `"head"` (legacy field name representing all endpoints) |
| `edition` | string | Either `"java"` or `"bedrock"` |
| `count` | integer | Total number of requests for this edition |

### Example

```bash
curl https://your-domain.com/allstatsSorted
```

```
GET /allstatsSorted
```

Response:

```json
[
  {
    "endpoint": "head",
    "edition": "java",
    "count": 48721
  },
  {
    "endpoint": "head",
    "edition": "bedrock",
    "count": 3291
  }
]
```

### Get just the edition names sorted by popularity

```bash
curl -s https://your-domain.com/allstatsSorted | jq '.[].edition'
```

Returns:

```
"java"
"bedrock"
```

### Get total requests across both editions

```bash
curl -s https://your-domain.com/allstatsSorted | jq '[.[].count] | add'
```

Returns:

```
52012
```

---

## Examples

### Monitor stats over time

```bash
# Check current stats
curl -s https://your-domain.com/allstatsSorted | jq .

# Compare Java vs Bedrock
curl -s https://your-domain.com/allstatsSorted | jq '.[] | "\(.edition): \(.count)"'
```

Output:

```
"java: 48721"
"bedrock: 3291"
```

### Calculate Bedrock percentage

```bash
curl -s https://your-domain.com/allstatsSorted | jq '
  (.[1].count / ([.[].count] | add) * 100 | round) as $pct |
  "Bedrock: \($pct)% of total traffic"
'
```

### Health dashboard integration

```bash
# Simple monitoring script
JAVA=$(curl -s https://your-domain.com/allstats | jq '.head')
BEDROCK=$(curl -s https://your-domain.com/allstatsbedrock | jq '.head')
echo "Java: $JAVA | Bedrock: $BEDROCK | Total: $((JAVA + BEDROCK))"
```

### JavaScript example

```javascript
async function getStats() {
    const response = await fetch('https://your-domain.com/allstatsSorted');
    const stats = await response.json();

    const total = stats.reduce((sum, s) => sum + s.count, 0);

    console.log(`Total requests: ${total}`);
    stats.forEach(s => {
        const pct = ((s.count / total) * 100).toFixed(1);
        console.log(`  ${s.edition}: ${s.count} (${pct}%)`);
    });
}
```

## Error Responses

All three endpoints return the same error format on failure:

### /allstats

```
HTTP/1.1 500 Internal Server Error
Content-Type: application/json

{
  "error": "Failed to get stats"
}
```

### /allstatsbedrock

```
HTTP/1.1 500 Internal Server Error
Content-Type: application/json

{
  "error": "Failed to get bedrock stats"
}
```

### /allstatsSorted

```
HTTP/1.1 500 Internal Server Error
Content-Type: application/json

{
  "error": "Failed to get sorted stats"
}
```

These errors typically indicate a database connection issue.

## Database Schema

The stats are stored in a simple two-row table:

```sql
CREATE TABLE stats (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    edition TEXT UNIQUE NOT NULL,
    count INTEGER NOT NULL DEFAULT 0
);
```

Initial data:

| edition | count |
|---------|-------|
| java | 0 |
| bedrock | 0 |

On PostgreSQL, the table is named `mcheads_stats` with `SERIAL` instead of `AUTOINCREMENT`.

## Caching

Stats endpoints are not cached. Each request queries the database directly to return the most current counts.
