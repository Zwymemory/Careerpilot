from fastapi import APIRouter, HTTPException, status

from app.core.config import get_settings
from app.schemas.interview import InterviewPackRequest, InterviewPackResponse
from app.schemas.run import CostUsage, EventType, RunState
from app.services.interview_coach_agent import InterviewCoachAgent
from app.services.run_store import run_store

router = APIRouter(prefix="/interview-packs", tags=["interview-packs"])


@router.post("", response_model=InterviewPackResponse, status_code=status.HTTP_201_CREATED)
async def create_interview_pack(payload: InterviewPackRequest) -> InterviewPackResponse:
    title = payload.job_profile.title or "untitled role"
    company = payload.job_profile.company or "unknown company"
    run = run_store.create_run(
        user_id=payload.user_id,
        goal=f"Create evidence-locked interview pack for {company} / {title}",
        idempotency_key=None,
    )
    run_store.set_state(run.run_id, RunState.RUNNING, "interview_generate")
    step = run_store.add_step(
        run.run_id,
        name="interview_generate",
        agent_name="InterviewCoachAgent",
        input_summary=(
            f"Generate interview prep from {len(payload.resume_profile.projects)} project(s), "
            f"{len(payload.job_profile.hard_requirements)} hard requirement(s), and "
            f"{len(payload.match_profile.gaps) if payload.match_profile else 0} gap(s)."
        ),
    )

    try:
        pack, llm_response, issues = await InterviewCoachAgent().create_pack_with_llm(
            payload.resume_profile,
            payload.job_profile,
            payload.match_profile,
            payload.rewrite_draft,
            get_settings(),
        )
    except Exception as exc:  # noqa: BLE001 - route converts agent failures into trace + HTTP error.
        run_store.fail_step(run.run_id, step.step_id, str(exc))
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Interview pack generation failed.",
        ) from exc

    cost_usage = (
        CostUsage(
            provider=llm_response.provider,
            model=llm_response.model,
            prompt_tokens=llm_response.usage.prompt_tokens,
            completion_tokens=llm_response.usage.completion_tokens,
            total_tokens=llm_response.usage.total_tokens,
            latency_ms=llm_response.latency_ms,
            estimated_cost_cny=llm_response.estimated_cost_cny,
        )
        if llm_response
        else None
    )
    if llm_response:
        run_store.add_event(
            run.run_id,
            EventType.LLM_CALL_COMPLETED,
            "Interview questions refined with LLM.",
            {
                "model": llm_response.model,
                "latency_ms": llm_response.latency_ms,
                "issues": issues,
            },
        )

    run_store.complete_step(
        run.run_id,
        step.step_id,
        output_summary=(
            f"Created interview pack with {len(pack.predicted_questions)} predicted question(s), "
            f"{len(pack.project_followups)} project follow-up(s), "
            f"{len(pack.star_answers)} answer framework(s), and score "
            f"{pack.mock_score.overall_score:.1f}/100."
        ),
        latency_ms=llm_response.latency_ms if llm_response else None,
        model=llm_response.model if llm_response else None,
        cost_usage=cost_usage,
    )
    run_store.save_checkpoint(
        run.run_id,
        name="interview_pack",
        phase="interview_generate",
        step_id=step.step_id,
        data=pack.model_dump(mode="json"),
    )
    run_store.set_state(run.run_id, RunState.COMPLETED, "interview_generate")
    return InterviewPackResponse(run_id=run.run_id, pack=pack)
