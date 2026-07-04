import pytest
from fastapi.testclient import TestClient

from app.core.config import get_settings
from app.main import create_app
from app.services.job_collector import extract_html_text


@pytest.fixture
def client(monkeypatch: pytest.MonkeyPatch):
    monkeypatch.setenv("LLM_DRY_RUN", "true")
    monkeypatch.setenv("LLM_API_KEY", "")
    get_settings.cache_clear()
    with TestClient(create_app()) as test_client:
        yield test_client
    get_settings.cache_clear()


def test_collect_job_from_text_creates_snapshot_and_profile(client: TestClient) -> None:
    response = client.post(
        "/api/job-collector",
        json={
            "user_id": "local-user",
            "source_name": "示例岗位",
            "text": (
                "公司：示例 AI\n"
                "岗位名称：AI Agent 全栈开发工程师\n"
                "任职要求：Python、FastAPI、SQL、REST API、Agent 工作流、Function Calling\n"
                "加分项：React、TypeScript、RAG、Redis、Docker\n"
                "岗位职责：负责 AI Agent 后端服务、RAG 链路和前端交互界面。"
            ),
        },
    )

    assert response.status_code == 201
    body = response.json()
    assert body["snapshot"]["source_type"] == "text"
    assert body["snapshot"]["text_hash"]
    assert body["snapshot"]["safety"]["allowed"] is True
    assert body["profile"]["company"] == "示例 AI"
    assert body["profile"]["title"] == "AI Agent 全栈开发工程师"
    assert "Python" in body["profile"]["tech_keywords"]


def test_collect_job_from_html_strips_scripts() -> None:
    title, text = extract_html_text(
        """
        <html>
          <head><title>AI Agent 实习生</title><script>window.secret = true</script></head>
          <body>
            <nav>收藏 分享</nav>
            <main>
              <h1>AI Agent 实习生</h1>
              <p>公司：示例 AI</p>
              <p>任职要求：Python、FastAPI、Playwright</p>
            </main>
          </body>
        </html>
        """
    )

    assert title == "AI Agent 实习生"
    assert "Python" in text
    assert "window.secret" not in text


def test_collect_job_blocks_localhost_url(client: TestClient) -> None:
    response = client.post(
        "/api/job-collector",
        json={"url": "http://localhost:5174/jobs/1"},
    )

    assert response.status_code == 400
    assert "Localhost" in response.json()["detail"]
