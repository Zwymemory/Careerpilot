from typing import Literal

from pydantic import BaseModel, Field

from app.schemas.matching import MatchProfile
from app.schemas.parser import EvidenceItem, JobProfile, ResumeProfile
from app.schemas.rewrite import ResumeRewriteDraft


class InterviewQuestion(BaseModel):
    question_id: str
    category: Literal["technical", "project", "behavioral", "gap", "system_design"]
    question: str
    why_asked: str
    suggested_angle: str
    priority: Literal["P0", "P1", "P2"]
    evidence: list[EvidenceItem] = Field(default_factory=list)


class ProjectFollowUp(BaseModel):
    project_name: str
    question: str
    probe_focus: str
    evidence: list[EvidenceItem] = Field(default_factory=list)
    risk_flags: list[str] = Field(default_factory=list)


class StarAnswerDraft(BaseModel):
    prompt: str
    situation: str
    task: str
    action: str
    result: str
    evidence: list[EvidenceItem] = Field(default_factory=list)
    risk_notes: list[str] = Field(default_factory=list)


class KnowledgePoint(BaseModel):
    topic: str
    why_matters: str
    current_signal: Literal["covered", "partial", "gap"]
    review_prompt: str
    evidence: list[EvidenceItem] = Field(default_factory=list)


class MockInterviewDimension(BaseModel):
    name: str
    score: float = Field(ge=0, le=100)
    feedback: str


class MockInterviewScore(BaseModel):
    overall_score: float = Field(ge=0, le=100)
    dimensions: list[MockInterviewDimension] = Field(default_factory=list)
    strengths: list[str] = Field(default_factory=list)
    risks: list[str] = Field(default_factory=list)
    next_actions: list[str] = Field(default_factory=list)


class InterviewPack(BaseModel):
    pack_id: str
    company: str | None = None
    title: str | None = None
    target_keywords: list[str] = Field(default_factory=list)
    predicted_questions: list[InterviewQuestion] = Field(default_factory=list)
    project_followups: list[ProjectFollowUp] = Field(default_factory=list)
    star_answers: list[StarAnswerDraft] = Field(default_factory=list)
    knowledge_points: list[KnowledgePoint] = Field(default_factory=list)
    mock_score: MockInterviewScore
    evidence_warnings: list[str] = Field(default_factory=list)
    markdown: str


class InterviewPackRequest(BaseModel):
    resume_profile: ResumeProfile
    job_profile: JobProfile
    match_profile: MatchProfile | None = None
    rewrite_draft: ResumeRewriteDraft | None = None
    user_id: str = Field(default="local-user", min_length=1, max_length=80)


class InterviewPackResponse(BaseModel):
    run_id: str
    pack: InterviewPack
