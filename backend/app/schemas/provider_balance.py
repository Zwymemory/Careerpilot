from datetime import UTC, datetime
from typing import Literal

from pydantic import BaseModel, Field


ProviderBalanceStatus = Literal["ok", "warn", "error", "unknown"]


class ProviderBalance(BaseModel):
    provider: str
    label: str
    configured: bool
    live: bool
    status: ProviderBalanceStatus
    percent_remaining: float = Field(ge=0, le=100)
    estimated_calls_remaining: int | None = None
    balance_label: str
    remaining_label: str
    unit_label: str
    source: str
    issues: list[str] = Field(default_factory=list)
    updated_at: datetime = Field(default_factory=lambda: datetime.now(UTC))


class ProviderBalanceResponse(BaseModel):
    generated_at: datetime = Field(default_factory=lambda: datetime.now(UTC))
    summary: str
    providers: list[ProviderBalance]
    docs: dict[str, str] = Field(default_factory=dict)
