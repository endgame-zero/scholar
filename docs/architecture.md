# Architecture

## Overview

The system is split into two independent processes that communicate over HTTP:

```
Browser
  │
  │  1. GET  localhost:5173         (Vite dev server)
  │  2. POST localhost:5173/api/... (proxied → 8001)
  │
  ▼
Vite Dev Server  (:5173)
  │
  │  proxy /api/* → http://localhost:8001
  │
  ▼
FastAPI  (:8001)
  │
  ├── POST /api/research
  │     └── pipeline.py (async generator)
  │           ├── agents/manager.py  → tools/search.py
  │           │                      → tools/scraper.py
  │           ├── agents/judge.py
  │           └── agents/analyst.py
  │
  └── GET /api/health
```

---

## Backend

### Entry point — `main.py`

A minimal FastAPI application with two routes and CORS middleware:

- `GET /api/health` — liveness probe; returns `{"status": "ok"}`
- `POST /api/research` — accepts `{"query": str}`, returns a `StreamingResponse` with `Content-Type: text/event-stream`

The streaming response wraps the `research_pipeline` async generator. FastAPI drains the generator and writes each yielded string directly to the HTTP response body. Because the generator can take 30–120 seconds to complete, the headers `Cache-Control: no-cache` and `X-Accel-Buffering: no` are set to prevent proxies from buffering the stream.

### Pipeline — `pipeline.py`

`research_pipeline(query)` is an async generator that orchestrates the three agents and emits SSE-formatted strings at each meaningful step.

```
research_pipeline(query)
│
├── emit: status "Starting research"
│
├── run_manager(query, max_iterations=6)       ← async generator
│     yields: tool_call, tool_result, manager_done, evidence
│
├── emit: status "Evaluating quality"
│
├── run_judge(query, evidence)                 ← single async call
│     returns: {score, reasoning, sufficient}
│
├── emit: judgment event
│
├── [if not sufficient]:
│     run_manager(refined_query, max_iterations=3)
│     run_judge(query, all_evidence)
│     emit: judgment event
│
├── emit: status "Writing report"
│
├── run_analyst(query, evidence)               ← single async call
│     returns: markdown string
│
├── emit: report event
└── emit: done event
```

All emitted strings have the format `data: {json}\n\n` (standard SSE single-event format without a named event type — the event type is encoded inside the JSON).

### Configuration — `config.py`

`pydantic-settings` `BaseSettings` reads from `backend/.env`. The settings object is cached with `@lru_cache` so the file is parsed once per process.

| Field | Default | Purpose |
|---|---|---|
| `llm_base_url` | `https://router.huggingface.co/v1` | OpenAI-compatible chat endpoint |
| `llm_model` | `meta-llama/Llama-3.3-70B-Instruct` | Model identifier passed to the API |
| `llm_api_key` | _(required)_ | API key for the LLM provider |
| `tavily_api_key` | _(required)_ | Tavily search API key; placeholder triggers mock mode |

### LLM client — `agents/llm.py`

A cached `AsyncOpenAI` instance pointed at `llm_base_url` with `llm_api_key`. Because HuggingFace Router implements the OpenAI API spec, the same client works with any compatible provider by changing the env vars — no code change required.

### Tools

#### `tools/search.py` — `search_web(query, max_results)`

Calls the Tavily `/search` endpoint via `httpx.AsyncClient`. If `tavily_api_key` looks like a placeholder (starts with `your_`, is empty, etc.), or if the HTTP call fails for any reason, the function returns mock results from a built-in template corpus. Mock results are deterministic — the same query always produces the same five items — so the LLM's downstream behaviour is reproducible.

#### `tools/scraper.py` — `get_url_content(url)`

Fetches a URL with `httpx`, sets a `User-Agent` header to avoid trivial bot blocks, parses the HTML with `BeautifulSoup`, removes `<script>`, `<style>`, `<nav>`, `<footer>`, `<header>`, `<aside>`, and `<form>` tags, then extracts plain text. Output is capped at 5000 characters. On any error (timeout, 4xx, 5xx, parse failure) it returns a bracketed error string rather than raising, so the agent loop can continue.

---

## Frontend

### State machine — `hooks/useResearch.ts`

The hook manages a single `ResearchState` object:

```typescript
{
  phase: "idle" | "running" | "done" | "error",
  events: ResearchEvent[],
  report: string | null,
  sources: string[],
}
```

