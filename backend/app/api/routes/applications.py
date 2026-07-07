from typing import cast

from fastapi import APIRouter, HTTPException, Query, status
from pydantic import BaseModel, Field

from app.schemas.application import (
    ApplicationCreateRequest,
    ApplicationMemory,
    ApplicationRecord,
    ApplicationResponse,
    ApplicationStatus,
    ApplicationStatusUpdateRequest,
    FeedbackCreateRequest,
)
from app.schemas.parser import JobProfile
from app.schemas.run import RunState
from app.services.application_crm import application_crm_agent, application_store
from app.services.run_store import new_id, run_store

router = APIRouter(prefix="/applications", tags=["applications"])


class ApplicationCompatUpdateRequest(BaseModel):
    user_id: str = Field(default="local-user", min_length=1, max_length=80)
    status: str = Field(min_length=1, max_length=80)
    notes: str | None = Field(default=None, max_length=2000)
    memory: str | None = Field(default=None, max_length=2000)


@router.post("", response_model=ApplicationResponse, status_code=status.HTTP_201_CREATED)
async def create_application(payload: ApplicationCreateRequest) -> ApplicationResponse:
    payload = _normalize_application_payload(payload)
    assert payload.job_profile is not None
    title = payload.job_profile.title or "untitled role"
    company = payload.job_profile.company or "unknown company"
    run = run_store.create_run(
        user_id=payload.user_id,
        goal=f"Create application CRM record for {company} / {title}",
        idempotency_key=None,
    )
    run_store.set_state(run.run_id, RunState.RUNNING, "application_record")
    step = run_store.add_step(
        run.run_id,
        name="application_record",
        agent_name="ApplicationCRMAgent",
        input_summary=(
            f"Create CRM record for {company} / {title}; "
            f"match={'yes' if payload.match_profile else 'no'}, "
            f"interview={'yes' if payload.interview_pack else 'no'}."
        ),
    )

    record = application_crm_agent.create_record(payload)
    run_store.complete_step(
        run.run_id,
        step.step_id,
        output_summary=(
            f"Created application record with {len(record.memories)} memory item(s), "
            f"{len(record.tasks)} next task(s), and status {record.status}."
        ),
    )
    run_store.save_checkpoint(
        run.run_id,
        name="application_record",
        phase="application_record",
        step_id=step.step_id,
        data=record.model_dump(mode="json"),
    )
    run_store.set_state(run.run_id, RunState.COMPLETED, "application_record")
    return ApplicationResponse(run_id=run.run_id, record=record)


@router.get("", response_model=list[ApplicationRecord])
async def list_applications(
    user_id: str | None = Query(default="local-user"),
) -> list[ApplicationRecord]:
    return application_store.list(user_id=user_id)


@router.get("/{application_id}", response_model=ApplicationRecord)
async def get_application(application_id: str) -> ApplicationRecord:
    record = application_store.get(application_id)
    if not record:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Application not found.")
    return record


@router.post(
    "/{application_id}/feedback",
    response_model=ApplicationResponse,
    status_code=status.HTTP_201_CREATED,
)
async def add_application_feedback(
    application_id: str,
    payload: FeedbackCreateRequest,
) -> ApplicationResponse:
    record = application_store.get(application_id)
    if not record:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Application not found.")

    run = run_store.create_run(
        user_id=payload.user_id,
        goal=f"Add interview feedback to application {application_id}",
        idempotency_key=None,
    )
    run_store.set_state(run.run_id, RunState.RUNNING, "interview_feedback")
    step = run_store.add_step(
        run.run_id,
        name="interview_feedback",
        agent_name="ApplicationCRMAgent",
        input_summary=(
            f"Add {payload.stage} feedback with {len(payload.strengths)} strength(s), "
            f"{len(payload.concerns)} concern(s), and "
            f"{len(payload.follow_up_tasks)} follow-up task(s)."
        ),
    )

    updated = application_crm_agent.add_feedback(record, payload)
    run_store.complete_step(
        run.run_id,
        step.step_id,
        output_summary=(
            f"Updated application memory to {len(updated.memories)} item(s) and "
            f"{len(updated.tasks)} task(s)."
        ),
    )
    run_store.save_checkpoint(
        run.run_id,
        name="application_feedback",
        phase="interview_feedback",
        step_id=step.step_id,
        data=updated.model_dump(mode="json"),
    )
    run_store.set_state(run.run_id, RunState.COMPLETED, "interview_feedback")
    return ApplicationResponse(run_id=run.run_id, record=updated)


