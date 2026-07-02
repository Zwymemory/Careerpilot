import json
import re
from dataclasses import dataclass
from typing import Protocol

from pydantic import BaseModel, ValidationError

from app.core.config import Settings
from app.schemas.llm import ChatMessage, LLMRequest, LLMResponse
from app.schemas.parser import (
    EvidenceItem,
    JobProfile,
    ParseIssue,
    ParseMetadata,
    ResumeEducation,
    ResumeExperience,
    ResumeProfile,
    ResumeProject,
)
from app.schemas.run import CostUsage
from app.services.json_repair import JSONRepairError, repair_json_object
from app.services.llm_client import LLMClient

TECH_KEYWORDS = [
    "Python",
    "FastAPI",
    "React",
    "TypeScript",
    "JavaScript",
    "SQL",
    "PostgreSQL",
    "Redis",
    "Docker",
    "Kubernetes",
    "AWS",
    "LLM",
    "RAG",
    "Agent",
    "Playwright",
    "Pydantic",
]

EDUCATION_HINTS = [
    "University",
    "College",
    "School",
    "大学",
    "学院",
    "本科",
    "硕士",
    "Bachelor",
    "Master",
]
EXPERIENCE_HINTS = ["Intern", "Internship", "Experience", "实习", "工作经历", "公司"]
NICE_TO_HAVE_HINTS = ["Preferred", "Plus", "Nice", "加分", "优先"]
RESPONSIBILITY_HINTS = ["Responsibility", "Responsibilities", "职责", "负责"]
HIDDEN_KEYWORD_HINTS = [
    "communication",
    "ownership",
    "collaboration",
    "fast-paced",
    "沟通",
    "主动",
    "协作",
]
COMPANY_CONTEXT_HINTS = ["About", "Company", "团队", "业务", "公司"]


class ChatClient(Protocol):
    async def chat(self, request: LLMRequest) -> LLMResponse:
        pass


@dataclass(frozen=True)
class ResumeParseResult:
    profile: ResumeProfile
    metadata: ParseMetadata
    cost_usage: CostUsage | None = None


@dataclass(frozen=True)
class JobParseResult:
    profile: JobProfile
    metadata: ParseMetadata
    cost_usage: CostUsage | None = None


