import pytest
from fastapi.testclient import TestClient

from app.core.config import get_settings
from app.main import create_app
from app.schemas.application import ApplicationCreateRequest
from app.schemas.parser import (
    EvidenceItem,
    JobProfile,
    ResumeEducation,
    ResumeProfile,
    ResumeProject,
)
from app.schemas.run import RunState
from app.services.application_crm import application_crm_agent, application_store
from app.services.interview_coach_agent import InterviewCoachAgent
from app.services.matching_agent import MatchingAgent
from app.services.resume_rewrite_agent import ResumeRewriteAgent
from app.services.run_store import run_store


@pytest.fixture
def client(monkeypatch: pytest.MonkeyPatch):
    monkeypatch.setenv("LLM_DRY_RUN", "true")
    monkeypatch.setenv("LLM_API_KEY", "")
    application_store.clear()
    get_settings.cache_clear()
    with TestClient(create_app()) as test_client:
        yield test_client
    application_store.clear()
    get_settings.cache_clear()


def _resume_profile() -> ResumeProfile:
    return ResumeProfile(
        education=[ResumeEducation(school="示例大学", major="计算机科学与技术")],
        skills=["Python", "FastAPI", "React", "RAG"],
        projects=[
            ResumeProject(
                name="CareerPilot",
                description="可追踪 AI Agent 求职工作流，包含匹配、改写、面试准备和 CRM。",
                skills=["Python", "FastAPI", "React", "AI Agent"],
                evidence=[
                    EvidenceItem(
                        field_path="projects[0].description",
                        source_text="CareerPilot 包含匹配、改写、面试准备和 CRM。",
                        confidence=0.88,
                    )
                ],
            )
        ],
        keywords=["Python", "FastAPI", "React", "AI Agent"],
        evidence=[
            EvidenceItem(field_path="skills", source_text="Python", confidence=0.82),
            EvidenceItem(field_path="skills", source_text="FastAPI", confidence=0.82),
        ],
    )


def _job_profile() -> JobProfile:
    return JobProfile(
        company="示例 AI",
        title="AI Agent 全栈开发工程师",
        hard_requirements=["Python", "FastAPI", "SQL", "Function Calling"],
        nice_to_have=["React", "RAG"],
        responsibilities=["构建具备任务规划、工具调用和执行校验能力的 AI Agent 系统。"],
        tech_keywords=["Python", "FastAPI", "SQL", "Function Calling", "React", "RAG"],
        hidden_keywords=["Agent 工作流"],
    )


def _payload() -> dict:
    resume = _resume_profile()
    job = _job_profile()
    match = MatchingAgent().match(resume, job)
    rewrite = ResumeRewriteAgent().create_draft(resume, job, match)
    interview = InterviewCoachAgent().create_pack(resume, job, match, rewrite)
    return {
        "user_id": "test-user",
        "job_profile": job.model_dump(mode="json"),
        "resume_profile": resume.model_dump(mode="json"),
        "match_profile": match.model_dump(mode="json"),
        "rewrite_draft": rewrite.model_dump(mode="json"),
        "interview_pack": interview.model_dump(mode="json"),
        "job_url": "https://example.com/jobs/agent",
        "source_run_ids": ["run_parse", "run_match", "run_interview"],
    }


def test_application_crm_agent_creates_memory_record() -> None:
    application_store.clear()
    payload = ApplicationCreateRequest.model_validate(_payload())
    record = application_crm_agent.create_record(payload)

    assert record.application_id.startswith("application_")
    assert record.company == "示例 AI"
    assert record.match_score is not None
    assert record.interview_score is not None
    assert record.memories
    assert record.tasks
    assert any(memory.category == "gap" for memory in record.memories)


def test_create_application_endpoint_records_tasks_and_trace(client: TestClient) -> None:
    response = client.post("/api/applications", json=_payload())

    assert response.status_code == 201
    body = response.json()
    record = body["record"]
    assert record["company"] == "示例 AI"
    assert record["title"] == "AI Agent 全栈开发工程师"
    assert record["match_score"] is not None
    assert record["interview_score"] is not None
    assert record["memories"]
    assert record["tasks"]
    assert "SQL" in " ".join(task["title"] + task["reason"] for task in record["tasks"])

    run = run_store.get_run(body["run_id"])
    assert run is not None
    assert run.state == RunState.COMPLETED
    assert run.steps[0].agent_name == "ApplicationCRMAgent"
    assert run.checkpoints[0].name == "application_record"


def test_add_feedback_updates_memory_and_status(client: TestClient) -> None:
    created = client.post("/api/applications", json=_payload()).json()
    application_id = created["record"]["application_id"]

    response = client.post(
        f"/api/applications/{application_id}/feedback",
        json={
            "user_id": "test-user",
            "stage": "一面",
            "feedback_text": "项目讲得清楚，但 SQL 和 Function Calling 细节需要补强。",
            "strengths": ["Run Trace 讲解清晰"],
            "concerns": ["SQL 深度不足"],
            "follow_up_tasks": ["补一段 SQL 查询练习", "准备 Function Calling 调用链讲法"],
        },
    )

    assert response.status_code == 201
    body = response.json()
    record = body["record"]
    assert record["status"] == "INTERVIEWING"
    assert len(record["feedback"]) == 1
    assert any("SQL 深度不足" in memory["text"] for memory in record["memories"])
    assert any("Function Calling" in task["title"] for task in record["tasks"])

    list_response = client.get("/api/applications?user_id=test-user")
    assert list_response.status_code == 200
    assert list_response.json()[0]["application_id"] == application_id
