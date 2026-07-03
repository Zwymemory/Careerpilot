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
        education=[ResumeEducation(school="Example University", major="Computer Science")],
        skills=["Python", "FastAPI", "React"],
        projects=[
            ResumeProject(
                name="CareerPilot",
                description="Built a traceable Agent workflow with FastAPI and React.",
                skills=["Python", "FastAPI", "React"],
                evidence=[
                    EvidenceItem(
                        field_path="projects",
                        source_text="Built a traceable Agent workflow with FastAPI and React.",
                        confidence=0.86,
                    )
                ],
            )
        ],
        keywords=["Python", "FastAPI", "React", "Agent"],
        evidence=[
            EvidenceItem(field_path="skills", source_text="Python", confidence=0.8),
            EvidenceItem(field_path="skills", source_text="FastAPI", confidence=0.8),
            EvidenceItem(field_path="skills", source_text="React", confidence=0.8),
        ],
    )


def _job_profile() -> JobProfile:
    return JobProfile(
        company="Example AI",
        title="AI Agent Backend Intern",
        hard_requirements=["Required: Python, FastAPI, SQL"],
        nice_to_have=["Preferred: React, TypeScript"],
        responsibilities=["Build FastAPI services for traceable LLM workflow execution."],
        tech_keywords=["Python", "FastAPI", "SQL", "React", "TypeScript"],
        hidden_keywords=["communication"],
    )


def _match_profile() -> MatchProfile:
    return MatchingAgent().match(_resume_profile(), _job_profile())


def test_resume_rewrite_agent_creates_evidence_locked_draft() -> None:
    draft = ResumeRewriteAgent().create_draft(
        _resume_profile(),
        _job_profile(),
        _match_profile(),
    )

    assert draft.approval_status == "WAITING_APPROVAL"
    assert draft.changes
    assert any(change.evidence for change in draft.changes if change.section != "evidence_needed")
    assert any(change.section == "evidence_needed" for change in draft.changes)
    assert any("SQL" in warning for warning in draft.risk_warnings)
    assert "CareerPilot Tailored Resume Draft" in draft.markdown


def test_rewrite_endpoint_requires_approval_before_export(client: TestClient) -> None:
    response = client.post(
        "/api/rewrite-drafts",
        json={
            "user_id": "test-user",
            "resume_profile": _resume_profile().model_dump(mode="json"),
            "job_profile": _job_profile().model_dump(mode="json"),
            "match_profile": _match_profile().model_dump(mode="json"),
        },
    )

    assert response.status_code == 201
    body = response.json()
    run_id = body["run_id"]
    assert body["draft"]["approval_status"] == "WAITING_APPROVAL"

    run = run_store.get_run(run_id)
    assert run is not None
    assert run.state == RunState.WAITING_APPROVAL
    assert run.steps[-1].name == "human_approval"
    assert run.checkpoints[0].name == "rewrite_draft"

    early_export = client.get(f"/api/rewrite-drafts/{run_id}/export.pdf")
    assert early_export.status_code == 409

    approval = client.post(
        f"/api/rewrite-drafts/{run_id}/approve",
        json={"approved_by": "mentor", "notes": "Looks accurate."},
    )
    assert approval.status_code == 200
    approved_run = approval.json()["run"]
    assert approved_run["state"] == "COMPLETED"
    assert approved_run["checkpoints"][-1]["name"] == "rewrite_approval"

    pdf = client.get(f"/api/rewrite-drafts/{run_id}/export.pdf")
    assert pdf.status_code == 200
    assert pdf.content.startswith(b"%PDF")
