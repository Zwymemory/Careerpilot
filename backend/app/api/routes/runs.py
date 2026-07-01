from fastapi import APIRouter, Header, HTTPException, status

from app.core.config import get_settings
from app.schemas.run import AgentEvent, CreateRunRequest, RunDetail, RunSummary
from app.services.run_orchestrator import RunOrchestrator
from app.services.run_store import run_store

router = APIRouter(prefix="/runs", tags=["runs"])


@router.post("", response_model=RunDetail, status_code=status.HTTP_201_CREATED)
async def create_run(
    payload: CreateRunRequest,
    idempotency_key: str | None = Header(default=None, alias="Idempotency-Key"),
) -> RunDetail:
    orchestrator = RunOrchestrator(get_settings(), run_store)
    run = await orchestrator.start_week1_run(
        user_id=payload.user_id,
        goal=payload.goal,
        idempotency_key=idempotency_key,
    )
    return RunDetail(run=run, total_tokens=run.total_tokens, total_cost_cny=run.total_cost_cny)


@router.get("", response_model=list[RunSummary])
async def list_runs() -> list[RunSummary]:
    return run_store.list_runs()


@router.get("/{run_id}", response_model=RunDetail)
async def get_run(run_id: str) -> RunDetail:
    run = run_store.get_run(run_id)
    if not run:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Run not found.")
    return RunDetail(run=run, total_tokens=run.total_tokens, total_cost_cny=run.total_cost_cny)


@router.get("/{run_id}/events", response_model=list[AgentEvent])
async def get_run_events(run_id: str) -> list[AgentEvent]:
    run = run_store.get_run(run_id)
    if not run:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Run not found.")
    return run.events
