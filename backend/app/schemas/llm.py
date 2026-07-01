from datetime import UTC, datetime
from typing import Any, Literal

from pydantic import BaseModel, Field


class ChatMessage(BaseModel):
    role: Literal["system", "user", "assistant"]
    content: str


class LLMUsage(BaseModel):
    prompt_tokens: int = 0
    completion_tokens: int = 0
    total_tokens: int = 0


class LLMRequest(BaseModel):
    messages: list[ChatMessage]
    response_format: dict[str, Any] | None = None
    temperature: float = 0.2
    max_tokens: int = 800


class LLMResponse(BaseModel):
    provider: str
    model: str
    content: str
    usage: LLMUsage = Field(default_factory=LLMUsage)
    latency_ms: int
    estimated_cost_cny: float = 0
    dry_run: bool = False
    created_at: datetime = Field(default_factory=lambda: datetime.now(UTC))
