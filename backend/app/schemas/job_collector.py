from datetime import UTC, datetime
from typing import Literal

from pydantic import BaseModel, Field, model_validator

from app.schemas.parser import JobProfile, ParseMetadata


class BrowserSafetyReport(BaseModel):
    allowed: bool
    rules: list[str] = Field(default_factory=list)
    warnings: list[str] = Field(default_factory=list)
    blocked_reason: str | None = None


class JobSnapshot(BaseModel):
    source_type: Literal["url", "html", "text"]
    source_url: str | None = None
    source_name: str | None = None
    title: str | None = None
    text: str
    text_hash: str
    html_hash: str | None = None
    screenshot_path: str | None = None
    screenshot_hash: str | None = None
    screenshot_status: Literal["captured", "skipped", "unavailable"] = "skipped"
    captured_at: datetime = Field(default_factory=lambda: datetime.now(UTC))
    safety: BrowserSafetyReport


class JobCollectRequest(BaseModel):
    user_id: str = Field(default="local-user", min_length=1, max_length=80)
    url: str | None = Field(default=None, max_length=2048)
    html: str | None = Field(default=None, min_length=10, max_length=200_000)
    text: str | None = Field(default=None, min_length=10, max_length=50_000)
    source_name: str | None = Field(default=None, max_length=200)
    capture_screenshot: bool = False

    @model_validator(mode="after")
    def require_one_source(self) -> "JobCollectRequest":
        if not (self.url or self.html or self.text):
            raise ValueError("Provide one of url, html, or text.")
        return self


class JobCollectResponse(BaseModel):
    run_id: str
    snapshot: JobSnapshot
    profile: JobProfile
    metadata: ParseMetadata
