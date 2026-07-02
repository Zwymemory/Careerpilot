import anyio
import pytest
from fastapi.testclient import TestClient

from app.core.config import Settings, get_settings
from app.main import create_app
from app.schemas.llm import LLMResponse, LLMUsage
from app.schemas.run import RunState
from app.services.json_repair import repair_json_object
from app.services.run_store import run_store
from app.services.structured_parser import StructuredParserService


class FakeLLMClient:
    def __init__(self, content: str) -> None:
        self.content = content
        self.last_system_prompt: str | None = None

    async def chat(self, request):
        self.last_system_prompt = request.messages[0].content
        return LLMResponse(
            provider="fake",
            model="fake-structured-model",
            content=self.content,
            usage=LLMUsage(prompt_tokens=100, completion_tokens=60, total_tokens=160),
            latency_ms=12,
            estimated_cost_cny=0.001,
        )


@pytest.fixture
def client(monkeypatch: pytest.MonkeyPatch):
    monkeypatch.setenv("LLM_DRY_RUN", "true")
    monkeypatch.setenv("LLM_API_KEY", "")
    get_settings.cache_clear()
    with TestClient(create_app()) as test_client:
        yield test_client
    get_settings.cache_clear()


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


def test_parse_resume_returns_profile_and_trace(client: TestClient) -> None:
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


def test_parse_job_returns_requirements_and_trace(client: TestClient) -> None:
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


def test_resume_parser_accepts_llm_structured_output_with_repair() -> None:
    fake_client = FakeLLMClient(
        """
        ```json
        {
          "skills": ["Python", "FastAPI"],
          "projects": [
            {
              "name": "CareerPilot",
              "description": "CareerPilot built a traceable Agent workflow.",
              "skills": ["Python", "FastAPI"],
              "evidence": [
                {
                  "field_path": "projects",
                  "source_text": "CareerPilot built a traceable Agent workflow.",
                  "confidence": 0.9,
                  "is_inferred": false
                }
              ]
            }
          ],
        }
        ```
        """
    )
    settings = Settings(llm_dry_run=False, llm_api_key="test-key")
    service = StructuredParserService(settings, llm_client=fake_client)

    result = anyio.run(
        service.parse_resume,
        "Project: CareerPilot built a traceable Agent workflow.",
    )

    assert result.metadata.source == "llm_structured_output"
    assert result.metadata.json_repaired is True
    assert result.metadata.model == "fake-structured-model"
    assert result.cost_usage is not None
    assert result.profile.skills == ["Python", "FastAPI"]
    assert result.profile.projects[0].name == "CareerPilot"
    assert fake_client.last_system_prompt is not None
    assert "Pydantic JSON schema" in fake_client.last_system_prompt
    assert "Never invent" in fake_client.last_system_prompt
