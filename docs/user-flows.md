# User Flows

This document describes every end-to-end path a user can take through the Research Assistant.

---

## Flow 1 — Happy path: submitting a query and reading the report

**Precondition:** Both servers are running. User opens `http://localhost:5173`.

### Step 1 — Landing / idle state

The UI shows:
- Header bar with app name and model badge
- Left sidebar with an empty search textarea and four example-topic chips
- Right panel with an empty-state illustration and a one-sentence explanation of how the app works

No network requests have been made yet.

### Step 2 — Entering a query

The user types a research question, e.g. _"What are the latest breakthroughs in quantum computing?"_, or clicks one of the example chips which pre-fills the textarea.

Pressing **Enter** (without Shift) or clicking the **Research** button triggers the query.

### Step 3 — Research begins (streaming)

The frontend sends `POST /api/research` with `{ "query": "..." }` and immediately opens the response body as a readable byte stream.

The left sidebar transforms:
- The **Research pipeline** section appears, showing three steps (Manager, Judge, Analyst) all in idle state
- The **Agent log** section appears below it, initially empty
- The submit button changes to a spinner labelled "Working"

### Step 4 — Manager phase (tool-use loop)

SSE events arrive and render in real time:

| Event type | What the user sees |
|---|---|
| `status` | Grey diamond + status text (e.g. "Manager agent gathering evidence…") |
| `tool_call` — `search_web` | Amber arrow + `search_web query="..."` |
| `tool_result` — `search_web` | Green tick + "Retrieved N results" |
| `tool_call` — `get_url_content` | Amber arrow + `get_url_content url="..."` |
| `tool_result` — `get_url_content` | Green tick + "Scraped hostname.com" |

The **Manager** step in the pipeline tracker pulses blue.

The manager repeats this loop — searching, scraping, searching again — until it decides it has enough evidence (or hits the 6-iteration cap).

### Step 5 — Judge phase

After the manager emits `manager_done`, the pipeline tracker marks Manager as done (green ✓) and Judge pulses blue.

The log shows:
- A status line: "Evaluating quality…"
- A judgment entry with a coloured percentage and a mini 10-segment bar chart
  - ≥ 70% → green, sufficient
  - 40–69% → amber, borderline
  - < 40% → red, insufficient

If the score is below the threshold, the pipeline re-enters the Manager phase for a second, narrower search pass (the status line says "Evidence quality insufficient — conducting deeper research…"). After that, the Judge runs again and shows a second judgment entry.

### Step 6 — Analyst phase

The pipeline tracker marks Judge as done and Analyst pulses blue. The status line reads "Analyst agent writing research report…"

### Step 7 — Report appears

The right panel transitions from the empty state to the rendered report:
- A **Copy** button in the top-right corner copies the full Markdown to the clipboard
- The report body is rendered Markdown with styled headings, bullet lists, inline links, and code blocks
- Below the report, a **Sources** grid shows cards for each URL used — each card displays the hostname and full URL and opens in a new tab

The pipeline tracker shows all three steps green. The spinner disappears.

### Step 8 — Starting a new query

The header shows a "↩ New research" button. Clicking it resets all state (events, report, sources) and returns to the idle state.

---

## Flow 2 — No Tavily key (mock data)

**Precondition:** `TAVILY_API_KEY` in `.env` is a placeholder (starts with `your_`) or is absent.

The flow is identical to Flow 1 except:

- `search_web` returns five deterministic mock results generated from a template corpus based on the query text
- The mock sources all point to `example.com` / well-known domain patterns — the user will see these as unclickable or 404 in the Sources panel
- If `get_url_content` is called on these mock URLs, BeautifulSoup will get a 404 or connection error and return a bracketed error string; the manager treats this gracefully and continues with the search snippets
- The Analyst still produces a coherent report because the mock snippets contain enough structured text

This mode is suitable for local development and demonstrations without a paid search API.

---

## Flow 3 — Network or API error mid-stream

**Scenario:** The HuggingFace API returns an error or the connection drops partway through a research run.

**What happens:**

1. The `research_pipeline` generator raises an exception
2. FastAPI closes the SSE stream
3. The frontend's `fetch` reader receives `done: true` (stream closed)
4. The `useResearch` hook catches the resulting error and sets `phase: "error"`
5. The left sidebar shows a red error panel: _"Research failed. Check backend logs and API keys."_
6. The right panel remains in whatever state it was — if a partial report was received before the error it remains visible; if not, the empty state is shown

The user can click "↩ New research" to reset and try again.

---

## Flow 4 — Low evidence quality (second research pass)

**Scenario:** The Judge scores the first evidence batch below 0.7.

**What the user sees:**

1. After the first `manager_done`, a judgment entry appears with a red or amber score
2. The status line reads: "Evidence quality insufficient — conducting deeper research…"
3. The Manager phase re-activates (the pipeline tracker does not visually regress — the Manager step stays green; the log makes the second pass visible via new `tool_call` entries)
4. A second judgment entry appears — typically higher, since the second search pass is more targeted
5. The Analyst then runs regardless of the second score (to avoid infinite loops)

---

## Flow 5 — Keyboard-only navigation

| Action | Shortcut |
|---|---|
| Submit query | Enter (in textarea) |
| Add a newline in query | Shift + Enter |
| Fill example query | Click chip (mouse only currently) |
| Copy report | Click "Copy" button |

The form and all interactive elements are reachable via Tab. Focus styles follow the browser default.

---

## Flow 6 — Long or complex queries

The textarea accepts multi-line input (Shift+Enter). The full query string is sent as-is to the Manager agent's system prompt. Longer, more specific queries tend to produce more targeted search terms and richer reports. There is no enforced character limit on the frontend; the backend will truncate evidence passed to the Analyst if it exceeds the model's context window, prioritising the first 10 sources.
