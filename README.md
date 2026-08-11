# Research Assistant

A multi-agent AI research assistant that takes a plain-language question, autonomously searches the web, evaluates evidence quality, and produces a structured Markdown report — all streamed live to the browser.

```
┌─────────────────────┐     SSE stream      ┌─────────────────────────┐
│   React Frontend    │ ◄─────────────────── │   FastAPI Backend       │
│   (Vite + Tailwind) │ ──POST /api/research─► │   + 3 AI Agents        │
└─────────────────────┘                      └─────────────────────────┘
                                                       │
                                            ┌──────────┴──────────┐
                                            │   Llama 3.3 70B     │
                                            │ (HuggingFace Router)│
                                            └──────────┬──────────┘
                                                       │
                                             ┌─────────┴────────┐
                                             │   Tavily Search   │
                                             └──────────────────┘
```

## How it works

Three agents run in sequence:

1. **Manager** — runs an agentic tool-use loop: searches the web and scrapes URLs until it has enough evidence
2. **Judge** — scores the evidence quality (0–1) and decides whether a second research pass is needed
3. **Analyst** — synthesises all evidence into a structured Markdown report

All agent activity streams to the UI in real time via Server-Sent Events.

---

## Prerequisites

| Requirement | Version |
|---|---|
| Python | 3.11+ |
| Node.js | 18+ |
| HuggingFace account | Free — for the Llama 3.3 70B API |
| Tavily account | Free tier — for web search (optional, mock data used if absent) |

---

## Setup

### 1. Clone / enter the project

```bash
cd researcher
```

### 2. Backend

```bash
cd backend

# Create virtual environment
python3 -m venv .venv
source .venv/bin/activate      # Windows: .venv\Scripts\activate

# Install dependencies
pip install -r requirements.txt
```

Create `backend/.env` from the example:

```bash
cp ../.env.example .env
```

Edit `.env` and fill in your keys:

```env
LLM_BASE_URL=https://router.huggingface.co/v1
LLM_MODEL=meta-llama/Llama-3.3-70B-Instruct
LLM_API_KEY=hf_your_key_here          # huggingface.co → Settings → Access Tokens
TAVILY_API_KEY=tvly-your_key_here     # app.tavily.com  (leave placeholder for mock data)
```

> **No Tavily key?** Leave `TAVILY_API_KEY` as-is. The app falls back to realistic mock search results automatically.

### 3. Frontend

```bash
cd frontend
npm install
```

---

## Running

Open **two terminals** from the project root.

**Terminal 1 — backend:**
```bash
cd backend
source .venv/bin/activate
uvicorn main:app --reload --port 8001
```

**Terminal 2 — frontend:**
```bash
cd frontend
npm run dev
```

Open **http://localhost:5173** (or whichever port Vite prints — it increments if 5173 is taken).

---

## Project structure

```
researcher/
├── backend/
│   ├── main.py            # FastAPI app — defines /api/research SSE endpoint
│   ├── pipeline.py        # Orchestrates the 3-agent flow, yields SSE events
│   ├── config.py          # Env-var settings (pydantic-settings)
│   ├── agents/
│   │   ├── llm.py         # Shared AsyncOpenAI client (HF router)
│   │   ├── manager.py     # Manager agent — tool-use agentic loop
│   │   ├── judge.py       # Judge agent — evidence quality scorer
│   │   └── analyst.py     # Analyst agent — Markdown report writer
│   ├── tools/
│   │   ├── search.py      # Tavily web search (with mock fallback)
│   │   └── scraper.py     # URL content extraction (httpx + BeautifulSoup)
│   ├── .env               # Your secrets (git-ignored)
│   └── requirements.txt
├── frontend/
│   ├── src/
│   │   ├── App.tsx                    # Root layout — two-column shell
│   │   ├── hooks/useResearch.ts       # SSE consumer, state machine
│   │   ├── types.ts                   # Shared TypeScript types
│   │   └── components/
│   │       ├── ResearchForm.tsx       # Query input
│   │       ├── PhaseTracker.tsx       # Pipeline step indicator
│   │       ├── AgentLog.tsx           # Live event feed
│   │       └── Report.tsx             # Markdown report + source cards
│   ├── vite.config.ts     # Proxies /api → localhost:8001
│   └── package.json
├── docs/                  # Extended documentation
├── .env.example
├── .gitignore
└── README.md
```

---

## Swapping the LLM

The backend uses any OpenAI-compatible endpoint. Change `LLM_BASE_URL` and `LLM_MODEL` in `.env` to point at Ollama, Together AI, OpenAI, or any other provider:

```env
# OpenAI
LLM_BASE_URL=https://api.openai.com/v1
LLM_MODEL=gpt-4o
LLM_API_KEY=sk-...

# Ollama (local)
LLM_BASE_URL=http://localhost:11434/v1
LLM_MODEL=llama3.3
LLM_API_KEY=ollama
```

---

## Docs

See the [`docs/`](docs/) folder for detailed documentation:

- [`docs/user-flows.md`](docs/user-flows.md) — end-to-end user journeys with screenshots descriptions
- [`docs/architecture.md`](docs/architecture.md) — system design, data flow, and component responsibilities
- [`docs/agents.md`](docs/agents.md) — each agent's prompt, tool definitions, and decision logic
- [`docs/api.md`](docs/api.md) — REST + SSE API reference
