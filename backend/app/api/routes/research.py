from fastapi import APIRouter, HTTPException, status

from app.core.config import get_settings
from app.schemas.run import EventType, RunState
from app.schemas.web_search import WebSearchRequest, WebSearchResponse
from app.services.run_store import run_store
from app.services.tavily_client import TavilyClient, TavilyClientError

router = APIRouter(prefix="/research", tags=["research"])


@router.post("/search", response_model=WebSearchResponse, status_code=status.HTTP_201_CREATED)
async def web_search(payload: WebSearchRequest) -> WebSearchResponse:
    run = run_store.create_run(
        user_id=payload.user_id,
        goal=f"Search web evidence with Tavily: {payload.query}",
        idempotency_key=None,
    )
    run_store.set_state(run.run_id, RunState.RUNNING, "tavily_search")
    step = run_store.add_step(
        run.run_id,
        name="tavily_search",
        agent_name="ResearchAgent",
        input_summary=f"Search Tavily for: {payload.query}",
    )

    try:
        result = await TavilyClient(get_settings()).search(payload)
    except TavilyClientError as exc:
        run_store.fail_step(run.run_id, step.step_id, str(exc))
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="Tavily search failed.",
        ) from exc

    run_store.add_event(
        run.run_id,
        EventType.STEP_COMPLETED,
        "Tavily search completed.",
        {
            "provider": result.provider,
            "dry_run": result.dry_run,
            "result_count": len(result.results),
            "usage": result.usage,
        },
    )
    run_store.complete_step(
        run.run_id,
        step.step_id,
        output_summary=(
            f"Tavily returned {len(result.results)} result(s); "
            f"dry_run={str(result.dry_run).lower()}."
        ),
        latency_ms=result.latency_ms,
        model="tavily-search",
    )
    run_store.save_checkpoint(
        run.run_id,
        name="tavily_search",
        phase="tavily_search",
        step_id=step.step_id,
        data=result.model_dump(mode="json"),
    )
    run_store.set_state(run.run_id, RunState.COMPLETED, "tavily_search")
    return result
