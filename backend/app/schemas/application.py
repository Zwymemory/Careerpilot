from datetime import UTC, datetime
from typing import Literal

from pydantic import BaseModel, Field

from app.schemas.interview import InterviewPack
from app.schemas.matching import MatchProfile
from app.schemas.parser import EvidenceItem, JobProfile, ResumeProfile
from app.schemas.rewrite import ResumeRewriteDraft

ApplicationStatus = Literal[
    "SAVED",
    "READY_TO_APPLY",
    "APPLIED",
    "INTERVIEWING",
    "OFFER",
    "REJECTED",
    "ARCHIVED",
]
MemoryCategory = Literal["strength", "gap", "preference", "feedback", "follow_up"]
TaskPriority = Literal["P0", "P1", "P2"]
TaskStatus = Literal["OPEN", "DONE"]


def utc_now() -> datetime:
    return datetime.now(UTC)


class ApplicationMemory(BaseModel):
    memory_id: str
    category: MemoryCategory
    text: str
    source: str
    confidence: float = Field(default=0.7, ge=0, le=1)
    evidence: list[EvidenceItem] = Field(default_factory=list)
    created_at: datetime = Field(default_factory=utc_now)


class ApplicationTask(BaseModel):
    task_id: str
    title: str
    reason: str
    priority: TaskPriority
    status: TaskStatus = "OPEN"
    due_hint: str | None = None
    created_at: datetime = Field(default_factory=utc_now)
    completed_at: datetime | None = None


class InterviewFeedback(BaseModel):
    feedback_id: str
    stage: str
    feedback_text: str
    strengths: list[str] = Field(default_factory=list)
    concerns: list[str] = Field(default_factory=list)
    follow_up_tasks: list[str] = Field(default_factory=list)
    created_at: datetime = Field(default_factory=utc_now)


class ApplicationRecord(BaseModel):
    application_id: str
    user_id: str
    company: str | None = None
    title: str | None = None
    job_url: str | None = None
    status: ApplicationStatus = "READY_TO_APPLY"
    match_score: float | None = None
    interview_score: float | None = None
    resume_headline: str | None = None
    target_keywords: list[str] = Field(default_factory=list)
    notes: str | None = None
    memories: list[ApplicationMemory] = Field(default_factory=list)
    tasks: list[ApplicationTask] = Field(default_factory=list)
    feedback: list[InterviewFeedback] = Field(default_factory=list)
    source_run_ids: list[str] = Field(default_factory=list)
    created_at: datetime = Field(default_factory=utc_now)
    updated_at: datetime = Field(default_factory=utc_now)


class ApplicationCreateRequest(BaseModel):
    user_id: str = Field(default="local-user", min_length=1, max_length=80)
    job_profile: JobProfile
    resume_profile: ResumeProfile | None = None
    match_profile: MatchProfile | None = None
    rewrite_draft: ResumeRewriteDraft | None = None
    interview_pack: InterviewPack | None = None
    job_url: str | None = None
    status: ApplicationStatus = "READY_TO_APPLY"
    notes: str | None = None
    source_run_ids: list[str] = Field(default_factory=list)


class FeedbackCreateRequest(BaseModel):
    user_id: str = Field(default="local-user", min_length=1, max_length=80)
    stage: str = Field(default="初面", min_length=1, max_length=80)
    feedback_text: str = Field(min_length=1, max_length=3000)
    strengths: list[str] = Field(default_factory=list)
    concerns: list[str] = Field(default_factory=list)
    follow_up_tasks: list[str] = Field(default_factory=list)


class ApplicationStatusUpdateRequest(BaseModel):
    user_id: str = Field(default="local-user", min_length=1, max_length=80)
    status: ApplicationStatus
    notes: str | None = None


class ApplicationResponse(BaseModel):
    run_id: str
    record: ApplicationRecord
