# search

Web search via MiniMax's coding-plan endpoint. Calls `POST /v1/coding_plan/search` — the same tool that `minimax-coding-plan-mcp` exposes over MCP.

**Prerequisites**: read the shared basics in [`../SKILL.md`](../SKILL.md) for config, region, token, and debug rules.

## Command

```bash
minimax search <query> [--debug]
```

| Flag        | Required | Description |
| ----------- | -------- | ----------- |
| `<query>`   | yes      | Search query; 3–5 keywords work best |
| `--debug`   | no       | Print the HTTP request/response to stderr (token masked) |

## Query guidance

- Aim for 3–5 keywords.
- For time-sensitive topics, include a year (e.g. `latest typescript 5.6 features 2025`).
- If a query returns nothing useful, rephrase with different keywords rather than retrying verbatim.

## Response shape

The raw JSON response is printed to stdout with `JSON.stringify(..., null, 2)`. The server returns:

```jsonc
{
  "organic": [
    { "title": "...", "link": "...", "snippet": "...", "date": "..." }
  ],
  "related_searches": [
    { "query": "..." }
  ],
  "base_resp": {
    "status_code": 0,
    "status_msg": "success"
  }
}
```

## Agent workflow

1. Verify config (region, token) per the shared basics.
2. Tighten the query to 3–5 keywords before calling.
3. Parse the printed JSON and present the top `organic` results to the user; also surface `related_searches` when the first query didn't produce what they wanted.

## Agent rules

- **Do not** add flags that are not listed above. The server only accepts `{ "q": query }` — there is no `limit`, `size`, `page`, or filter parameter.
- **Do not** call `search` for questions you already know the answer to from context — this is a real API with a real cost.
- If the user gives a full English sentence as the query, silently condense it to 3–5 keywords before calling.

## Examples

```bash
# Simple lookup
minimax search "ffmpeg concat filter syntax"

# Time-sensitive topic, year included
minimax search "latest react 19 features 2025"

# Inspect the wire exchange when something looks off
minimax search "some query" --debug
```
