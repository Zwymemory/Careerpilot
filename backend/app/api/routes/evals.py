from fastapi import APIRouter, HTTPException, Response, status

from app.schemas.eval import EvalReport, EvalReportSummary, EvalRunRequest, EvalRunResponse
from app.schemas.run import RunState
from app.services.eval_harness import eval_harness, eval_report_store
from app.services.run_store import run_store

router = APIRouter(prefix="/evals", tags=["evals"])


@router.post("", response_model=EvalRunResponse, status_code=status.HTTP_201_CREATED)
async def run_eval(payload: EvalRunRequest) -> EvalRunResponse:
    run = run_store.create_run(
        user_id=payload.user_id,
        goal=f"Evaluate CareerPilot artifacts for {payload.case_name}",
        idempotency_key=None,
    )
    run_store.set_state(run.run_id, RunState.RUNNING, "eval_harness")
    step = run_store.add_step(
        run.run_id,
        name="eval_harness",
        agent_name="EvalHarnessAgent",
        input_summary=(
            f"Run {payload.judge_mode} evaluation with min score {payload.min_score:.1f}."
        ),
    )

    report = await eval_harness.evaluate_async(payload)
    if report.judge_cost_usage:
        run_store.record_cost(run.run_id, report.judge_cost_usage)

    run_store.complete_step(
        run.run_id,
        step.step_id,
        output_summary=(
            f"Eval report {report.report_id} completed with score "
            f"{report.overall_score:.2f} and gate {report.gate.decision}."
        ),
    )
    run_store.save_checkpoint(
        run.run_id,
        name="eval_report",
        phase="eval_harness",
        step_id=step.step_id,
        data=report.model_dump(mode="json"),
    )
    run_store.set_state(run.run_id, RunState.COMPLETED, "eval_harness")
    return EvalRunResponse(run_id=run.run_id, report=report)


@router.get("", response_model=list[EvalReportSummary])
async def list_eval_reports(user_id: str = "local-user") -> list[EvalReportSummary]:
    return eval_report_store.list(user_id=user_id)


@router.get("/{report_id}", response_model=EvalReport)
async def get_eval_report(report_id: str) -> EvalReport:
    report_id = _resolve_report_id(report_id)
    report = eval_report_store.get(report_id)
    if not report:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Eval report not found.")
    return report


@router.get("/{report_id}/report.html")
async def export_eval_html(report_id: str) -> Response:
    report_id = _resolve_report_id(report_id)
    report = eval_report_store.get(report_id)
    if not report:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Eval report not found.")
    return Response(
        content=report.html_report,
        media_type="text/html; charset=utf-8",
        headers={"Content-Disposition": f'inline; filename="{report.report_id}.html"'},
    )


def _resolve_report_id(report_id: str) -> str:
    if report_id != "active":
        return report_id
    reports = eval_report_store.list(user_id="local-user")
    if not reports:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Active eval report not found.")
    return reports[0].report_id
