import pytest
from fastapi.testclient import TestClient

from app.core.config import get_settings
from app.main import create_app
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


def test_provider_balances_returns_safe_estimates(client: TestClient) -> None:
    response = client.get("/api/provider-balances")

    assert response.status_code == 200
    body = response.json()
    providers = {provider["provider"]: provider for provider in body["providers"]}
    assert set(providers) == {"deepseek", "openai", "tavily"}
    assert providers["deepseek"]["live"] is False
    assert providers["openai"]["live"] is False
    assert providers["tavily"]["estimated_calls_remaining"] > 0
    assert body["docs"]["deepseek"].startswith("https://")
    assert "api_key" not in str(body).lower()
