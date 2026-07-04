import pytest
from fastapi.testclient import TestClient

from app.core.config import get_settings
from app.main import create_app
from app.schemas.application import ApplicationCreateRequest
from app.schemas.eval import EvalRunRequest
from app.schemas.parser import (
    EvidenceItem,
    JobProfile,
    ResumeEducation,
    ResumeProfile,
    ResumeProject,
)
from app.schemas.rewrite import ResumeRewriteDraft, RewriteChange
from app.schemas.run import RunState
from app.services.application_crm import application_crm_agent, application_store
from app.services.eval_harness import eval_harness, eval_report_store
from app.services.interview_coach_agent import InterviewCoachAgent
from app.services.matching_agent import MatchingAgent
from app.services.resume_rewrite_agent import ResumeRewriteAgent
from app.services.run_store import run_store


@pytest.fixture
def client(monkeypatch: pytest.MonkeyPatch):
    monkeypatch.setenv("LLM_DRY_RUN", "true")
    monkeypatch.setenv("LLM_API_KEY", "")
    monkeypatch.setenv("JUDGE_DRY_RUN", "true")
    monkeypatch.setenv("JUDGE_API_KEY", "")
    monkeypatch.setenv("API_ACCESS_TOKEN", "")
    monkeypatch.setenv("RATE_LIMIT_REQUESTS_PER_MINUTE", "0")
    application_store.clear()
    eval_report_store.clear()
    run_store.clear()
    get_settings.cache_clear()
    with TestClient(create_app()) as test_client:
        yield test_client
    application_store.clear()
    eval_report_store.clear()
    run_store.clear()
    get_settings.cache_clear()


def _resume_profile() -> ResumeProfile:
    return ResumeProfile(
        education=[ResumeEducation(school="示例大学", major="计算机科学与技术")],
        skills=["Python", "FastAPI", "React", "TypeScript", "RAG", "Function Calling"],
        projects=[
            ResumeProject(
                name="CareerPilot",
                description="可追踪 AI Agent 求职工作流，包含匹配、改写、面试准备、CRM 和评测。",
                skills=["Python", "FastAPI", "React", "AI Agent"],
                evidence=[
                    EvidenceItem(
                        field_path="projects[0].description",
                        source_text="CareerPilot 包含匹配、改写、面试准备、CRM 和评测。",
                        confidence=0.9,
                    )
                ],
            )
        ],
        keywords=["Python", "FastAPI", "React", "AI Agent", "Eval Harness"],
        evidence=[
            EvidenceItem(field_path="skills", source_text="Python", confidence=0.85),
            EvidenceItem(field_path="skills", source_text="FastAPI", confidence=0.85),
            EvidenceItem(field_path="skills", source_text="React", confidence=0.82),
        ],
    )


def _job_profile() -> JobProfile:
    return JobProfile(
        company="示例 AI",
        title="AI Agent 全栈开发工程师",
        hard_requirements=["Python", "FastAPI", "SQL", "Function Calling"],
        nice_to_have=["React", "RAG", "Eval Harness"],
        responsibilities=["构建具备任务规划、工具调用、质量评测和执行校验能力的 AI Agent 系统。"],
        tech_keywords=[
            "Python",
            "FastAPI",
            "SQL",
            "Function Calling",
            "React",
            "RAG",
            "Eval Harness",
        ],
        hidden_keywords=["Agent 工作流", "QualityGate"],
        evidence=[
            EvidenceItem(
                field_path="tech_keywords",
                source_text="Python、FastAPI、SQL、Function Calling、React、RAG、Eval Harness",
                confidence=0.86,
            )
        ],
    )


def _eval_payload() -> dict:
    resume = _resume_profile()
    job = _job_profile()
    match = MatchingAgent().match(resume, job)
    rewrite = ResumeRewriteAgent().create_draft(resume, job, match)
    interview = InterviewCoachAgent().create_pack(resume, job, match, rewrite)
    application = application_crm_agent.create_record(
        ApplicationCreateRequest.model_validate(
            {
                "user_id": "test-user",
                "resume_profile": resume.model_dump(mode="json"),
                "job_profile": job.model_dump(mode="json"),
                "match_profile": match.model_dump(mode="json"),
                "rewrite_draft": rewrite.model_dump(mode="json"),
                "interview_pack": interview.model_dump(mode="json"),
                "source_run_ids": ["run_parse", "run_match", "run_rewrite"],
            }
        )
    )
    return {
        "user_id": "test-user",
        "case_name": "AI Agent 全链路评测",
        "judge_mode": "llm_as_judge_dry_run",
        "min_score": 70,
        "expected_keywords": ["Python", "FastAPI", "Function Calling"],
        "resume_profile": resume.model_dump(mode="json"),
        "job_profile": job.model_dump(mode="json"),
        "match_profile": match.model_dump(mode="json"),
        "rewrite_draft": rewrite.model_dump(mode="json"),
        "interview_pack": interview.model_dump(mode="json"),
        "application_record": application.model_dump(mode="json"),
    }


