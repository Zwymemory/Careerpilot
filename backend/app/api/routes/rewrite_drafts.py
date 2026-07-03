from fastapi import APIRouter, HTTPException, Response, status

from app.schemas.rewrite import (
    ResumeRewriteDraft,
    ResumeRewriteRequest,
    ResumeRewriteResponse,
    RewriteApprovalRequest,
)
from app.schemas.run import EventType, RunDetail, RunState
from app.services.resume_rewrite_agent import (
    ResumeRewriteAgent,
    render_rewrite_markdown,
    render_rewrite_pdf_bytes,
)
from app.services.run_store import run_store

router = APIRouter(prefix="/rewrite-drafts", tags=["rewrite-drafts"])


@router.post("", response_model=ResumeRewriteResponse, status_code=status.HTTP_201_CREATED)
async def create_rewrite_draft(payload: ResumeRewriteRequest) -> ResumeRewriteResponse:
    title = payload.job_profile.title or "untitled role"
    company = payload.job_profile.company or "unknown company"
    run = run_store.create_run(
        user_id=payload.user_id,
        goal=f"Create evidence-locked resume rewrite draft for {company} / {title}",
        idempotency_key=None,
    )
    run_store.set_state(run.run_id, RunState.RUNNING, "rewrite")
    step = run_store.add_step(
        run.run_id,
        name="rewrite",
        agent_name="ResumeRewriteAgent",
        input_summary=(
            f"Use {len(payload.match_profile.gaps)} gap(s), "
            f"{len(payload.match_profile.evidence_mapping)} evidence mapping(s), and parsed "
            "profile fields to draft reviewable resume changes."
        ),
    )

    try:
        draft = ResumeRewriteAgent().create_draft(
            payload.resume_profile,
            payload.job_profile,
            payload.match_profile,
        )
    except Exception as exc:  # noqa: BLE001 - route converts agent failures into trace + HTTP error.
        run_store.fail_step(run.run_id, step.step_id, str(exc))
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Resume rewrite failed.",
        ) from exc

    run_store.complete_step(
        run.run_id,
        step.step_id,
        output_summary=(
            f"Created {len(draft.changes)} rewrite change(s) with "
            f"{len(draft.risk_warnings)} risk warning(s)."
        ),
    )
    run_store.save_checkpoint(
        run.run_id,
        name="rewrite_draft",
        phase="rewrite",
        step_id=step.step_id,
        data=draft.model_dump(mode="json"),
    )

    approval_step = run_store.add_step(
        run.run_id,
        name="human_approval",
        agent_name="HumanReviewer",
        input_summary="Review evidence-locked rewrite draft before export.",
    )
    run_store.add_event(
        run.run_id,
        EventType.APPROVAL_REQUIRED,
        "Human approval required before PDF export.",
        {"step_id": approval_step.step_id, "draft_id": draft.draft_id},
    )
    run_store.set_state(run.run_id, RunState.WAITING_APPROVAL, "human_approval")
    return ResumeRewriteResponse(run_id=run.run_id, draft=draft)


@router.post("/{run_id}/approve", response_model=RunDetail)
async def approve_rewrite_draft(run_id: str, payload: RewriteApprovalRequest) -> RunDetail:
    run = run_store.get_run(run_id)
    if not run:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Run not found.")
    if run.state != RunState.WAITING_APPROVAL:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Draft is not awaiting approval.",
        )

    draft = _draft_from_run(run_id)
    draft.approval_status = "APPROVED"
    draft.markdown = render_rewrite_markdown(draft)
    draft_checkpoint = _draft_checkpoint(run_id)
    draft_checkpoint.data = draft.model_dump(mode="json")

    approval_step = next(
        (
            step
            for step in reversed(run.steps)
            if step.name == "human_approval" and step.output_summary is None
        ),
        None,
    )
    if approval_step:
        run_store.complete_step(
            run_id,
            approval_step.step_id,
            output_summary=f"Rewrite draft approved by {payload.approved_by}.",
        )

    run_store.add_event(
        run_id,
        EventType.APPROVAL_COMPLETED,
        "Resume rewrite approval completed.",
        {
            "approved_by": payload.approved_by,
            "notes": payload.notes,
            "draft_id": draft.draft_id,
        },
    )
    run_store.set_state(run_id, RunState.RUNNING, "export")
    export_step = run_store.add_step(
        run_id,
        name="export",
        agent_name="ExportAgent",
        input_summary="Prepare approved rewrite draft for PDF export.",
    )
    run_store.complete_step(
        run_id,
        export_step.step_id,
        output_summary="Approved rewrite draft is ready for PDF export.",
    )
    run_store.save_checkpoint(
        run_id,
        name="rewrite_approval",
        phase="approval",
        step_id=export_step.step_id,
        data={
            "approved_by": payload.approved_by,
            "notes": payload.notes,
            "draft_id": draft.draft_id,
        },
    )
    latest = run_store.set_state(run_id, RunState.COMPLETED, "export")
    return RunDetail(
        run=latest,
        total_tokens=latest.total_tokens,
        total_cost_cny=latest.total_cost_cny,
    )


@router.get("/{run_id}/export.md")
async def export_rewrite_markdown(run_id: str) -> Response:
    draft = _approved_draft(run_id)
    return Response(
        content=draft.markdown,
        media_type="text/markdown; charset=utf-8",
        headers={"Content-Disposition": f'attachment; filename="{draft.draft_id}.md"'},
    )


@router.get("/{run_id}/export.pdf")
async def export_rewrite_pdf(run_id: str) -> Response:
    draft = _approved_draft(run_id)
    return Response(
        content=render_rewrite_pdf_bytes(draft),
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="{draft.draft_id}.pdf"'},
    )


def _draft_checkpoint(run_id: str):
    run = run_store.get_run(run_id)
    if not run:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Run not found.")
    checkpoint = next(
        (item for item in reversed(run.checkpoints) if item.name == "rewrite_draft"),
        None,
    )
    if not checkpoint:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Rewrite draft not found.",
        )
    return checkpoint


def _draft_from_run(run_id: str) -> ResumeRewriteDraft:
    checkpoint = _draft_checkpoint(run_id)
    return ResumeRewriteDraft.model_validate(checkpoint.data)


def _approved_draft(run_id: str) -> ResumeRewriteDraft:
    run = run_store.get_run(run_id)
    if not run:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Run not found.")
    if run.state != RunState.COMPLETED:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Rewrite draft must be approved before export.",
        )
    draft = _draft_from_run(run_id)
    if draft.approval_status != "APPROVED":
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Rewrite draft is not approved.",
        )
    return draft