class StructuredParserService:
    def __init__(self, settings: Settings, llm_client: ChatClient | None = None) -> None:
        self.settings = settings
        self.llm_client = llm_client or LLMClient(settings)

    async def parse_resume(self, text: str) -> ResumeParseResult:
        if self.settings.llm_dry_run or not self.settings.llm_api_key:
            return self._heuristic_resume(text, dry_run=True)

        response = await self.llm_client.chat(
            LLMRequest(
                messages=[
                    ChatMessage(
                        role="system",
                        content=_structured_system_prompt(
                            agent_name="ResumeParserAgent",
                            model=ResumeProfile,
                            task=(
                                "Parse resume text into education, skills, projects, experiences, "
                                "keywords, evidence, inferred_fields, and needs_confirmation."
                            ),
                        ),
                    ),
                    ChatMessage(role="user", content=text),
                ],
                response_format={"type": "json_object"},
                temperature=0.1,
                max_tokens=1800,
            )
        )
        try:
            repaired = repair_json_object(response.content)
            profile = ResumeProfile.model_validate(repaired.data)
            return ResumeParseResult(
                profile=profile,
                metadata=ParseMetadata(
                    parser="resume",
                    source="llm_structured_output",
                    model=response.model,
                    dry_run=response.dry_run,
                    json_repaired=repaired.repaired,
                    issues=[
                        ParseIssue(
                            code=issue,
                            message=f"JSON repair step: {issue}",
                            severity="info",
                        )
                        for issue in repaired.issues
                    ],
                ),
                cost_usage=_cost_from_response(response),
            )
        except (JSONRepairError, ValidationError) as exc:
            fallback = self._heuristic_resume(text, dry_run=False)
            fallback.metadata.source = "heuristic_fallback"
            fallback.metadata.model = response.model
            fallback.metadata.issues.append(
                ParseIssue(
                    code="llm_output_validation_failed",
                    message=(
                        "LLM parser output failed validation and used heuristic "
                        f"fallback: {exc}"
                    ),
                )
            )
            return ResumeParseResult(
                profile=fallback.profile,
                metadata=fallback.metadata,
                cost_usage=_cost_from_response(response),
            )

    async def parse_job(self, text: str) -> JobParseResult:
        if self.settings.llm_dry_run or not self.settings.llm_api_key:
            return self._heuristic_job(text, dry_run=True)

        response = await self.llm_client.chat(
            LLMRequest(
                messages=[
                    ChatMessage(
                        role="system",
                        content=_structured_system_prompt(
                            agent_name="JobIntelAgent",
                            model=JobProfile,
                            task=(
                                "Parse JD text into company, title, hard_requirements, "
                                "nice_to_have, responsibilities, tech_keywords, hidden_keywords, "
                                "company_context, "
                                "evidence, inferred_fields, and needs_confirmation."
                            ),
                        ),
                    ),
                    ChatMessage(role="user", content=text),
                ],
                response_format={"type": "json_object"},
                temperature=0.1,
                max_tokens=1600,
            )
        )
        try:
            repaired = repair_json_object(response.content)
            profile = JobProfile.model_validate(repaired.data)
            return JobParseResult(
                profile=profile,
                metadata=ParseMetadata(
                    parser="job",
                    source="llm_structured_output",
                    model=response.model,
                    dry_run=response.dry_run,
                    json_repaired=repaired.repaired,
                    issues=[
                        ParseIssue(
                            code=issue,
                            message=f"JSON repair step: {issue}",
                            severity="info",
                        )
                        for issue in repaired.issues
                    ],
                ),
                cost_usage=_cost_from_response(response),
            )
        except (JSONRepairError, ValidationError) as exc:
            fallback = self._heuristic_job(text, dry_run=False)
            fallback.metadata.source = "heuristic_fallback"
            fallback.metadata.model = response.model
            fallback.metadata.issues.append(
                ParseIssue(
                    code="llm_output_validation_failed",
                    message=(
                        "LLM parser output failed validation and used heuristic "
                        f"fallback: {exc}"
                    ),
                )
            )
            return JobParseResult(
                profile=fallback.profile,
                metadata=fallback.metadata,
                cost_usage=_cost_from_response(response),
            )

    def _heuristic_resume(self, text: str, dry_run: bool) -> ResumeParseResult:
        lines = _clean_lines(text)
        skills = _unique([*_extract_explicit_skills(lines), *_extract_keywords(text)])
        education_lines = [
            line
            for line in lines
            if _contains_any(line, EDUCATION_HINTS)
        ]
        project_lines = [line for line in lines if _contains_any(line, ["Project", "项目"])]
        experience_lines = [
            line
            for line in lines
            if _contains_any(line, EXPERIENCE_HINTS)
        ]

        evidence = [
            EvidenceItem(field_path="skills", source_text=keyword, confidence=0.72)
            for keyword in skills[:12]
        ]
        education = [
            ResumeEducation(
                school=line[:120],
                evidence=[
                    EvidenceItem(field_path="education", source_text=line, confidence=0.68),
                ],
            )
            for line in education_lines[:3]
        ]
        projects = [
            ResumeProject(
                name=_trim_label(line, "Project", "项目")[:80] or "Project",
                description=line,
                skills=[keyword for keyword in skills if keyword.lower() in line.lower()],
                evidence=[EvidenceItem(field_path="projects", source_text=line, confidence=0.66)],
            )
            for line in project_lines[:5]
        ]
        experiences = [
            ResumeExperience(
                title=_trim_label(line, "Experience", "Internship", "实习", "工作经历")[:80]
                or "Experience",
                description=line,
                evidence=[
                    EvidenceItem(field_path="experiences", source_text=line, confidence=0.66),
                ],
            )
            for line in experience_lines[:5]
        ]

        issues = []
        needs_confirmation = []
        if not education:
            needs_confirmation.append("education")
            issues.append(
                ParseIssue(code="missing_education", message="No education line detected.")
            )
        if not skills:
            needs_confirmation.append("skills")
            issues.append(ParseIssue(code="missing_skills", message="No explicit skills detected."))

        return ResumeParseResult(
            profile=ResumeProfile(
                education=education,
                skills=skills,
                projects=projects,
                experiences=experiences,
                keywords=skills,
                evidence=evidence,
                needs_confirmation=needs_confirmation,
            ),
            metadata=ParseMetadata(
                parser="resume",
                source="heuristic_dry_run" if dry_run else "heuristic_fallback",
                model=None if dry_run else self.settings.llm_model,
                dry_run=dry_run,
                issues=issues,
            ),
        )

    def _heuristic_job(self, text: str, dry_run: bool) -> JobParseResult:
        lines = _clean_lines(text)
        company = _extract_labeled_value(lines, ["Company", "公司"])
        title = _extract_labeled_value(lines, ["Title", "Role", "岗位", "职位"])
        hard_requirements = [
            line
            for line in lines
            if _contains_any(line, ["Required", "Requirement", "Must", "要求", "必须", "任职"])
        ]
        nice_to_have = [
            line for line in lines if _contains_any(line, NICE_TO_HAVE_HINTS)
        ]
        responsibilities = [
            line for line in lines if _contains_any(line, RESPONSIBILITY_HINTS)
        ]
        tech_keywords = _extract_keywords(text)
        hidden_keywords = [
            keyword
            for keyword in HIDDEN_KEYWORD_HINTS
            if keyword.lower() in text.lower()
        ]
        context = [
            line for line in lines if _contains_any(line, COMPANY_CONTEXT_HINTS)
        ][:4]
        evidence = [
            EvidenceItem(field_path="hard_requirements", source_text=line, confidence=0.7)
            for line in hard_requirements[:8]
        ]

        issues = []
        needs_confirmation = []
        if not hard_requirements:
            needs_confirmation.append("hard_requirements")
            issues.append(
                ParseIssue(
                    code="missing_hard_requirements",
                    message="No hard requirement line detected.",
                )
            )
        if not title:
            needs_confirmation.append("title")
            issues.append(ParseIssue(code="missing_title", message="No explicit title detected."))

        return JobParseResult(
            profile=JobProfile(
                company=company,
                title=title,
                hard_requirements=hard_requirements,
                nice_to_have=nice_to_have,
                responsibilities=responsibilities,
                tech_keywords=tech_keywords,
                hidden_keywords=hidden_keywords,
                company_context=context,
                evidence=evidence,
                needs_confirmation=needs_confirmation,
            ),
            metadata=ParseMetadata(
                parser="job",
                source="heuristic_dry_run" if dry_run else "heuristic_fallback",
                model=None if dry_run else self.settings.llm_model,
                dry_run=dry_run,
                issues=issues,
            ),
        )