def test_eval_harness_endpoint_generates_quality_report(client: TestClient) -> None:
    response = client.post("/api/evals", json=_eval_payload())

    assert response.status_code == 201
    body = response.json()
    report = body["report"]
    assert report["overall_score"] >= 70
    assert report["gate"]["decision"] in {"PASS", "WARN"}
    assert "Eval Harness" in report["html_report"]
    assert any(rule["rule_id"] == "judge.llm_dry_run" for rule in report["rule_results"])

    run = run_store.get_run(body["run_id"])
    assert run is not None
    assert run.state == RunState.COMPLETED
    assert run.steps[0].agent_name == "EvalHarnessAgent"
    assert run.checkpoints[0].name == "eval_report"

    html_response = client.get(f"/api/evals/{report['report_id']}/report.html")
    assert html_response.status_code == 200
    assert "QualityGate" in html_response.text


def test_eval_harness_llm_judge_falls_back_when_not_configured(client: TestClient) -> None:
    payload = _eval_payload()
    payload["judge_mode"] = "llm_as_judge"

    response = client.post("/api/evals", json=payload)

    assert response.status_code == 201
    report = response.json()["report"]
    assert report["judge_cost_usage"] is None
    assert any(rule["rule_id"] == "judge.llm_not_configured" for rule in report["rule_results"])


def test_production_readiness_and_cost_summary(client: TestClient) -> None:
    readiness = client.get("/api/production/readiness")
    assert readiness.status_code == 200
    assert readiness.json()["auth_enabled"] is False

    response = client.post("/api/evals", json=_eval_payload())
    assert response.status_code == 201

    costs = client.get("/api/production/cost-summary")
    assert costs.status_code == 200
    body = costs.json()
    assert body["run_count"] >= 1
    assert "by_model" in body


def test_api_access_token_protects_non_health_routes(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("LLM_DRY_RUN", "true")
    monkeypatch.setenv("LLM_API_KEY", "")
    monkeypatch.setenv("JUDGE_DRY_RUN", "true")
    monkeypatch.setenv("JUDGE_API_KEY", "")
    monkeypatch.setenv("API_ACCESS_TOKEN", "test-token")
    monkeypatch.setenv("RATE_LIMIT_REQUESTS_PER_MINUTE", "0")
    get_settings.cache_clear()

    with TestClient(create_app()) as test_client:
        assert test_client.get("/api/health").status_code == 200
        assert test_client.get("/api/runs").status_code == 401
        assert test_client.get("/api/runs", headers={"X-API-Key": "test-token"}).status_code == 200

    get_settings.cache_clear()


def test_quality_gate_blocks_unsupported_rewrite() -> None:
    draft = ResumeRewriteDraft(
        draft_id="draft_risky",
        company="示例 AI",
        title="AI Agent 全栈开发工程师",
        headline="AI Agent 工程师 | 百万级系统负责人",
        target_keywords=["Python", "FastAPI"],
        changes=[
            RewriteChange(
                change_id="change_1",
                section="summary",
                original_text="[new line]",
                revised_text="主导百万级 AI Agent 平台并显著提升线上转化率。",
                rationale="这条内容没有真实证据，应该被 QualityGate 阻断。",
                evidence=[],
                risk_level="low",
            )
        ],
        markdown="## 简历改写\n主导百万级 AI Agent 平台并显著提升线上转化率。",
    )

    report = eval_harness.evaluate(
        EvalRunRequest.model_validate(
            {
                "user_id": "test-user",
                "case_name": "风险改写评测",
                "rewrite_draft": draft.model_dump(mode="json"),
            }
        )
    )

    assert report.gate.decision == "BLOCK"
    assert not report.gate.passed
    assert any(rule.rule_id == "rewrite.evidence.lock" for rule in report.rule_results)