`runResearch(query)` opens a `fetch` against `POST /api/research` and reads the response body as a `ReadableStream<Uint8Array>`. Each chunk is decoded and appended to a string buffer. The buffer is split on `\n\n` to extract complete SSE events; any trailing partial event stays in the buffer until the next chunk arrives.

Each parsed event updates the state:
- `report` events set `state.report` and `state.sources`
- `done` events set `phase: "done"`
- All other events are appended to `state.events`

### Component tree

```
App
├── Header (static)
├── Sidebar
│   ├── ResearchForm      — textarea + submit button + example chips
│   ├── PhaseTracker      — derives current phase from event list
│   └── AgentLog          — renders each event as a styled row
└── Main
    ├── EmptyState         — shown when report === null
    └── Report             — ReactMarkdown + source cards
```

### PhaseTracker logic

`PhaseTracker` receives the full `events` array and derives a `{gather, judge, write}` phase object by scanning event types:

- `gather` is `"active"` while `tool_call`/`tool_result` events are arriving and `manager_done` has not yet appeared; `"done"` once `manager_done` is seen
- `judge` is `"active"` after `manager_done` until `report` appears; `"done"` once `report` is seen
- `write` is `"active"` when a status event mentioning "analyst" is received; `"done"` once `report` is seen

This derivation is purely from the event stream — no extra state is needed.

### Styling

The app uses **Tailwind CSS v3** with a near-black background (`#080810`). All colour usage:

| Colour | Semantic meaning |
|---|---|
| Blue (`blue-400/600`) | Primary actions, active phases, status events |
| Amber (`amber-300/400`) | Tool calls (agent is doing something) |
| Emerald (`emerald-400`) | Successful tool results, completed phases, final report |
| Purple (`purple-400`) | Judgment / evaluation events |
| Red (`red-400`) | Errors |
| Gray scale | Neutral text, borders, backgrounds |

Custom CSS in `index.css` adds prose styling for the Markdown report (`.prose` class), a `pulse-dot` keyframe animation for active phase indicators, and a `slide-in` keyframe for agent log rows.

---

## Data flow end-to-end

```
1. User types query → ResearchForm calls runResearch(query)

2. useResearch: fetch POST /api/research {query}
   → Vite proxy forwards to FastAPI :8001
   → FastAPI creates StreamingResponse(research_pipeline(query))

3. pipeline.py:
   a. Calls run_manager(query) — async generator
      i.  Manager calls LLM (HF router → Llama 3.3 70B)
          with tools: search_web, get_url_content
      ii. LLM returns tool_calls
      iii. pipeline executes tool, yields event, sends tool result back to LLM
      iv. Loop until LLM returns content (no tool_calls) or max_iterations
   b. Calls run_judge(query, evidence) — single LLM call
      LLM returns JSON {score, reasoning, sufficient}
   c. Optionally repeats manager pass if score < 0.7
   d. Calls run_analyst(query, evidence) — single LLM call
      LLM returns Markdown string

4. Each step in 3 yields "data: {json}\n\n" through StreamingResponse

5. useResearch: ReadableStream reader receives bytes
   → TextDecoder → buffer → split on \n\n → parse JSON
   → setState updates trigger re-renders

6. React renders:
   - AgentLog: one row per event, slides in with CSS animation
   - PhaseTracker: derived from events array
   - Report: ReactMarkdown renders the Markdown string
```

---

## Concurrency and performance

- All I/O (LLM calls, HTTP search/scrape) is `async`/`await` — the FastAPI event loop is never blocked
- Multiple concurrent users each get their own pipeline generator instance; they share the cached LLM client but each makes independent HTTP calls
- Tool calls within a single pipeline iteration are executed **sequentially** (the LLM calls one tool at a time in the current implementation); parallelising them would require a more complex tool dispatch layer
- Evidence is capped at 10 sources passed to the Judge and Analyst to keep prompt size manageable; all collected evidence is stored in memory for the duration of the request only

---

## Security considerations

- The `.env` file is git-ignored; API keys are never committed
- CORS is configured to allow only `http://localhost:5173` — in production this must be updated to the actual frontend origin
- URL scraping uses a fixed timeout (15 s) and a capped output length (5000 chars) to prevent oversized responses from exhausting memory
- No user data is persisted — every request is stateless
