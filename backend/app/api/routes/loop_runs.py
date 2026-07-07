import json

from fastapi import APIRouter, Header, HTTPException, status
from fastapi.responses import StreamingResponse

from app.core.config import get_settings
from app.schemas.loop import LoopApprovalRequest, LoopResumeRequest, LoopRunRequest
from app.schemas.run import AgentRun, EventType, RunDetail, RunState, StepStatus
from app.services.loop_engine import LoopEngine, LoopEngineError
from app.services.run_store import run_store

router = APIRouter(prefix="/loop-runs", tags=["loop-runs"])


@router.post("", response_model=RunDetail, status_code=status.HTTP_201_CREATED)
async def create_loop_run(
    payload: LoopRunRequest,
    idempotency_key: str | None = Header(default=None, alias="Idempotency-Key"),
) -> RunDetail:
    engine = LoopEngine(get_settings(), run_store)
    try:
        run = await engine.start(
            user_id=payload.user_id,
            goal=payload.goal,
            resume_text=payload.resume_text,
            job_text=payload.job_text,
            idempotency_key=idempotency_key,
        )
    except LoopEngineError as exc:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=str(exc),
        ) from exc
    return RunDetail(run=run, total_tokens=run.total_tokens, total_cost_cny=run.total_cost_cny)


@router.get("")
async def list_loop_runs(user_id: str | None = "local-user") -> list[dict]:
    runs = []
    for summary in run_store.list_runs():
        run = run_store.get_run(summary.run_id)
        if not run:
            continue
        if user_id and run.user_id != user_id:
            continue
        runs.append(_compat_loop_run(run))
    return runs


@router.get("/{run_id}")
async def get_loop_run(run_id: str) -> dict:
    run = run_store.get_run(run_id)
    if not run:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Run not found.")
    return _compat_loop_run(run)


@router.post("/{run_id}/approve", response_model=RunDetail)
async def approve_loop_run(run_id: str, payload: LoopApprovalRequest) -> RunDetail:
    engine = LoopEngine(get_settings(), run_store)
    try:
        run = engine.approve(run_id, approved_by=payload.approved_by, notes=payload.notes)
    except LoopEngineError as exc:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=str(exc)) from exc
    return RunDetail(run=run, total_tokens=run.total_tokens, total_cost_cny=run.total_cost_cny)


@router.post("/{run_id}/resume", response_model=RunDetail)
async def resume_loop_run(run_id: str, payload: LoopResumeRequest) -> RunDetail:
    existing_run = run_store.get_run(run_id)
    if not existing_run:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Run not found.")
    if existing_run.user_id != payload.user_id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Run user mismatch.")

    engine = LoopEngine(get_settings(), run_store)
    try:
        run = await engine.resume(run_id)
    except LoopEngineError as exc:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=str(exc)) from exc
    return RunDetail(run=run, total_tokens=run.total_tokens, total_cost_cny=run.total_cost_cny)


@router.get("/{run_id}/events/stream")
async def stream_loop_run_events(run_id: str) -> StreamingResponse:
    run = run_store.get_run(run_id)
    if not run:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Run not found.")

    async def event_generator():
        for event in run.events:
            payload = event.model_dump(mode="json")
            yield f"event: {event.event_type}\n"
            yield f"data: {json.dumps(payload, ensure_ascii=False)}\n\n"

    return StreamingResponse(event_generator(), media_type="text/event-stream")


def _compat_loop_run(run: AgentRun) -> dict:
    return {
        "run_id": run.run_id,
        "goal": run.goal,
        "state": _compat_run_state(run.state),
        "steps": [
            {
                "step_id": step.step_id,
                "name": step.name,
                "status": _compat_step_status(step.status),
                "started_at": step.started_at.isoformat() if step.started_at else None,
                "completed_at": step.completed_at.isoformat() if step.completed_at else None,
                "output_summary": step.output_summary,
            }
            for step in run.steps
        ],
        "events": [
            {
                "timestamp": event.created_at.isoformat(),
                "level": _compat_event_level(event.event_type),
                "message": event.message,
            }
            for event in run.events
        ],
        "cost_summary": {
            "token_count": run.total_tokens,
            "cost_cny": run.total_cost_cny,
            "latency_ms": sum(item.latency_ms or 0 for item in run.costs),
        },
        "user_id": run.user_id,
    }


def _compat_run_state(state: RunState) -> str:
    if state in {RunState.PLANNING, RunState.APPROVED}:
        return "RUNNING"
    if state == RunState.REJECTED:
        return "FAILED"
    return state.value


def _compat_step_status(status_value: StepStatus) -> str:
    if status_value in {StepStatus.SUCCEEDED, StepStatus.SKIPPED}:
        return "COMPLETED"
    return status_value.value


def _compat_event_level(event_type: EventType) -> str:
    if event_type == EventType.ERROR:
        return "error"
    if event_type in {EventType.APPROVAL_REQUIRED, EventType.RESUME_REQUESTED}:
        return "warn"
    return "info"
