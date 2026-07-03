import pytest
from fastapi.testclient import TestClient

from app.core.config import get_settings
from app.main import create_app
from app.schemas.parser import (
    EvidenceItem,
    JobProfile,
    ResumeEducation,
    ResumeProfile,
    ResumeProject,
)
from app.schemas.run import RunState
from app.services.matching_agent import MatchingAgent
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
                school="Example University",
                major="Computer Science",
                evidence=[
                    EvidenceItem(
                        field_path="education",
                        source_text="Example University Computer Science",
                        confidence=0.8,
                    )
                ],
            )
        ],
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
        evidence=[
            EvidenceItem(
                field_path="hard_requirements",
                source_text="Required: Python, FastAPI, SQL",
                confidence=0.78,
            )
        ],
    )


def test_matching_agent_scores_evidence_and_gaps() -> None:
    match = MatchingAgent().match(_resume_profile(), _job_profile())

    assert match.overall_score >= 55
    assert "Python" in match.matched_keywords
    assert "FastAPI" in match.matched_keywords
    assert "SQL" in match.missing_keywords
    assert any("SQL" in gap.requirement or "SQL" in gap.suggested_action for gap in match.gaps)
    assert any(
        priority.priority == "P0" and "SQL" in priority.item
        for priority in match.priority_ranking
    )
    assert match.evidence_mapping
    assert match.evidence_mapping[0].evidence


def test_match_endpoint_creates_trace(client: TestClient) -> None:
    response = client.post(
        "/api/matches",
        json={
            "user_id": "test-user",
            "resume_profile": _resume_profile().model_dump(mode="json"),
            "job_profile": _job_profile().model_dump(mode="json"),
        },
    )

    assert response.status_code == 201
    body = response.json()
    assert body["match"]["overall_score"] >= 55
    assert "SQL" in body["match"]["missing_keywords"]

    run = run_store.get_run(body["run_id"])
    assert run is not None
    assert run.state == RunState.COMPLETED
    assert run.steps[0].name == "match"
    assert run.steps[0].agent_name == "MatchAgent"
    assert run.checkpoints[0].name == "match_profile"
