from typing import Literal

from pydantic import BaseModel, Field

from app.schemas.parser import EvidenceItem, JobProfile, ResumeProfile


class MatchEvidence(BaseModel):
    requirement: str
    matched_resume_items: list[str] = Field(default_factory=list)
    missing_terms: list[str] = Field(default_factory=list)
    evidence: list[EvidenceItem] = Field(default_factory=list)
    confidence: float = Field(default=0, ge=0, le=1)


class MatchGap(BaseModel):
    requirement: str
    severity: Literal["low", "medium", "high"]
    reason: str
    suggested_action: str


class MatchPriority(BaseModel):
    item: str
    priority: Literal["P0", "P1", "P2"]
    reason: str


class MatchScoreBreakdown(BaseModel):
    hard_requirements: float = Field(ge=0, le=100)
    nice_to_have: float = Field(ge=0, le=100)
    responsibilities: float = Field(ge=0, le=100)
    keyword_alignment: float = Field(ge=0, le=100)


class MatchProfile(BaseModel):
    overall_score: float = Field(ge=0, le=100)
    score_breakdown: MatchScoreBreakdown
    evidence_mapping: list[MatchEvidence] = Field(default_factory=list)
    gaps: list[MatchGap] = Field(default_factory=list)
    priority_ranking: list[MatchPriority] = Field(default_factory=list)
    matched_keywords: list[str] = Field(default_factory=list)
    missing_keywords: list[str] = Field(default_factory=list)
    summary: str


class MatchRequest(BaseModel):
    resume_profile: ResumeProfile
    job_profile: JobProfile
    user_id: str = Field(default="local-user", min_length=1, max_length=80)


class MatchResponse(BaseModel):
    run_id: str
    match: MatchProfile
