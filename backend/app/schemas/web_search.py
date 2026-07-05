from typing import Any, Literal

from pydantic import BaseModel, Field, HttpUrl


class WebSearchRequest(BaseModel):
    query: str = Field(min_length=2, max_length=500)
    topic: Literal["general", "news"] = "general"
    search_depth: Literal["basic", "advanced"] = "basic"
    max_results: int = Field(default=5, ge=1, le=10)
    include_answer: bool = True
    include_raw_content: bool = False
    user_id: str = Field(default="local-user", min_length=1, max_length=80)


class WebSearchResult(BaseModel):
    title: str
    url: HttpUrl | str
    content: str = ""
    score: float | None = None
    published_date: str | None = None


class WebSearchResponse(BaseModel):
    provider: str = "tavily"
    query: str
    answer: str | None = None
    results: list[WebSearchResult] = Field(default_factory=list)
    usage: dict[str, Any] = Field(default_factory=dict)
    latency_ms: int = 0
    dry_run: bool = False
    issues: list[str] = Field(default_factory=list)
