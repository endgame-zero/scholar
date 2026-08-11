import json
from typing import AsyncGenerator
from agents.llm import get_llm_client
from config import get_settings
from tools.search import search_web
from tools.scraper import get_url_content

SYSTEM_PROMPT = """You are a research manager agent. Your job is to gather comprehensive, high-quality evidence about a research topic by using the available tools.

Strategy:
1. Start with a broad web search to get an overview
2. Identify the most relevant URLs and fetch their full content
3. Do targeted follow-up searches to fill gaps
4. Once you have 3–5 solid sources with substantive content, stop and summarize what you found

Be efficient: don't search the same thing twice. When you have enough evidence, stop calling tools and write a brief summary of what you gathered."""

TOOLS = [
    {
        "type": "function",
        "function": {
            "name": "search_web",
            "description": "Search the web and return a list of relevant results (title, URL, snippet).",
            "parameters": {
                "type": "object",
                "properties": {
                    "query": {"type": "string", "description": "The search query"},
                    "max_results": {"type": "integer", "description": "Max results to return (default 5)", "default": 5},
                },
                "required": ["query"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "get_url_content",
            "description": "Fetch and extract the full text content from a specific URL.",
            "parameters": {
                "type": "object",
                "properties": {
                    "url": {"type": "string", "description": "The URL to fetch"},
                },
                "required": ["url"],
            },
        },
    },
]


async def run_manager(query: str, max_iterations: int = 6) -> AsyncGenerator[dict, None]:
    client = get_llm_client()
    settings = get_settings()

    messages = [
        {"role": "system", "content": SYSTEM_PROMPT},
        {"role": "user", "content": f"Research this topic thoroughly: {query}"},
    ]

    evidence: list[dict] = []

    for _ in range(max_iterations):
        response = await client.chat.completions.create(
            model=settings.llm_model,
            messages=messages,
            tools=TOOLS,
            tool_choice="auto",
        )

        msg = response.choices[0].message

        # Build assistant message dict for history
        assistant_entry: dict = {"role": "assistant", "content": msg.content or ""}
        if msg.tool_calls:
            assistant_entry["tool_calls"] = [
                {
                    "id": tc.id,
                    "type": "function",
                    "function": {"name": tc.function.name, "arguments": tc.function.arguments},
                }
                for tc in msg.tool_calls
            ]
        messages.append(assistant_entry)

        if not msg.tool_calls:
            yield {"type": "manager_done", "summary": msg.content or "Evidence gathering complete."}
            break

        for tc in msg.tool_calls:
            name = tc.function.name
            try:
                args = json.loads(tc.function.arguments)
            except json.JSONDecodeError:
                args = {}

            yield {"type": "tool_call", "name": name, "args": args}

            try:
                if name == "search_web":
                    results = await search_web(**args)
                    evidence.extend(results)
                    tool_output = json.dumps(results)
                    yield {"type": "tool_result", "name": "search_web", "count": len(results)}
                elif name == "get_url_content":
                    content = await get_url_content(**args)
                    evidence.append({"url": args.get("url", ""), "content": content, "title": args.get("url", "")})
                    tool_output = content[:3000]
                    yield {"type": "tool_result", "name": "get_url_content", "url": args.get("url")}
                else:
                    tool_output = "Unknown tool"
            except Exception as e:
                tool_output = f"Tool error: {e}"
                yield {"type": "tool_error", "name": name, "error": str(e)}

            messages.append({"role": "tool", "tool_call_id": tc.id, "content": tool_output})

    yield {"type": "evidence", "data": evidence}
