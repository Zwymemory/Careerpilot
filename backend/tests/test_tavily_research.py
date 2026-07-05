import pytest
from fastapi.testclient import TestClient

from app.core.config import get_settings
from app.main import create_app
from app.schemas.run import RunState
from app.services.run_store import run_store


@pytest.fixture
def client(monkeypatch: pytest.MonkeyPatch):
    monkeypatch.setenv("LLM_DRY_RUN", "true")
    monkeypatch.setenv("LLM_API_KEY", "")
    monkeypatch.setenv("JUDGE_DRY_RUN", "true")
    monkeypatch.setenv("JUDGE_API_KEY", "")
    monkeypatch.setenv("TAVILY_DRY_RUN", "true")
    monkeypatch.setenv("TAVILY_API_KEY", "")
    monkeypatch.setenv("API_ACCESS_TOKEN", "")
    monkeypatch.setenv("RATE_LIMIT_REQUESTS_PER_MINUTE", "0")
    run_store.clear()
    get_settings.cache_clear()
    with TestClient(create_app()) as test_client:
        yield test_client
    run_store.clear()
    get_settings.cache_clear()


def test_tavily_research_endpoint_dry_run_creates_trace(client: TestClient) -> None:
    response = client.post(
        "/api/research/search",
        json={
            "user_id": "test-user",
            "query": "AI Agent 实习生 FastAPI Python 真实技术面试题",
            "max_results": 3,
        },
    )

    assert response.status_code == 201
    body = response.json()
    assert body["provider"] == "tavily"
    assert body["dry_run"] is True
    assert body["results"]
    assert body["issues"] == ["tavily_dry_run_or_missing_key"]

    runs = [run for run in run_store.list_runs() if run.user_id == "test-user"]
    assert len(runs) == 1
    run = run_store.get_run(runs[0].run_id)
    assert run is not None
    assert run.state == RunState.COMPLETED
    assert run.steps[0].name == "tavily_search"
    assert run.checkpoints[0].name == "tavily_search"
