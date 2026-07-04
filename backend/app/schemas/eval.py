from datetime import UTC, datetime
from typing import Literal

from pydantic import BaseModel, Field

from app.schemas.application import ApplicationRecord
from app.schemas.interview import InterviewPack
from app.schemas.matching import MatchProfile
from app.schemas.parser import JobProfile, ResumeProfile
from app.schemas.rewrite import ResumeRewriteDraft
from app.schemas.run import CostUsage

EvalArtifactType = Literal[
    "parser",
    "matching",
    "rewrite",
    "interview",
    "application",
    "judge",
]
EvalRuleStatus = Literal["passed", "warning", "failed"]
EvalRuleSeverity = Literal["info", "warning", "critical"]
EvalGateDecision = Literal["PASS", "WARN", "BLOCK"]
EvalJudgeMode = Literal["rule_based", "llm_as_judge_dry_run", "llm_as_judge"]


class EvalRuleResult(BaseModel):
    rule_id: str
    category: EvalArtifactType
    name: str
    status: EvalRuleStatus
    severity: EvalRuleSeverity
    score: float = Field(ge=0, le=100)
    message: str
    evidence: list[str] = Field(default_factory=list)


class QualityGateResult(BaseModel):
    decision: EvalGateDecision
    passed: bool
    score: float = Field(ge=0, le=100)
    blocking_reasons: list[str] = Field(default_factory=list)
    warnings: list[str] = Field(default_factory=list)
    release_notes: list[str] = Field(default_factory=list)


class EvalRunRequest(BaseModel):
    user_id: str = Field(default="local-user", min_length=1, max_length=80)
    case_name: str = Field(default="CareerPilot local eval", min_length=1, max_length=160)
    judge_mode: EvalJudgeMode = "rule_based"
    min_score: float = Field(default=75, ge=0, le=100)
    expected_keywords: list[str] = Field(default_factory=list)
    required_sections: list[str] = Field(default_factory=list)
    resume_profile: ResumeProfile | None = None
    job_profile: JobProfile | None = None
    match_profile: MatchProfile | None = None
    rewrite_draft: ResumeRewriteDraft | None = None
    interview_pack: InterviewPack | None = None
    application_record: ApplicationRecord | None = None


class EvalReport(BaseModel):
    report_id: str
    user_id: str
    case_name: str
    judge_mode: EvalJudgeMode
    evaluated_artifacts: list[EvalArtifactType] = Field(default_factory=list)
    overall_score: float = Field(ge=0, le=100)
    gate: QualityGateResult
    rule_results: list[EvalRuleResult] = Field(default_factory=list)
    summary: str
    html_report: str
    judge_cost_usage: CostUsage | None = None
    created_at: datetime = Field(default_factory=lambda: datetime.now(UTC))


class EvalReportSummary(BaseModel):
    report_id: str
    case_name: str
    judge_mode: EvalJudgeMode
    overall_score: float
    decision: EvalGateDecision
    evaluated_artifacts: list[EvalArtifactType] = Field(default_factory=list)
    created_at: datetime


class EvalRunResponse(BaseModel):
    run_id: str
    report: EvalReport
