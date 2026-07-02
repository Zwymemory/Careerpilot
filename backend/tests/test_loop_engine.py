import anyio
import pytest
from fastapi.testclient import TestClient

from app.core.config import Settings, get_settings
from app.main import create_app
from app.schemas.loop import LoopPhase
from app.schemas.run import EventType, RunState
from app.services.loop_engine import LoopEngine, LoopEngineError
from app.services.run_store import RunStore

RESUME_TEXT = """
Education: Example University
Skills: Python, FastAPI, React
Project: CareerPilot built a traceable Agent workflow.
"""

JOB_TEXT = """
Company: Example AI
Title: AI Agent Backend Intern
Required: Python, FastAPI, SQL
Preferred: React, TypeScript
"""


@pytest.fixture
def dry_settings() -> Settings:
    return Settings(llm_dry_run=True, llm_api_key=None)


@pytest.fixture
def dry_client(monkeypatch: pytest.MonkeyPatch):
    monkeypatch.setenv("LLM_DRY_RUN", "true")
    monkeypatch.setenv("LLM_API_KEY", "")
    get_settings.cache_clear()
    with TestClient(create_app()) as test_client:
        yield test_client
    get_settings.cache_clear()


def test_loop_engine_waits_for_approval_and_commits(dry_settings: Settings) -> None:
    store = RunStore()
    engine = LoopEngine(dry_settings, store)

    run = anyio.run(
        engine.start,
        "u1",
        "Create a traceable matching preparation loop.",
        RESUME_TEXT,
        JOB_TEXT,
        "loop-key-1",
    )

    assert run.state == RunState.WAITING_APPROVAL
    assert run.current_step == "human_approval"
    assert [checkpoint.phase for checkpoint in run.checkpoints] == [
        LoopPhase.PLAN,
        LoopPhase.EXECUTE,
        LoopPhase.VERIFY,
        LoopPhase.REFLECT,
        LoopPhase.HUMAN_APPROVAL,
    ]

    committed = engine.approve(run.run_id, approved_by="u1", notes="Looks good.")

    assert committed.state == RunState.COMPLETED
    assert committed.current_step == "commit"
    assert committed.checkpoints[-1].phase == LoopPhase.COMMIT
    assert any(event.event_type == EventType.APPROVAL_COMPLETED for event in committed.events)


def test_loop_engine_idempotency_key_returns_existing_run(dry_settings: Settings) -> None:
    store = RunStore()
    engine = LoopEngine(dry_settings, store)

    first = anyio.run(
        engine.start,
        "u1",
        "Create a traceable parser loop.",
        RESUME_TEXT,
        None,
        "same-loop-key",
    )
    second = anyio.run(
        engine.start,
        "u1",
        "Create a traceable parser loop.",
        RESUME_TEXT,
        None,
        "same-loop-key",
    )

    assert first.run_id == second.run_id
    assert len(store.list_runs()) == 1
    assert len(second.steps) == len(first.steps)


def test_loop_engine_resumes_from_failed_verify_checkpoint(dry_settings: Settings) -> None:
    store = RunStore()
    engine = LoopEngine(dry_settings, store)

    with pytest.raises(LoopEngineError):
        anyio.run(
            engine.start,
            "u1",
            "Create a resumable parser loop.",
            RESUME_TEXT,
            JOB_TEXT,
            None,
            LoopPhase.VERIFY,
        )

    failed = store.list_runs()[0]
    failed_detail = store.get_run(failed.run_id)
    assert failed_detail is not None
    assert failed_detail.state == RunState.FAILED
    assert failed_detail.current_step == "verify"
    assert any(checkpoint.phase == LoopPhase.EXECUTE for checkpoint in failed_detail.checkpoints)

    resumed = anyio.run(engine.resume, failed_detail.run_id)

    assert resumed.state == RunState.WAITING_APPROVAL
    assert resumed.current_step == "human_approval"
    assert any(event.event_type == EventType.RESUME_REQUESTED for event in resumed.events)
    assert any(checkpoint.phase == LoopPhase.VERIFY for checkpoint in resumed.checkpoints)


def test_loop_event_stream_returns_sse(dry_client: TestClient) -> None:
    create_response = dry_client.post(
        "/api/loop-runs",
        headers={"Idempotency-Key": "stream-demo"},
        json={
            "user_id": "stream-user",
            "goal": "Create a streamable loop run.",
            "resume_text": RESUME_TEXT,
            "job_text": JOB_TEXT,
        },
    )

    assert create_response.status_code == 201
    run_id = create_response.json()["run"]["run_id"]

    stream_response = dry_client.get(f"/api/loop-runs/{run_id}/events/stream")

    assert stream_response.status_code == 200
    assert "text/event-stream" in stream_response.headers["content-type"]
    assert "event: RUN_CREATED" in stream_response.text
    assert "event: CHECKPOINT_SAVED" in stream_response.text
