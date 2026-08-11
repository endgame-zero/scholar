# Agents

This document describes each of the three agents in detail: their system prompt, decision logic, tool definitions, and output contract.

---

## Manager Agent

**File:** `backend/agents/manager.py`
**Role:** Autonomous evidence gatherer. Runs a tool-use loop until it has enough material to answer the research question.

### System prompt

```
You are a research manager agent. Your job is to gather comprehensive,
high-quality evidence about a research topic by using the available tools.

Strategy:
1. Start with a broad web search to get an overview
2. Identify the most relevant URLs and fetch their full content
3. Do targeted follow-up searches to fill gaps
4. Once you have 3–5 solid sources with substantive content, stop and
   summarize what you found

Be efficient: don't search the same thing twice. When you have enough
evidence, stop calling tools and write a brief summary of what you gathered.
```

### Tools available

#### `search_web`

```json
{
  "name": "search_web",
  "description": "Search the web and return a list of relevant results (title, URL, snippet).",
  "parameters": {
    "query": { "type": "string" },
    "max_results": { "type": "integer", "default": 5 }
  }
}
```

Each result returned has shape: `{ title, url, content (snippet), score }`.

#### `get_url_content`

```json
{
  "name": "get_url_content",
  "description": "Fetch and extract the full text content from a specific URL.",
  "parameters": {
    "url": { "type": "string" }
  }
}
```

Returns up to 5000 characters of cleaned plain text from the page.

### Agentic loop

```python
while iteration < max_iterations (6):
    response = LLM(messages, tools, tool_choice="auto")

    if response has tool_calls:
        for each tool_call:
            yield tool_call event
            execute tool
            yield tool_result event
            append tool result to messages
    else:
        yield manager_done event
        break

yield evidence event (all collected data)
```

`tool_choice="auto"` lets the model decide when to stop calling tools. The `max_iterations` cap is a safety net — without it, a confused model could loop indefinitely.

### Evidence structure

Each item in the evidence list has one of two shapes:

**Search result** (from `search_web`):
```json
{ "title": "...", "url": "...", "content": "...", "score": 0.87 }
```

**Scraped page** (from `get_url_content`):
```json
{ "url": "...", "content": "...", "title": "..." }
```

Both shapes are accepted by the Judge and Analyst — they read `url` and `content` regardless of origin.

### Known limitations

- The model may call the same URL twice if it forgets earlier tool results; this is wasteful but harmless
- Tool argument coercion is applied at the call site: `max_results` is cast to `int` before use, because some model versions emit it as a string
- The manager cannot follow pagination or login-gated pages

---

## Judge Agent

**File:** `backend/agents/judge.py`
**Role:** Single-call evaluator. Receives the research question and collected evidence, returns a quality score.

### System prompt

```
You are a research quality evaluator. Assess whether the gathered evidence
is sufficient to answer the research question comprehensively.

Return ONLY a valid JSON object (no markdown, no explanation) with these
exact fields:
{
  "score": <float 0.0–1.0>,
  "reasoning": "<one sentence explanation>",
  "sufficient": <true if score >= 0.7, otherwise false>
}
```

### Input to the model

The user message contains:
- The original research question
- Up to 10 evidence items, each formatted as:
  ```
  Source: <url>
  Title: <title>
  Snippet: <first 400 chars of content>
  ```

Truncation to 400 chars per snippet keeps the prompt within a safe token budget while preserving enough signal for the Judge to score coverage, relevance, and depth.

### Output parsing

The model sometimes wraps the JSON in a markdown code block (` ```json ... ``` `). The parser handles both cases:

1. Look for a code block with `re.search(r'```(?:json)?\s*([\s\S]*?)\s*```', raw)`
2. If not found, extract the first `{...}` block
3. Parse with `json.loads`; on failure, return a default score of `0.5` (borderline)

### Decision threshold

| Score | `sufficient` | Pipeline action |
|---|---|---|
| ≥ 0.7 | `true` | Proceed directly to Analyst |
| < 0.7 | `false` | Trigger a second Manager pass, then re-evaluate |

The second pass is capped at 3 iterations (vs. 6 for the first pass) and uses a slightly rephrased query (appending "detailed examples case studies") to encourage different search terms.

### Why a separate Judge?

Folding quality evaluation into the Manager's own loop risks confirmation bias — the Manager might declare itself done prematurely. A separate model call with a dedicated evaluator prompt provides an independent check and makes the threshold explicit and tunable.

---

## Analyst Agent

**File:** `backend/agents/analyst.py`
**Role:** Single-call synthesiser. Receives all collected evidence and writes the final Markdown report.

### System prompt

```
You are a research analyst. Synthesize the provided evidence into a
comprehensive, well-structured research report in Markdown.

Report structure:
# [Title]

## Executive Summary
2–3 sentence overview of the key findings.

## Key Findings
Detailed sections with H3 headers, bullet points, and inline citations
like [Source](url).

## Analysis
Deeper interpretation of the findings, patterns, implications.

## Sources
A numbered list of all URLs referenced.

Write clearly and professionally. Cite sources inline where relevant.
```

### Input to the model

- The original research question
- Up to 10 evidence items, each formatted with a `---` separator, `**Source:**`, `**Title:**`, and up to 800 chars of content
- A flat list of all collected source URLs

Capping at 800 chars per source (vs. 400 for the Judge) gives the Analyst more material to synthesise from without overwhelming the prompt.

### Output

Raw Markdown string. No post-processing is applied — the string is yielded directly in the `report` SSE event and rendered by `react-markdown` on the frontend.

The Analyst is instructed to include a `## Sources` section with numbered links, but the frontend also independently renders a source card grid from the `sources` array in the SSE event. Both can coexist.

### Token budget

`max_tokens=3000` is set to prevent extremely long responses from timing out or triggering provider limits. A typical report is 600–1500 tokens.

---

## Adding a new agent

1. Create `backend/agents/my_agent.py` following the same pattern as `judge.py` (single async function that calls `get_llm_client()` and returns a typed result) or `manager.py` (async generator that yields event dicts)
2. Import and call it from `pipeline.py` at the appropriate step
3. Add a new event type to `frontend/src/types.ts`
4. Add a rendering case in `AgentLog.tsx`

The pipeline is a linear async generator — inserting a new step is straightforward because there is no shared mutable state between agents; they communicate only through the `evidence` list passed between them.
