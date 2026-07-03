from typing import Literal

from pydantic import BaseModel, Field

from app.schemas.matching import MatchProfile
from app.schemas.parser import EvidenceItem, JobProfile, ResumeProfile


class RewriteChange(BaseModel):
    change_id: str
    section: Literal["summary", "skills", "project", "experience", "evidence_needed"]
    original_text: str
    revised_text: str
    rationale: str
    evidence: list[EvidenceItem] = Field(default_factory=list)
    risk_level: Literal["low", "medium", "high"] = "medium"


class ResumeRewriteDraft(BaseModel):
    draft_id: str
    approval_status: Literal["WAITING_APPROVAL", "APPROVED", "REJECTED"] = "WAITING_APPROVAL"
    company: str | None = None
    title: str | None = None
    headline: str
    target_keywords: list[str] = Field(default_factory=list)
    changes: list[RewriteChange] = Field(default_factory=list)
    risk_warnings: list[str] = Field(default_factory=list)
    markdown: str


class ResumeRewriteRequest(BaseModel):
    resume_profile: ResumeProfile
    job_profile: JobProfile
    match_profile: MatchProfile
    user_id: str = Field(default="local-user", min_length=1, max_length=80)


class ResumeRewriteResponse(BaseModel):
    run_id: str
    draft: ResumeRewriteDraft


class RewriteApprovalRequest(BaseModel):
    approved_by: str = Field(default="local-user", min_length=1, max_length=80)
    notes: str | None = Field(default=None, max_length=1000)