@router.patch("/{application_id}/status", response_model=ApplicationResponse)
async def update_application_status(
    application_id: str,
    payload: ApplicationStatusUpdateRequest,
) -> ApplicationResponse:
    record = application_store.get(application_id)
    if not record:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Application not found.")

    run = run_store.create_run(
        user_id=payload.user_id,
        goal=f"Update application {application_id} status to {payload.status}",
        idempotency_key=None,
    )
    run_store.set_state(run.run_id, RunState.RUNNING, "application_status")
    step = run_store.add_step(
        run.run_id,
        name="application_status",
        agent_name="ApplicationCRMAgent",
        input_summary=f"Update application status from {record.status} to {payload.status}.",
    )

    updated = application_crm_agent.update_status(record, payload.status, payload.notes)
    run_store.complete_step(
        run.run_id,
        step.step_id,
        output_summary=f"Application status updated to {updated.status}.",
    )
    run_store.save_checkpoint(
        run.run_id,
        name="application_status",
        phase="application_status",
        step_id=step.step_id,
        data=updated.model_dump(mode="json"),
    )
    run_store.set_state(run.run_id, RunState.COMPLETED, "application_status")
    return ApplicationResponse(run_id=run.run_id, record=updated)


@router.put("/{application_id}", response_model=ApplicationResponse)
async def update_application_compat(
    application_id: str,
    payload: ApplicationCompatUpdateRequest,
) -> ApplicationResponse:
    """Compatibility endpoint for the Google-generated frontend.

    The canonical backend API uses PATCH /applications/{id}/status with a typed status body.
    The Google UI sends a lighter PUT payload, so this route normalizes the status and preserves
    optional memory text without changing the canonical route.
    """
    record = application_store.get(application_id)
    if not record:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Application not found.")

    normalized_status = _normalize_application_status(payload.status)
    run = run_store.create_run(
        user_id=payload.user_id,
        goal=f"Update application {application_id} via compatibility API",
        idempotency_key=None,
    )
    run_store.set_state(run.run_id, RunState.RUNNING, "application_status")
    step = run_store.add_step(
        run.run_id,
        name="application_status",
        agent_name="ApplicationCRMAgent",
        input_summary=f"Update application status from {record.status} to {normalized_status}.",
    )

    updated = application_crm_agent.update_status(record, normalized_status, payload.notes)
    if payload.memory:
        updated.memories.append(
            ApplicationMemory(
                memory_id=new_id("memory"),
                category="follow_up",
                text=payload.memory,
                source="compat_update",
                confidence=0.72,
            )
        )
        updated = application_store.save(updated)

    run_store.complete_step(
        run.run_id,
        step.step_id,
        output_summary=f"Application status updated to {updated.status}.",
    )
    run_store.save_checkpoint(
        run.run_id,
        name="application_status",
        phase="application_status",
        step_id=step.step_id,
        data=updated.model_dump(mode="json"),
    )
    run_store.set_state(run.run_id, RunState.COMPLETED, "application_status")
    return ApplicationResponse(run_id=run.run_id, record=updated)


def _normalize_application_payload(payload: ApplicationCreateRequest) -> ApplicationCreateRequest:
    if payload.job_profile:
        return payload
    if not payload.company and not payload.title:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="job_profile or company/title is required.",
        )
    return payload.model_copy(
        update={
            "job_profile": JobProfile(
                company=payload.company,
                title=payload.title,
            )
        }
    )


_STATUS_ALIASES = {
    "ready": "READY_TO_APPLY",
    "ready_to_apply": "READY_TO_APPLY",
    "saved": "SAVED",
    "applied": "APPLIED",
    "interviewing": "INTERVIEWING",
    "offer": "OFFER",
    "rejected": "REJECTED",
    "archived": "ARCHIVED",
}


def _normalize_application_status(status_text: str) -> ApplicationStatus:
    normalized = _STATUS_ALIASES.get(status_text.strip().lower(), status_text.strip().upper())
    allowed: set[str] = {
        "SAVED",
        "READY_TO_APPLY",
        "APPLIED",
        "INTERVIEWING",
        "OFFER",
        "REJECTED",
        "ARCHIVED",
    }
    if normalized not in allowed:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"Unsupported application status: {status_text}",
        )
    return cast(ApplicationStatus, normalized)
