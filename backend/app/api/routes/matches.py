from fastapi import APIRouter, HTTPException, status

from app.schemas.matching import MatchRequest, MatchResponse
from app.schemas.run import RunState
from app.services.matching_agent import MatchingAgent
from app.services.run_store import run_store

router = APIRouter(prefix="/matches", tags=["matches"])


@router.post("", response_model=MatchResponse, status_code=status.HTTP_201_CREATED)
async def create_match(payload: MatchRequest) -> MatchResponse:
    title = payload.job_profile.title or "untitled role"
    company = payload.job_profile.company or "unknown company"
    run = run_store.create_run(
        user_id=payload.user_id,
        goal=f"Match resume profile against JD: {company} / {title}",
        idempotency_key=None,
    )
    run_store.set_state(run.run_id, RunState.RUNNING, "match")
    step = run_store.add_step(
        run.run_id,
        name="match",
        agent_name="MatchAgent",
        input_summary=(
            f"Compare {len(payload.resume_profile.skills)} resume skill(s) against "
            f"{len(payload.job_profile.hard_requirements)} hard requirement(s)."
        ),
    )

    try:
        match = MatchingAgent().match(payload.resume_profile, payload.job_profile)
    except Exception as exc:  # noqa: BLE001 - route converts agent failures into trace + HTTP error.
        run_store.fail_step(run.run_id, step.step_id, str(exc))
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Matching failed.",
        ) from exc

    run_store.complete_step(
        run.run_id,
        step.step_id,
        output_summary=(
            f"Match score {match.overall_score:.2f}/100 with "
            f"{len(match.gaps)} gap(s) and {len(match.evidence_mapping)} evidence mapping(s)."
        ),
    )
    run_store.save_checkpoint(
        run.run_id,
        name="match_profile",
        phase="match",
        step_id=step.step_id,
        data=match.model_dump(mode="json"),
    )
    run_store.set_state(run.run_id, RunState.COMPLETED, "match")
    return MatchResponse(run_id=run.run_id, match=match)
