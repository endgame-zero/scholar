from agents.llm import get_llm_client
from config import get_settings

SYSTEM_PROMPT = """You are a research analyst. Synthesize the provided evidence into a comprehensive, well-structured research report in Markdown.

Report structure:
# [Title]

## Executive Summary
2–3 sentence overview of the key findings.

## Key Findings
Detailed sections with H3 headers, bullet points, and inline citations like [Source](url).

## Analysis
Deeper interpretation of the findings, patterns, implications.

## Sources
A numbered list of all URLs referenced.

Write clearly and professionally. Cite sources inline where relevant."""


async def run_analyst(query: str, evidence: list[dict]) -> str:
    client = get_llm_client()
    settings = get_settings()

    evidence_text = "\n\n---\n\n".join(
        f"**Source:** {e.get('url', 'Unknown')}\n**Title:** {e.get('title', 'N/A')}\n\n{e.get('content', '')[:800]}"
        for e in evidence[:10]
    )

    sources = list(dict.fromkeys(e.get("url", "") for e in evidence if e.get("url")))

    messages = [
        {"role": "system", "content": SYSTEM_PROMPT},
        {
            "role": "user",
            "content": (
                f"Research question: {query}\n\n"
                f"Evidence ({len(evidence)} sources):\n\n{evidence_text}\n\n"
                f"Available source URLs:\n" + "\n".join(f"- {s}" for s in sources)
            ),
        },
    ]

    response = await client.chat.completions.create(
        model=settings.llm_model,
        messages=messages,
        temperature=0.3,
        max_tokens=3000,
    )

    return response.choices[0].message.content or "Could not generate report."
