import pytest
from fastapi.testclient import TestClient

from app.core.config import get_settings
from app.main import create_app
from app.schemas.matching import MatchProfile
from app.schemas.parser import (
    EvidenceItem,
    JobProfile,
    ResumeEducation,
    ResumeProfile,
    ResumeProject,
)
from app.schemas.run import RunState
from app.services.interview_coach_agent import InterviewCoachAgent
from app.services.matching_agent import MatchingAgent
from app.services.resume_rewrite_agent import ResumeRewriteAgent
from app.services.run_store import run_store


@pytest.fixture
def client(monkeypatch: pytest.MonkeyPatch):
    monkeypatch.setenv("LLM_DRY_RUN", "true")
    monkeypatch.setenv("LLM_API_KEY", "")
    get_settings.cache_clear()
    with TestClient(create_app()) as test_client:
        yield test_client
    get_settings.cache_clear()


def _resume_profile() -> ResumeProfile:
    return ResumeProfile(
        education=[
            ResumeEducation(
                school="示例大学",
                major="计算机科学与技术",
                evidence=[
                    EvidenceItem(
                        field_path="education",
                        source_text="示例大学，计算机科学与技术本科。",
                        confidence=0.82,
                    )
                ],
            )
        ],
        skills=["Python", "FastAPI", "React", "TypeScript", "RAG"],
        projects=[
            ResumeProject(
                name="CareerPilot",
                description=(
                    "可追踪 AI Agent 求职工作流，使用 FastAPI 和 React 实现 Run Trace、"
                    "Checkpoint、成本记录、人工审批、匹配分析和简历改写。"
                ),
                skills=["Python", "FastAPI", "React", "AI Agent", "RAG"],
                evidence=[
                    EvidenceItem(
                        field_path="projects[0].description",
                        source_text=(
                            "CareerPilot 使用 FastAPI 和 React 实现 Run Trace、Checkpoint、"
                            "成本记录、人工审批、匹配分析和简历改写。"
                        ),
                        confidence=0.9,
                    )
                ],
            )
        ],
        keywords=["Python", "FastAPI", "React", "AI Agent", "RAG"],
        evidence=[
            EvidenceItem(field_path="skills", source_text="Python", confidence=0.82),
            EvidenceItem(field_path="skills", source_text="FastAPI", confidence=0.82),
            EvidenceItem(field_path="skills", source_text="React", confidence=0.8),
            EvidenceItem(field_path="skills", source_text="RAG", confidence=0.76),
        ],
    )


def _job_profile() -> JobProfile:
    return JobProfile(
        company="示例 AI",
        title="AI Agent 全栈开发工程师",
        hard_requirements=["Python", "FastAPI", "SQL", "Function Calling"],
        nice_to_have=["React", "TypeScript", "RAG", "Docker"],
        responsibilities=[
            "构建具备任务规划、工具调用和执行校验能力的 AI Agent 系统。",
            "从后端 API 设计到前端 AI 交互界面完成全链路开发。",
        ],
        tech_keywords=["Python", "FastAPI", "SQL", "Function Calling", "React", "RAG"],
        hidden_keywords=["Agent 工作流", "REST API", "可视化交互"],
    )


def _match_profile() -> MatchProfile:
    return MatchingAgent().match(_resume_profile(), _job_profile())


def test_interview_coach_agent_creates_evidence_locked_pack() -> None:
    resume = _resume_profile()
    job = _job_profile()
    match = _match_profile()
    rewrite = ResumeRewriteAgent().create_draft(resume, job, match)

    pack = InterviewCoachAgent().create_pack(resume, job, match, rewrite)

    assert pack.predicted_questions
    assert pack.project_followups
    assert pack.star_answers
    assert pack.knowledge_points
    assert pack.mock_score.overall_score > 50
    assert "CareerPilot 面试准备包" in pack.markdown
    assert any(question.category == "gap" for question in pack.predicted_questions)
    assert any("技术难点" in question.question for question in pack.predicted_questions)
    assert not any("如何满足" in question.question for question in pack.predicted_questions)
    assert any(
        "SQL" in warning or "Function Calling" in warning
        for warning in pack.evidence_warnings
    )
    assert all(answer.evidence or answer.risk_notes for answer in pack.star_answers)


def test_interview_pack_endpoint_creates_trace(client: TestClient) -> None:
    resume = _resume_profile()
    job = _job_profile()
    match = _match_profile()
    rewrite = ResumeRewriteAgent().create_draft(resume, job, match)

    response = client.post(
        "/api/interview-packs",
        json={
            "user_id": "test-user",
            "resume_profile": resume.model_dump(mode="json"),
            "job_profile": job.model_dump(mode="json"),
            "match_profile": match.model_dump(mode="json"),
            "rewrite_draft": rewrite.model_dump(mode="json"),
        },
    )

    assert response.status_code == 201
    body = response.json()
    assert body["pack"]["mock_score"]["overall_score"] > 50
    assert body["pack"]["predicted_questions"]
    assert body["pack"]["star_answers"]

    run = run_store.get_run(body["run_id"])
    assert run is not None
    assert run.state == RunState.COMPLETED
    assert run.steps[0].name == "interview_generate"
    assert run.steps[0].agent_name == "InterviewCoachAgent"
    assert run.checkpoints[0].name == "interview_pack"
