import json
from typing import AsyncGenerator
from agents.manager import run_manager
from agents.judge import run_judge
from agents.analyst import run_analyst


def _sse(event: dict) -> str:
    return f"data: {json.dumps(event)}\n\n"


async def research_pipeline(query: str) -> AsyncGenerator[str, None]:
    yield _sse({"type": "status", "message": f'Starting research: "{query}"'})

    # Phase 1: Manager gathers initial evidence
    yield _sse({"type": "status", "message": "Manager agent gathering evidence..."})
    evidence: list[dict] = []

    async for event in run_manager(query, max_iterations=6):
        if event["type"] == "evidence":
            evidence = event["data"]
        else:
            yield _sse(event)

    yield _sse({"type": "status", "message": f"Collected {len(evidence)} evidence items. Evaluating quality..."})

    # Phase 2: Judge evaluates quality
    judgment = await run_judge(query, evidence)
    yield _sse({"type": "judgment", **judgment})

    # Phase 3: If insufficient, do a deeper pass
    if not judgment.get("sufficient", True) and len(evidence) < 25:
        yield _sse({"type": "status", "message": "Evidence quality insufficient — conducting deeper research..."})

        async for event in run_manager(f"{query} detailed examples case studies", max_iterations=3):
            if event["type"] == "evidence":
                evidence.extend(event["data"])
            else:
                yield _sse(event)

        judgment = await run_judge(query, evidence)
        yield _sse({"type": "judgment", **judgment})

    # Phase 4: Analyst writes the report
    yield _sse({"type": "status", "message": "Analyst agent writing research report..."})

    try:
        report = await run_analyst(query, evidence)
    except Exception as e:
        report = f"Error generating report: {e}"

    sources = list(dict.fromkeys(e.get("url", "") for e in evidence if e.get("url")))

    yield _sse({"type": "report", "content": report, "sources": sources[:15]})
    yield _sse({"type": "done"})
