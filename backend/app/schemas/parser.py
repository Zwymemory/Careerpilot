from typing import Literal

from pydantic import BaseModel, Field, HttpUrl


class ParseIssue(BaseModel):
    code: str
    message: str
    severity: Literal["info", "warning", "error"] = "warning"
    field_path: str | None = None


class EvidenceItem(BaseModel):
    field_path: str
    source_text: str = Field(min_length=1, max_length=1000)
    confidence: float = Field(default=0.7, ge=0, le=1)
    is_inferred: bool = False


class ResumeEducation(BaseModel):
    school: str
    degree: str | None = None
    major: str | None = None
    start_date: str | None = None
    end_date: str | None = None
    evidence: list[EvidenceItem] = Field(default_factory=list)


class ResumeProject(BaseModel):
    name: str
    description: str
    skills: list[str] = Field(default_factory=list)
    evidence: list[EvidenceItem] = Field(default_factory=list)


class ResumeExperience(BaseModel):
    company: str | None = None
    title: str
    description: str
    start_date: str | None = None
    end_date: str | None = None
    evidence: list[EvidenceItem] = Field(default_factory=list)


class ResumeProfile(BaseModel):
    education: list[ResumeEducation] = Field(default_factory=list)
    skills: list[str] = Field(default_factory=list)
    projects: list[ResumeProject] = Field(default_factory=list)
    experiences: list[ResumeExperience] = Field(default_factory=list)
    keywords: list[str] = Field(default_factory=list)
    evidence: list[EvidenceItem] = Field(default_factory=list)
    inferred_fields: list[str] = Field(default_factory=list)
    needs_confirmation: list[str] = Field(default_factory=list)


class JobProfile(BaseModel):
    company: str | None = None
    title: str | None = None
    hard_requirements: list[str] = Field(default_factory=list)
    nice_to_have: list[str] = Field(default_factory=list)
    responsibilities: list[str] = Field(default_factory=list)
    tech_keywords: list[str] = Field(default_factory=list)
    hidden_keywords: list[str] = Field(default_factory=list)
    company_context: list[str] = Field(default_factory=list)
    evidence: list[EvidenceItem] = Field(default_factory=list)
    inferred_fields: list[str] = Field(default_factory=list)
    needs_confirmation: list[str] = Field(default_factory=list)


class ParseMetadata(BaseModel):
    parser: Literal["resume", "job"]
    source: Literal["llm_structured_output", "heuristic_dry_run", "heuristic_fallback"]
    model: str | None = None
    dry_run: bool = False
    json_repaired: bool = False
    issues: list[ParseIssue] = Field(default_factory=list)


class ParseResumeRequest(BaseModel):
    text: str = Field(min_length=10, max_length=30000)
    user_id: str = Field(default="local-user", min_length=1, max_length=80)
    source_name: str | None = Field(default=None, max_length=200)


class ParseJobRequest(BaseModel):
    text: str = Field(min_length=10, max_length=30000)
    user_id: str = Field(default="local-user", min_length=1, max_length=80)
    source_url: HttpUrl | None = None


class ParseResumeResponse(BaseModel):
    run_id: str
    profile: ResumeProfile
    metadata: ParseMetadata


class ParseJobResponse(BaseModel):
    run_id: str
    profile: JobProfile
    metadata: ParseMetadata
