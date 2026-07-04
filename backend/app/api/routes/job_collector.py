from fastapi import APIRouter, HTTPException, status

from app.core.config import get_settings
from app.schemas.job_collector import JobCollectRequest, JobCollectResponse
from app.schemas.run import RunState
from app.services.job_collector import JobCollectionError, JobCollectorService
from app.services.run_store import run_store
from app.services.structured_parser import StructuredParserService

router = APIRouter(prefix="/job-collector", tags=["job-collector"])


@router.post("", response_model=JobCollectResponse, status_code=status.HTTP_201_CREATED)
async def collect_job(payload: JobCollectRequest) -> JobCollectResponse:
    source_label = payload.url or payload.source_name or "inline JD"
    run = run_store.create_run(
        user_id=payload.user_id,
        goal=f"Collect job posting and parse JD: {source_label}",
        idempotency_key=None,
    )
    run_store.set_state(run.run_id, RunState.RUNNING, "job_collect")
    collect_step = run_store.add_step(
        run.run_id,
        name="job_collect",
        agent_name="JobCollectorAgent",
        input_summary=_input_summary(payload),
    )

    try:
        snapshot = await JobCollectorService().collect(payload)
    except JobCollectionError as exc:
        run_store.fail_step(run.run_id, collect_step.step_id, str(exc))
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(exc),
        ) from exc
    except Exception as exc:  # noqa: BLE001 - route converts tool failures into trace.
        run_store.fail_step(run.run_id, collect_step.step_id, str(exc))
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="Job collection failed.",
        ) from exc

    run_store.complete_step(
        run.run_id,
        collect_step.step_id,
        output_summary=(
            f"Collected {len(snapshot.text)} characters from {snapshot.source_type}; "
            f"screenshot={snapshot.screenshot_status}."
        ),
    )
    run_store.save_checkpoint(
        run.run_id,
        name="job_snapshot",
        phase="job_collect",
        data=snapshot.model_dump(mode="json"),
        step_id=collect_step.step_id,
    )

    parse_step = run_store.add_step(
        run.run_id,
        name="parse_collected_job",
        agent_name="JobIntelAgent",
        input_summary=f"Parse collected JD text with {len(snapshot.text)} characters.",
    )
    try:
        result = await StructuredParserService(get_settings()).parse_job(snapshot.text)
    except Exception as exc:  # noqa: BLE001 - route converts parser failures into trace.
        run_store.fail_step(run.run_id, parse_step.step_id, str(exc))
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Collected JD parsing failed.",
        ) from exc

    profile = result.profile
    run_store.complete_step(
        run.run_id,
        parse_step.step_id,
        output_summary=(
            f"Collected JD parsed: {len(profile.hard_requirements)} hard requirements, "
            f"{len(profile.nice_to_have)} nice-to-have items, "
            f"{len(profile.tech_keywords)} tech keywords."
        ),
        model=result.metadata.model,
        cost_usage=result.cost_usage,
    )
    run_store.save_checkpoint(
        run.run_id,
        name="collected_job_profile",
        phase="parse_collected_job",
        data={
            "profile": profile.model_dump(mode="json"),
            "metadata": result.metadata.model_dump(mode="json"),
            "snapshot_hash": snapshot.text_hash,
        },
        step_id=parse_step.step_id,
    )
    run_store.set_state(run.run_id, RunState.COMPLETED, "parse_collected_job")

    return JobCollectResponse(
        run_id=run.run_id,
        snapshot=snapshot,
        profile=profile,
        metadata=result.metadata,
    )


def _input_summary(payload: JobCollectRequest) -> str:
    if payload.url:
        return f"Collect job posting from URL: {payload.url}"
    if payload.html:
        return f"Collect job posting from HTML with {len(payload.html)} characters."
    return f"Collect job posting from text with {len(payload.text or '')} characters."
