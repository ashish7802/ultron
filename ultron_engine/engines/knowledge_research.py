"""18. Knowledge & Research Engine: web + local search, ranking, cross-check."""
import asyncio, time, uuid, re, os
from typing import Any, Dict, List
from ..core import BaseEngine, EventBus, SharedState

try:
    import httpx
    from bs4 import BeautifulSoup
    HAS_WEB = True
except Exception:
    httpx = None
    BeautifulSoup = None
    HAS_WEB = False

try:
    from ddgs import DDGS
    HAS_DDGS = True
except Exception:
    try:
        from duckduckgo_search import DDGS
        HAS_DDGS = True
    except Exception:
        DDGS = None
        HAS_DDGS = False

CREDIBLE_DOMAINS = {"wikipedia.org", "github.com", "stackoverflow.com", "docs.python.org", "arxiv.org", "developer.mozilla.org", "learn.microsoft.com"}

class KnowledgeResearchEngine(BaseEngine):
    name = "knowledge_research"
    layer = "knowledge"

    # Directory names pruned from local searches (see _search_local_sync).
    SKIP_DIRS = {"node_modules", ".git", ".next", "__pycache__", ".venv", "venv",
                 ".tmp", "backups", ".qpanda", ".andromity"}

    def __init__(self, bus, state):
        super().__init__(bus, state)
        self._lock = asyncio.Lock()
        self._cache = {}

    async def start(self):
        await super().start()
        self.bus.subscribe("knowledge_research.*", self._on)

    async def _on(self, ev):
        pass

    def credibility(self, source):
        url = str(source.get("url", "") if isinstance(source, dict) else source)
        # Defensive split: malformed URLs ("http://") have no host component.
        if "://" in url:
            parts = url.split("/")
            domain = parts[2] if len(parts) > 2 else ""
        else:
            domain = ""
        score = 0.5
        if any(d in domain for d in CREDIBLE_DOMAINS):
            score += 0.3
        if source.get("https") if isinstance(source, dict) else False:
            score += 0.1
        return min(1.0, score)

    def rank_sources(self, sources):
        ranked = []
        # Sources/candidates come from JSON and may be null or a string; both
        # previously raised TypeError while iterating/coercing.
        if not isinstance(sources, (list, tuple)):
            sources = []
        for s in sources:
            s = dict(s) if isinstance(s, dict) else {"url": str(s), "title": str(s)}
            s["credibility"] = self.credibility(s)
            try:
                s["relevance"] = float(s.get("relevance", 0.5))
            except (TypeError, ValueError):
                s["relevance"] = 0.5
            s["score"] = round(0.6 * s["relevance"] + 0.4 * s["credibility"], 3)
            ranked.append(s)
        ranked.sort(key=lambda x: x["score"], reverse=True)
        return ranked

    def cross_check(self, claims, sources):
        # verify each claim appears in at least one source text
        results = []
        if not isinstance(claims, (list, tuple)):
            claims = []
        if not isinstance(sources, (list, tuple)):
            sources = []
        corpus = " ".join(str(s.get("text", s.get("title", ""))) for s in sources).lower()
        for c in claims:
            supported = str(c).lower() in corpus
            results.append({"claim": c, "supported": supported})
        return results

    async def search_web(self, query, max_results=10):
        results = []
        if HAS_DDGS:
            try:
                # DDGS is a synchronous/blocking client. Running it inline inside
                # this coroutine stalled the whole event loop (all engines share
                # it), so the blocking search is offloaded to a worker thread.
                def _ddg_text():
                    with DDGS() as ddgs:
                        return list(ddgs.text(query, max_results=max_results))

                for r in await asyncio.to_thread(_ddg_text):
                    results.append({
                        "title": r.get("title", ""),
                        "url": r.get("href") or r.get("url", ""),
                        "snippet": r.get("body") or r.get("snippet", ""),
                        "source": "duckduckgo"
                    })
            except Exception as e:
                results.append({"error": f"ddgs: {e}"})
        # fallback: try httpx if nothing found
        if not results and HAS_WEB:
            try:
                async with httpx.AsyncClient(timeout=10, headers={"User-Agent": "ULTRON-Research/1.0"}) as client:
                    resp = await client.get("https://html.duckduckgo.com/html/", params={"q": query})
                    if resp.status_code == 200 and BeautifulSoup:
                        soup = BeautifulSoup(resp.text, "html.parser")
                        for res in soup.select(".result__a")[:max_results]:
                            href = res.get("href", "")
                            title = res.get_text(strip=True)
                            results.append({"title": title, "url": href, "snippet": "", "source": "ddg_html"})
            except Exception as e:
                results.append({"error": f"httpx: {e}"})
        ranked = self.rank_sources(results)
        # cache results (bounded: this dict was never evicted and grew forever)
        self._cache[query] = {"results": ranked, "ts": time.time()}
        while len(self._cache) > 100:
            self._cache.pop(next(iter(self._cache)))
        return ranked

    async def fetch_content(self, url):
        if not HAS_WEB:
            return {"error": "web libs missing"}
        try:
            async with httpx.AsyncClient(timeout=15, headers={"User-Agent": "ULTRON-Research/1.0"}, follow_redirects=True) as client:
                resp = await client.get(url)
                content_type = resp.headers.get("content-type", "")
                if "text/html" in content_type and BeautifulSoup:
                    soup = BeautifulSoup(resp.text, "html.parser")
                    # remove script/style
                    for s in soup(["script", "style", "nav", "footer", "header"]):
                        s.decompose()
                    text = soup.get_text(separator=" ", strip=True)
                    return {"url": url, "text": text[:8000], "status": resp.status_code}
                else:
                    return {"url": url, "text": resp.text[:8000], "status": resp.status_code}
        except Exception as e:
            return {"error": str(e)}

    async def research(self, query, max_results=8):
        # search web + rank + optionally fetch top results
        sources = await self.search_web(query, max_results)
        detailed = []
        for s in sources[:3]:  # fetch top 3 for detailed content
            if s.get("url") and not s.get("error"):
                content = await self.fetch_content(s["url"])
                detailed.append({**s, **content})
            else:
                detailed.append(s)
        return {"query": query, "sources": sources, "detailed": detailed}

    @staticmethod
    def _search_local_sync(query, root="."):
        """Synchronous repository scan used by :meth:`search_local`.

        Kept as a plain function so the blocking filesystem walk can run in a
        worker thread instead of stalling the shared asyncio event loop.

        Args:
            query: Text to search for (any JSON value; coerced to str).
            root: Directory to scan.

        Returns:
            list: Up to 20 ``{"path", "snippet"}`` matches.
        """
        matches = []
        query_low = str(query or "").lower()
        for dirpath, dirnames, files in os.walk(root):
            # Dependency/build trees are huge and contain no user knowledge;
            # walking node_modules/.next from the repo root took seconds.
            dirnames[:] = [d for d in dirnames if d not in KnowledgeResearchEngine.SKIP_DIRS]
            if len(matches) > 50:
                break
            for f in files:
                if f.endswith((".py", ".md", ".ts", ".tsx", ".json")):
                    p = os.path.join(dirpath, f)
                    try:
                        # Skip very large generated/vendored files: we only need
                        # a 200-char snippet, and reading them is pure overhead.
                        if os.path.getsize(p) > 2 * 1024 * 1024:
                            continue
                        with open(p, "r", encoding="utf-8", errors="ignore") as fh:
                            content = fh.read()
                        if query_low in content.lower():
                            matches.append({"path": p, "snippet": content[:200]})
                    except OSError:
                        pass
        return matches[:20]

    async def search_local(self, query, root="."):
        try:
            return await asyncio.to_thread(self._search_local_sync, query, root)
        except Exception as e:
            return {"error": str(e)}

    async def learn_and_store(self, query, store_to_memory=True):
        research = await self.research(query)
        summary = ""
        if research.get("detailed"):
            for d in research["detailed"]:
                if d.get("text"):
                    summary += d["text"][:500] + "\n\n"
        result = {"query": query, "summary": summary[:2000], "sources": research.get("sources", [])}
        if store_to_memory and summary:
            # This engine only has the MemoryEngine *class* importable, not a
            # live instance, so it cannot persist anything.  The old code
            # always reported stored=True (a false success); report the truth
            # so callers do not believe knowledge was saved.
            result["stored"] = False
            result["store_reason"] = "memory_engine_not_wired"
        return result

    async def process(self, payload=None):
        if not isinstance(payload, dict):
            payload = {"action": "search"}
        action = payload.get("action", "search")
        if action == "rank":
            ranked = self.rank_sources(payload.get("sources", []))
            return {"id": str(uuid.uuid4()), "engine": self.name, "status": "ok", "ranked": ranked}
        if action == "cross_check":
            res = self.cross_check(payload.get("claims", []), payload.get("sources", []))
            return {"id": str(uuid.uuid4()), "engine": self.name, "status": "ok", "results": res}
        if action == "search_local":
            res = await self.search_local(payload.get("query", ""), payload.get("root", "."))
            # search_local returns a dict on error; len(dict) is not a match count.
            count = len(res) if isinstance(res, list) else 0
            return {"id": str(uuid.uuid4()), "engine": self.name, "status": "ok", "matches": res, "count": count}
        if action == "search_web" or action == "web":
            res = await self.search_web(payload.get("query", ""), payload.get("max_results", 10))
            return {"id": str(uuid.uuid4()), "engine": self.name, "status": "ok", "results": res}
        if action == "research":
            res = await self.research(payload.get("query", ""), payload.get("max_results", 8))
            return {"id": str(uuid.uuid4()), "engine": self.name, "status": "ok", **res}
        if action == "learn":
            res = await self.learn_and_store(payload.get("query", ""))
            return {"id": str(uuid.uuid4()), "engine": self.name, "status": "ok", **res}
        # default search: rank provided sources
        ranked = self.rank_sources(payload.get("sources", []))
        return {"id": str(uuid.uuid4()), "engine": self.name, "status": "ok", "ranked": ranked}
