import hashlib
import httpx
from config import get_settings

_MOCK_CORPUS = [
    {
        "title": "Overview of {query} – Wikipedia",
        "url": "https://en.wikipedia.org/wiki/{slug}",
        "content": (
            "{query} is a broad and rapidly evolving field. "
            "Researchers have made significant progress in recent years, with applications ranging from "
            "medicine and engineering to economics and social sciences. Key developments include improved "
            "methodologies, better data availability, and cross-disciplinary collaboration. "
            "The field continues to attract substantial investment from both public and private sectors."
        ),
        "score": 0.92,
    },
    {
        "title": "Recent Advances in {query} | Nature",
        "url": "https://www.nature.com/articles/{slug}-advances",
        "content": (
            "A comprehensive review of {query} published in 2024 highlights three major breakthroughs: "
            "(1) scalable approaches that reduce computational cost by 40%, "
            "(2) novel datasets enabling more robust benchmarking, and "
            "(3) interdisciplinary methods borrowed from adjacent fields. "
            "Experts predict continued acceleration over the next five years."
        ),
        "score": 0.88,
    },
    {
        "title": "{query}: Practical Applications and Case Studies",
        "url": "https://arxiv.org/abs/{slug}-2024",
        "content": (
            "This paper surveys real-world deployments of {query} across 12 industries. "
            "Healthcare saw a 23% improvement in diagnostic accuracy; manufacturing reduced defect rates "
            "by 18%; and financial services reported a 31% reduction in fraud incidents. "
            "Challenges remain around interpretability, data privacy, and regulatory compliance."
        ),
        "score": 0.85,
    },
    {
        "title": "Challenges and Future Directions in {query}",
        "url": "https://spectrum.ieee.org/{slug}-challenges",
        "content": (
            "Despite impressive progress, {query} faces several open problems. "
            "Scalability under limited resources, generalization to out-of-distribution data, "
            "and ethical considerations around bias and fairness are frequently cited. "
            "The research community is responding with new benchmarks, audit frameworks, and open-source toolkits."
        ),
        "score": 0.81,
    },
    {
        "title": "{query} Market Trends 2024 – Gartner",
        "url": "https://www.gartner.com/en/research/{slug}-trends",
        "content": (
            "The global market for {query} reached $47 billion in 2023 and is projected to grow at a CAGR "
            "of 28% through 2028. North America leads adoption, followed by Europe and Asia-Pacific. "
            "Key vendors include established tech giants and a growing ecosystem of specialized startups. "
            "Enterprises cite talent shortage and integration complexity as top barriers."
        ),
        "score": 0.78,
    },
]


def _mock_results(query: str, max_results: int) -> list[dict]:
    slug = query.lower().replace(" ", "-")[:40]
    results = []
    # Deterministically pick entries based on query hash so same query → same mocks
    seed = int(hashlib.md5(query.encode()).hexdigest(), 16)
    indices = [(seed + i) % len(_MOCK_CORPUS) for i in range(min(max_results, len(_MOCK_CORPUS)))]
    for idx in indices:
        template = _MOCK_CORPUS[idx]
        results.append(
            {
                "title": template["title"].format(query=query, slug=slug),
                "url": template["url"].format(query=query, slug=slug),
                "content": template["content"].format(query=query, slug=slug),
                "score": template["score"],
            }
        )
    return results


def _is_placeholder(key: str) -> bool:
    return not key or key.startswith("your_") or key == "tvly-placeholder"


async def search_web(query: str, max_results: int = 5) -> list[dict]:
    max_results = int(max_results)  # LLM may pass as string
    settings = get_settings()

    if _is_placeholder(settings.tavily_api_key):
        return _mock_results(query, max_results)

    try:
        async with httpx.AsyncClient() as client:
            response = await client.post(
                "https://api.tavily.com/search",
                json={
                    "api_key": settings.tavily_api_key,
                    "query": query,
                    "max_results": max_results,
                    "include_raw_content": False,
                },
                timeout=30.0,
            )
            response.raise_for_status()
            data = response.json()
            return [
                {
                    "title": r.get("title", ""),
                    "url": r.get("url", ""),
                    "content": r.get("content", ""),
                    "score": r.get("score", 0),
                }
                for r in data.get("results", [])
            ]
    except Exception:
        # Fall back to mocks if the API call fails for any reason
        return _mock_results(query, max_results)
