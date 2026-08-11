import httpx
from bs4 import BeautifulSoup


async def get_url_content(url: str, max_chars: int = 5000) -> str:
    try:
        async with httpx.AsyncClient(follow_redirects=True) as client:
            response = await client.get(
                url,
                timeout=15.0,
                headers={"User-Agent": "Mozilla/5.0 (compatible; ResearchBot/1.0)"},
            )
            response.raise_for_status()
            soup = BeautifulSoup(response.text, "html.parser")
            for tag in soup(["script", "style", "nav", "footer", "header", "aside", "form"]):
                tag.decompose()
            text = soup.get_text(separator="\n", strip=True)
            # Collapse excessive blank lines
            lines = [l for l in text.splitlines() if l.strip()]
            return "\n".join(lines)[:max_chars]
    except Exception as e:
        return f"[Error fetching {url}: {e}]"
