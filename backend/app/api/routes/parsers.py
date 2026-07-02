from fastapi import APIRouter, HTTPException, status

from app.core.config import get_settings
from app.schemas.parser import (
    ParseJobRequest,
    ParseJobResponse,
    ParseResumeRequest,
    ParseResumeResponse,
)
from app.schemas.run import EventType, RunState
from app.services.run_store import run_store
from app.services.structured_parser import (
    JobParseResult,
    ResumeParseResult,
    StructuredParserService,
)

router = APIRouter(prefix="/parsers", tags=["parsers"])


@router.post("/resume", response_model=ParseResumeResponse, status_code=status.HTTP_201_CREATED)
async def parse_resume(payload: ParseResumeRequest) -> ParseResumeResponse:
    run = run_store.create_run(
        user_id=payload.user_id,
        goal=f"Parse resume into structured profile: {payload.source_name or 'inline text'}",
        idempotency_key=None,
    )
    run_store.set_state(run.run_id, RunState.RUNNING, "parse_resume")
    step = run_store.add_step(
        run.run_id,
        name="parse_resume",
        agent_name="ResumeParserAgent",
        input_summary=f"Parse resume text with {len(payload.text)} characters.",
    )

    try:
        result = await StructuredParserService(get_settings()).parse_resume(payload.text)
    except Exception as exc:  # noqa: BLE001 - route converts parser failures into trace + HTTP error.
        run_store.fail_step(run.run_id, step.step_id, str(exc))
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Resume parsing failed.",
        ) from exc

    _complete_resume_parse_run(run.run_id, step.step_id, result)
    return ParseResumeResponse(run_id=run.run_id, profile=result.profile, metadata=result.metadata)


@router.post("/job", response_model=ParseJobResponse, status_code=status.HTTP_201_CREATED)
async def parse_job(payload: ParseJobRequest) -> ParseJobResponse:
    source_label = payload.source_url or "inline text"
    run = run_store.create_run(
        user_id=payload.user_id,
        goal=f"Parse job description into structured profile: {source_label}",
        idempotency_key=None,
    )
    run_store.set_state(run.run_id, RunState.RUNNING, "parse_job")
    step = run_store.add_step(
        run.run_id,
        name="parse_job",
        agent_name="JobIntelAgent",
        input_summary=f"Parse JD text with {len(payload.text)} characters.",
    )

    try:
        result = await StructuredParserService(get_settings()).parse_job(payload.text)
    except Exception as exc:  # noqa: BLE001 - route converts parser failures into trace + HTTP error.
        run_store.fail_step(run.run_id, step.step_id, str(exc))
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Job parsing failed.",
        ) from exc

    _complete_job_parse_run(run.run_id, step.step_id, result)
    return ParseJobResponse(run_id=run.run_id, profile=result.profile, metadata=result.metadata)


def _complete_resume_parse_run(run_id: str, step_id: str, result: ResumeParseResult) -> None:
    profile = result.profile
    output_summary = (
        f"Resume parsed: {len(profile.skills)} skills, {len(profile.projects)} projects, "
        f"{len(profile.experiences)} experiences, {len(profile.education)} education entries."
    )
    run_store.complete_step(
        run_id,
        step_id,
        output_summary=output_summary,
        model=result.metadata.model,
        cost_usage=result.cost_usage,
    )
    _record_parser_events(run_id, result.metadata.model, result.metadata.dry_run)
    run_store.set_state(run_id, RunState.COMPLETED, "parse_resume")


def _complete_job_parse_run(run_id: str, step_id: str, result: JobParseResult) -> None:
    profile = result.profile
    output_summary = (
        f"JD parsed: {len(profile.hard_requirements)} hard requirements, "
        f"{len(profile.nice_to_have)} nice-to-have items, "
        f"{len(profile.tech_keywords)} tech keywords."
    )
    run_store.complete_step(
        run_id,
        step_id,
        output_summary=output_summary,
        model=result.metadata.model,
        cost_usage=result.cost_usage,
    )
    _record_parser_events(run_id, result.metadata.model, result.metadata.dry_run)
    run_store.set_state(run_id, RunState.COMPLETED, "parse_job")


def _record_parser_events(run_id: str, model: str | None, dry_run: bool) -> None:
    if not model:
        return
    run_store.add_event(
        run_id,
        EventType.LLM_CALL_COMPLETED,
        "Parser LLM call completed.",
        {"model": model, "dry_run": dry_run},
    )
