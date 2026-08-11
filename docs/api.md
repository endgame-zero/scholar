# API Reference

The backend exposes two HTTP endpoints. Both are served by FastAPI on port 8001 (configurable via the `--port` flag to `uvicorn`).

---

## `GET /api/health`

Liveness probe. Returns immediately without touching the LLM or search APIs.

**Response**

```json
HTTP/1.1 200 OK
Content-Type: application/json

{ "status": "ok" }
```

---

## `POST /api/research`

Starts a research run and streams results back as Server-Sent Events.

**Request**

```
POST /api/research
Content-Type: application/json

{ "query": "What are the latest breakthroughs in quantum computing?" }
```

| Field | Type | Required | Description |
|---|---|---|---|
| `query` | string | yes | The research question or topic |

**Response**

```
HTTP/1.1 200 OK
Content-Type: text/event-stream
Cache-Control: no-cache
X-Accel-Buffering: no
Connection: keep-alive
```

The body is a stream of SSE events. Each event is a single line of the form:

```
data: {json}\n\n
```

The connection closes when the `done` event is emitted or an unhandled exception terminates the generator.

---

## SSE event types

All events share the field `"type"` which identifies the event kind. Additional fields vary per type.

---

### `status`

Emitted at the start of each pipeline phase to describe what is happening.

```json
{ "type": "status", "message": "Manager agent gathering evidence..." }
```

| Field | Type | Description |
|---|---|---|
| `message` | string | Human-readable status description |

---

### `tool_call`

Emitted immediately before a tool is invoked by the Manager.

```json
{
  "type": "tool_call",
  "name": "search_web",
  "args": { "query": "quantum computing breakthroughs 2024", "max_results": 10 }
}
```

```json
{
  "type": "tool_call",
  "name": "get_url_content",
  "args": { "url": "https://arxiv.org/abs/2401.00001" }
}
```

| Field | Type | Description |
|---|---|---|
| `name` | string | Tool name: `search_web` or `get_url_content` |
| `args` | object | Arguments passed to the tool |

---

### `tool_result`

Emitted after a tool call completes successfully.

```json
{ "type": "tool_result", "name": "search_web", "count": 5 }
```

```json
{ "type": "tool_result", "name": "get_url_content", "url": "https://arxiv.org/abs/2401.00001" }
```

| Field | Type | Present when | Description |
|---|---|---|---|
| `name` | string | always | Tool name |
| `count` | integer | `search_web` | Number of results returned |
| `url` | string | `get_url_content` | URL that was scraped |

---

### `tool_error`

Emitted when a tool call raises an exception. The pipeline continues; the error is logged but not fatal.

```json
{
  "type": "tool_error",
  "name": "get_url_content",
  "error": "Error fetching https://paywalled-site.com: 403 Client Error"
}
```

| Field | Type | Description |
|---|---|---|
| `name` | string | Tool that failed |
| `error` | string | Exception message |

---

### `manager_done`

Emitted when the Manager stops calling tools and writes its summary.

```json
{
  "type": "manager_done",
  "summary": "I found 7 sources covering the topic from multiple angles including..."
}
```

| Field | Type | Description |
|---|---|---|
| `summary` | string | The Manager's own summary of what it found |

---

### `judgment`

Emitted after each Judge evaluation.

```json
{
  "type": "judgment",
  "score": 0.84,
  "reasoning": "The evidence covers recent breakthroughs, key players, and technical depth across 6 sources.",
  "sufficient": true
}
```

| Field | Type | Description |
|---|---|---|
| `score` | float | Quality score between 0.0 and 1.0 |
| `reasoning` | string | One-sentence explanation of the score |
| `sufficient` | boolean | `true` if score ≥ 0.7; controls whether a second research pass runs |

---

### `report`

Emitted once, after the Analyst finishes writing.

```json
{
  "type": "report",
  "content": "# Quantum Computing Breakthroughs\n\n## Executive Summary\n...",
  "sources": [
    "https://arxiv.org/abs/2401.00001",
    "https://nature.com/articles/..."
  ]
}
```

| Field | Type | Description |
|---|---|---|
| `content` | string | Full Markdown report |
| `sources` | string[] | Deduplicated list of all URLs collected during the run (up to 15) |

---

### `done`

Emitted last. Signals that the stream is complete and the connection will close.

```json
{ "type": "done" }
```

---

## Complete event sequence

A typical successful run emits events in this order:

```
status         "Starting research: ..."
status         "Manager agent gathering evidence..."
tool_call      search_web
tool_result    search_web
tool_call      get_url_content
tool_result    get_url_content
tool_call      search_web          ← optional second search
tool_result    search_web
manager_done   "I found N sources..."
status         "Collected N evidence items. Evaluating quality..."
judgment       { score: 0.84, sufficient: true }
status         "Analyst agent writing research report..."
report         { content: "# ...", sources: [...] }
done
```

If the Judge score is low, the sequence includes a second Manager block between the first `judgment` and the Analyst:

```
...
judgment       { score: 0.45, sufficient: false }
status         "Evidence quality insufficient — conducting deeper research..."
tool_call      search_web
tool_result    search_web
manager_done   ...
judgment       { score: 0.78, sufficient: true }
status         "Analyst agent writing research report..."
report         ...
done
```

---

## Consuming the stream from the browser

The standard `EventSource` API only supports GET requests. Because this endpoint uses POST, the frontend uses `fetch` with a `ReadableStream` reader instead:

```typescript
const response = await fetch("/api/research", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ query }),
});

const reader = response.body!.getReader();
const decoder = new TextDecoder();
let buffer = "";

while (true) {
  const { done, value } = await reader.read();
  if (done) break;

  buffer += decoder.decode(value, { stream: true });
  const parts = buffer.split("\n\n");
  buffer = parts.pop() ?? "";

  for (const part of parts) {
    for (const line of part.split("\n")) {
      if (line.startsWith("data: ")) {
        const event = JSON.parse(line.slice(6));
        // handle event...
      }
    }
  }
}
```

The key detail is splitting on `\n\n` (double newline) to separate events, keeping any trailing incomplete event in the buffer for the next chunk.

---

## Error responses

If the request body is malformed, FastAPI returns a standard validation error before the stream opens:

```
HTTP/1.1 422 Unprocessable Entity
Content-Type: application/json

{
  "detail": [
    { "loc": ["body", "query"], "msg": "field required", "type": "value_error.missing" }
  ]
}
```

Runtime errors inside the generator (e.g., LLM API failure) do not produce a non-200 status code — the stream is already open by the time they occur. The generator catches them where possible and emits `tool_error` events; unhandled exceptions close the stream, which the frontend detects and maps to the error state.
