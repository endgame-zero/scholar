import json
import re
from agents.llm import get_llm_client
from config import get_settings

SYSTEM_PROMPT = """You are a research quality evaluator. Assess whether the gathered evidence is sufficient to answer the research question comprehensively.

Return ONLY a valid JSON object (no markdown, no explanation) with these exact fields:
{
  "score": <float 0.0–1.0>,
  "reasoning": "<one sentence explanation>",
  "sufficient": <true if score >= 0.7, otherwise false>
}"""


async def run_judge(query: str, evidence: list[dict]) -> dict:
    client = get_llm_client()
    settings = get_settings()

    evidence_summary = "\n\n".join(
        f"Source: {e.get('url', 'N/A')}\nTitle: {e.get('title', 'N/A')}\nSnippet: {e.get('content', '')[:400]}"
        for e in evidence[:10]
    )

    messages = [
        {"role": "system", "content": SYSTEM_PROMPT},
        {
            "role": "user",
            "content": f"Research question: {query}\n\nEvidence collected ({len(evidence)} items):\n{evidence_summary}",
        },
    ]

    response = await client.chat.completions.create(
        model=settings.llm_model,
        messages=messages,
        temperature=0.1,
    )

    raw = response.choices[0].message.content or "{}"

    # Handle markdown code blocks
    code_match = re.search(r"```(?:json)?\s*([\s\S]*?)\s*```", raw)
    text = code_match.group(1) if code_match else raw

    # Extract first JSON object
    brace_match = re.search(r"\{[\s\S]*\}", text)
    text = brace_match.group(0) if brace_match else "{}"

    try:
        result = json.loads(text)
    except json.JSONDecodeError:
        result = {}

    score = float(result.get("score", 0.5))
    return {
        "score": round(score, 2),
        "reasoning": result.get("reasoning", "Unable to evaluate."),
        "sufficient": result.get("sufficient", score >= 0.7),
    }
