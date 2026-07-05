import time
from typing import Any

from app.core.config import Settings
from app.schemas.web_search import WebSearchRequest, WebSearchResponse, WebSearchResult


class TavilyClientError(RuntimeError):
    pass


class TavilyClient:
    """Small Tavily Search API client with dry-run fallback.

    CareerPilot uses Tavily as a web evidence tool, not as a source of fabricated
    resume claims. Search results can guide interview prep or company/JD research,
    but user-facing claims still need resume evidence.
    """

    def __init__(self, settings: Settings) -> None:
        self.settings = settings
        self.base_url = settings.tavily_base_url.rstrip("/")
        self.api_key = settings.tavily_api_key
        self.dry_run = settings.tavily_dry_run

    async def search(self, request: WebSearchRequest) -> WebSearchResponse:
        started = time.perf_counter()
        if self.dry_run or not self.api_key:
            return self._dry_run_response(request, started)

        try:
            return await self._search_once(request, started)
        except Exception as exc:  # noqa: BLE001 - converted at service boundary.
            raise TavilyClientError(f"Tavily search failed: {exc}") from exc

    async def _search_once(self, request: WebSearchRequest, started: float) -> WebSearchResponse:
        import httpx

        payload: dict[str, Any] = {
            "query": request.query,
            "topic": request.topic,
            "search_depth": request.search_depth,
            "max_results": request.max_results,
            "include_answer": request.include_answer,
            "include_raw_content": request.include_raw_content,
            "include_usage": True,
        }
        headers = {
            "Authorization": f"Bearer {self.api_key}",
            "Content-Type": "application/json",
        }
        async with httpx.AsyncClient(timeout=self.settings.tavily_timeout_seconds) as client:
            response = await client.post(f"{self.base_url}/search", headers=headers, json=payload)
            response.raise_for_status()
            data = response.json()

        return WebSearchResponse(
            query=request.query,
            answer=data.get("answer"),
            results=_parse_results(data.get("results")),
            usage=data.get("usage") or {},
            latency_ms=int((time.perf_counter() - started) * 1000),
            dry_run=False,
        )

    def _dry_run_response(self, request: WebSearchRequest, started: float) -> WebSearchResponse:
        return WebSearchResponse(
            query=request.query,
            answer=(
                "Dry-run Tavily search: configure TAVILY_API_KEY and set "
                "TAVILY_DRY_RUN=false to fetch live web evidence."
            ),
            results=[
                WebSearchResult(
                    title="CareerPilot dry-run web evidence",
                    url="https://example.com/careerpilot-dry-run",
                    content=(
                        "示例搜索结果：真实运行时这里会返回岗位背景、公司资料或相似面试题参考。"
                    ),
                    score=1.0,
                )
            ],
            usage={"credits": 0},
            latency_ms=int((time.perf_counter() - started) * 1000),
            dry_run=True,
            issues=["tavily_dry_run_or_missing_key"],
        )


def _parse_results(value: Any) -> list[WebSearchResult]:
    if not isinstance(value, list):
        return []
    results: list[WebSearchResult] = []
    for item in value:
        if not isinstance(item, dict):
            continue
        title = str(item.get("title") or "Untitled result").strip()
        url = str(item.get("url") or "").strip()
        if not url:
            continue
        results.append(
            WebSearchResult(
                title=title,
                url=url,
                content=str(item.get("content") or item.get("raw_content") or "").strip(),
                score=item.get("score"),
                published_date=item.get("published_date"),
            )
        )
    return results
