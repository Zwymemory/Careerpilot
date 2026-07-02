from fastapi.testclient import TestClient

from app.main import app
from app.schemas.run import RunState
from app.services.json_repair import repair_json_object
from app.services.run_store import run_store

client = TestClient(app)


def test_json_repair_handles_markdown_fence_and_trailing_comma() -> None:
    repaired = repair_json_object(
        """
        Here is the object:
        ```json
        {"skills": ["Python", "FastAPI",],}
        ```
        """
    )

    assert repaired.data == {"skills": ["Python", "FastAPI"]}
    assert repaired.repaired is True
    assert "extracted_markdown_json_fence" in repaired.issues


def test_parse_resume_returns_profile_and_trace() -> None:
    response = client.post(
        "/api/parsers/resume",
        json={
            "user_id": "test-user",
            "source_name": "resume.md",
            "text": """
            Education: Example University Bachelor of Computer Science
            Skills: Python, FastAPI, React, TypeScript, PostgreSQL
            Project: CareerPilot - built a FastAPI run trace backend and React UI.
            Internship: Backend Intern at Example AI, worked on LLM workflow tooling.
            """,
        },
    )

    assert response.status_code == 201
    body = response.json()
    assert "Python" in body["profile"]["skills"]
    assert "FastAPI" in body["profile"]["skills"]
    assert body["metadata"]["source"] == "heuristic_dry_run"
    assert body["metadata"]["dry_run"] is True

    run = run_store.get_run(body["run_id"])
    assert run is not None
    assert run.state == RunState.COMPLETED
    assert run.steps[0].name == "parse_resume"
    assert run.steps[0].agent_name == "ResumeParserAgent"


def test_parse_job_returns_requirements_and_trace() -> None:
    response = client.post(
        "/api/parsers/job",
        json={
            "user_id": "test-user",
            "text": """
            Company: Example AI
            Title: AI Agent Backend Intern
            Responsibilities: Build FastAPI services for traceable LLM workflow execution.
            Required: Python, FastAPI, SQL, Docker, and strong communication.
            Preferred: React, TypeScript, Redis, Playwright.
            """,
        },
    )

    assert response.status_code == 201
    body = response.json()
    assert body["profile"]["company"] == "Example AI"
    assert body["profile"]["title"] == "AI Agent Backend Intern"
    assert body["profile"]["hard_requirements"]
    assert "FastAPI" in body["profile"]["tech_keywords"]
    assert "communication" in body["profile"]["hidden_keywords"]

    run = run_store.get_run(body["run_id"])
    assert run is not None
    assert run.state == RunState.COMPLETED
    assert run.steps[0].name == "parse_job"
    assert run.steps[0].agent_name == "JobIntelAgent"