def _cost_from_response(response) -> CostUsage:
    return CostUsage(
        provider=response.provider,
        model=response.model,
        prompt_tokens=response.usage.prompt_tokens,
        completion_tokens=response.usage.completion_tokens,
        total_tokens=response.usage.total_tokens,
        latency_ms=response.latency_ms,
        estimated_cost_cny=response.estimated_cost_cny,
    )


def _structured_system_prompt(
    agent_name: str,
    model: type[BaseModel],
    task: str,
) -> str:
    schema = json.dumps(model.model_json_schema(), ensure_ascii=False)
    return (
        f"You are CareerPilot {agent_name}.\n"
        f"Task: {task}\n"
        "Return exactly one JSON object and no markdown, no code fence, no commentary.\n"
        "The JSON object must validate against this Pydantic JSON schema:\n"
        f"{schema}\n"
        "Rules:\n"
        "- Never invent education, company, dates, metrics, skills, awards, or outcomes.\n"
        "- Put direct facts only when the source text supports them.\n"
        "- Put uncertain or inferred fields into inferred_fields and needs_confirmation.\n"
        "- evidence.source_text must be an exact short excerpt from the source text.\n"
        "- Use [] for unknown arrays and null for unknown optional scalar fields.\n"
        "- Keep every item concise enough for later matching and resume rewriting.\n"
    )


def _clean_lines(text: str) -> list[str]:
    return [
        line.strip(" \t-•*")
        for line in text.splitlines()
        if line.strip(" \t-•*")
    ]


def _extract_explicit_skills(lines: list[str]) -> list[str]:
    skills: list[str] = []
    for line in lines:
        if _contains_any(line, ["Skills", "技能", "技术栈"]):
            _, _, value = line.partition(":")
            if not value:
                _, _, value = line.partition("：")
            skills.extend(_split_items(value or line))
    return skills


def _extract_labeled_value(lines: list[str], labels: list[str]) -> str | None:
    for line in lines:
        for label in labels:
            if line.lower().startswith(label.lower()):
                _, sep, value = line.partition(":")
                if not sep:
                    _, sep, value = line.partition("：")
                return value.strip()[:120] if value.strip() else None
    return None


def _extract_keywords(text: str) -> list[str]:
    return _unique([keyword for keyword in TECH_KEYWORDS if keyword.lower() in text.lower()])


def _split_items(value: str) -> list[str]:
    return [
        item.strip()
        for item in re.split(r"[,，、;/；|]", value)
        if item.strip()
    ]


def _trim_label(value: str, *labels: str) -> str:
    result = value
    for label in labels:
        result = re.sub(rf"^{re.escape(label)}\s*[:：-]?\s*", "", result, flags=re.IGNORECASE)
    return result.strip()


def _contains_any(value: str, needles: list[str]) -> bool:
    lowered = value.lower()
    return any(needle.lower() in lowered for needle in needles)


def _unique(values: list[str]) -> list[str]:
    seen: set[str] = set()
    result: list[str] = []
    for value in values:
        normalized = value.strip()
        key = normalized.lower()
        if normalized and key not in seen:
            result.append(normalized)
            seen.add(key)
    return result
