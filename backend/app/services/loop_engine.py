from app.core.config import Settings
from app.schemas.loop import LoopPhase
from app.schemas.parser import JobProfile, ResumeProfile
from app.schemas.run import AgentRun, EventType, RunState
from app.services.run_store import RunStore
from app.services.structured_parser import StructuredParserService


class LoopEngineError(RuntimeError):
    pass


class LoopEngine:
    def __init__(self, settings: Settings, store: RunStore) -> None:
        self.settings = settings
        self.store = store
        self.parser = StructuredParserService(settings)

    async def start(
        self,
        user_id: str,
        goal: str,
        resume_text: str | None,
        job_text: str | None,
        idempotency_key: str | None,
        simulate_failure_at: LoopPhase | None = None,
    ) -> AgentRun:
        run = self.store.create_run(
            user_id=user_id,
            goal=goal,
            idempotency_key=idempotency_key,
        )
        if run.steps:
            return run

        context: dict = {}
        await self._plan(run.run_id, resume_text, job_text, simulate_failure_at)
        context = await self._execute(run.run_id, resume_text, job_text, simulate_failure_at)
        await self._verify(run.run_id, context, simulate_failure_at)
        await self._reflect(run.run_id, context, simulate_failure_at)
        self._request_human_approval(run.run_id)
        return self.store.get_run(run.run_id) or run

    async def resume(self, run_id: str) -> AgentRun:
        run = self.store.get_run(run_id)
        if not run:
            raise LoopEngineError("Run not found.")
        if run.state != RunState.FAILED:
            return run

        self.store.add_event(
            run_id,
            EventType.RESUME_REQUESTED,
            "Resume from failed step requested.",
            {"current_step": run.current_step},
        )
        context = self._context_from_execute_checkpoint(run)
        current_step = run.current_step
        if current_step == "verify":
            await self._verify(run_id, context)
            await self._reflect(run_id, context)
            self._request_human_approval(run_id)
        elif current_step == "reflect":
            await self._reflect(run_id, context)
            self._request_human_approval(run_id)
        elif current_step == "human_approval":
            self._request_human_approval(run_id)
        else:
            raise LoopEngineError(f"Cannot resume run from step {current_step}.")
        latest = self.store.get_run(run_id)
        if not latest:
            raise LoopEngineError("Run disappeared during resume.")
        return latest

    def approve(self, run_id: str, approved_by: str, notes: str | None = None) -> AgentRun:
        run = self.store.get_run(run_id)
        if not run:
            raise LoopEngineError("Run not found.")
        if run.state != RunState.WAITING_APPROVAL:
            raise LoopEngineError("Run is not waiting for approval.")

        approval_step = next(
            (
                step
                for step in reversed(run.steps)
                if step.name == "human_approval" and step.output_summary is None
            ),
            None,
        )
        if approval_step:
            self.store.complete_step(
                run_id,
                approval_step.step_id,
                output_summary=f"Approved by {approved_by}.",
            )
        self.store.add_event(
            run_id,
            EventType.APPROVAL_COMPLETED,
            "Human approval completed.",
            {"approved_by": approved_by, "notes": notes},
        )

        self.store.set_state(run_id, RunState.RUNNING, "commit")
        commit_step = self.store.add_step(
            run_id,
            name="commit",
            agent_name="CommitAgent",
            input_summary="Commit verified loop outputs after approval.",
        )
        self.store.complete_step(
            run_id,
            commit_step.step_id,
            output_summary="Loop outputs committed after human approval.",
        )
        self.store.save_checkpoint(
            run_id,
            name="commit",
            phase=LoopPhase.COMMIT,
            step_id=commit_step.step_id,
            data={"approved_by": approved_by, "notes": notes},
        )
        return self.store.set_state(run_id, RunState.COMPLETED, "commit")

    async def _plan(
        self,
        run_id: str,
        resume_text: str | None,
        job_text: str | None,
        simulate_failure_at: LoopPhase | None = None,
    ) -> None:
        self.store.set_state(run_id, RunState.PLANNING, "plan")
        step = self.store.add_step(
            run_id,
            name="plan",
            agent_name="PlannerAgent",
            input_summary="Plan LoopEngine stages from available resume/JD inputs.",
        )
        try:
            self._maybe_fail(LoopPhase.PLAN, simulate_failure_at)
            planned_steps = ["execute", "verify", "reflect", "human_approval", "commit"]
            self.store.complete_step(
                run_id,
                step.step_id,
                output_summary=f"Planned stages: {', '.join(planned_steps)}.",
            )
            self.store.save_checkpoint(
                run_id,
                name="plan",
                phase=LoopPhase.PLAN,
                step_id=step.step_id,
                data={
                    "planned_steps": planned_steps,
                    "has_resume_text": bool(resume_text),
                    "has_job_text": bool(job_text),
                },
            )
        except Exception as exc:
            self.store.fail_step(run_id, step.step_id, str(exc))
            raise

    async def _execute(
        self,
        run_id: str,
        resume_text: str | None,
        job_text: str | None,
        simulate_failure_at: LoopPhase | None = None,
    ) -> dict:
        self.store.set_state(run_id, RunState.RUNNING, "execute")
        step = self.store.add_step(
            run_id,
            name="execute",
            agent_name="AgentRuntime",
            input_summary="Execute parser tools selected by the plan.",
        )
        try:
            self._maybe_fail(LoopPhase.EXECUTE, simulate_failure_at)

            context: dict = {"resume_profile": None, "job_profile": None, "parser_metadata": []}
            if resume_text:
                resume_result = await self.parser.parse_resume(resume_text)
                context["resume_profile"] = resume_result.profile.model_dump(mode="json")
                context["parser_metadata"].append(resume_result.metadata.model_dump(mode="json"))
                if resume_result.cost_usage:
                    self.store.record_cost(run_id, resume_result.cost_usage)
                    self.store.add_event(
                        run_id,
                        EventType.LLM_CALL_COMPLETED,
                        "Resume parser LLM call completed.",
                        resume_result.metadata.model_dump(mode="json"),
                    )
            if job_text:
                job_result = await self.parser.parse_job(job_text)
                context["job_profile"] = job_result.profile.model_dump(mode="json")
                context["parser_metadata"].append(job_result.metadata.model_dump(mode="json"))
                if job_result.cost_usage:
                    self.store.record_cost(run_id, job_result.cost_usage)
                    self.store.add_event(
                        run_id,
                        EventType.LLM_CALL_COMPLETED,
                        "JD parser LLM call completed.",
                        job_result.metadata.model_dump(mode="json"),
                    )

            executed_tools = []
            if context["resume_profile"]:
                executed_tools.append("parse_resume")
            if context["job_profile"]:
                executed_tools.append("parse_job")
            models = [
                metadata.get("model")
                for metadata in context["parser_metadata"]
                if metadata.get("model")
            ]
            self.store.complete_step(
                run_id,
                step.step_id,
                output_summary=f"Executed tools: {', '.join(executed_tools)}.",
                model=", ".join(models) if models else None,
            )

            self.store.save_checkpoint(
                run_id,
                name="execute",
                phase=LoopPhase.EXECUTE,
                step_id=step.step_id,
                data=context,
            )
            return context
        except Exception as exc:
            self.store.fail_step(run_id, step.step_id, str(exc))
            raise

    async def _verify(
        self,
        run_id: str,
        context: dict,
        simulate_failure_at: LoopPhase | None = None,
    ) -> dict:
        self.store.set_state(run_id, RunState.RUNNING, "verify")
        step = self.store.add_step(
            run_id,
            name="verify",
            agent_name="VerifyAgent",
            input_summary="Validate parser outputs and collect warning issues.",
        )
        try:
            self._maybe_fail(LoopPhase.VERIFY, simulate_failure_at)
            issues = [
                issue
                for metadata in context.get("parser_metadata", [])
                for issue in metadata.get("issues", [])
            ]
            verification = {
                "passed": bool(context.get("resume_profile") or context.get("job_profile")),
                "issue_count": len(issues),
                "issues": issues,
            }
            self.store.complete_step(
                run_id,
                step.step_id,
                output_summary=(
                    f"Verification passed with {len(issues)} parser issue(s)."
                    if verification["passed"]
                    else "Verification failed: no parser profile available."
                ),
            )
            self.store.save_checkpoint(
                run_id,
                name="verify",
                phase=LoopPhase.VERIFY,
                step_id=step.step_id,
                data=verification,
            )
            return verification
        except Exception as exc:
            self.store.fail_step(run_id, step.step_id, str(exc))
            raise

    async def _reflect(
        self,
        run_id: str,
        context: dict,
        simulate_failure_at: LoopPhase | None = None,
    ) -> dict:
        self.store.set_state(run_id, RunState.RUNNING, "reflect")
        step = self.store.add_step(
            run_id,
            name="reflect",
            agent_name="ReflectAgent",
            input_summary="Decide next safe workflow actions from verified parser outputs.",
        )
        try:
            self._maybe_fail(LoopPhase.REFLECT, simulate_failure_at)
            next_actions = []
            if context.get("resume_profile") and context.get("job_profile"):
                next_actions.append("ready_for_matching_agent")
            elif context.get("resume_profile"):
                next_actions.append("need_job_description")
            elif context.get("job_profile"):
                next_actions.append("need_resume")
            reflection = {
                "next_actions": next_actions,
                "requires_human_approval": True,
            }
            self.store.complete_step(
                run_id,
                step.step_id,
                output_summary=f"Reflection produced next actions: {', '.join(next_actions)}.",
            )
            self.store.save_checkpoint(
                run_id,
                name="reflect",
                phase=LoopPhase.REFLECT,
                step_id=step.step_id,
                data=reflection,
            )
            return reflection
        except Exception as exc:
            self.store.fail_step(run_id, step.step_id, str(exc))
            raise

    def _request_human_approval(self, run_id: str) -> None:
        self.store.set_state(run_id, RunState.WAITING_APPROVAL, "human_approval")
        step = self.store.add_step(
            run_id,
            name="human_approval",
            agent_name="HumanApprovalAgent",
            input_summary="Wait for user approval before committing workflow output.",
        )
        self.store.save_checkpoint(
            run_id,
            name="human_approval",
            phase=LoopPhase.HUMAN_APPROVAL,
            step_id=step.step_id,
            data={"approval_required": True},
        )
        self.store.add_event(
            run_id,
            EventType.APPROVAL_REQUIRED,
            "Human approval is required before commit.",
            {"approval_point": "loop_commit"},
        )

    def _context_from_execute_checkpoint(self, run: AgentRun) -> dict:
        execute_checkpoint = next(
            (
                checkpoint
                for checkpoint in reversed(run.checkpoints)
                if checkpoint.phase == LoopPhase.EXECUTE
            ),
            None,
        )
        if not execute_checkpoint:
            raise LoopEngineError("No execute checkpoint available for resume.")
        context = execute_checkpoint.data
        if context.get("resume_profile"):
            ResumeProfile.model_validate(context["resume_profile"])
        if context.get("job_profile"):
            JobProfile.model_validate(context["job_profile"])
        return context

    def _maybe_fail(
        self,
        phase: LoopPhase,
        simulate_failure_at: LoopPhase | None,
    ) -> None:
        if simulate_failure_at == phase:
            raise LoopEngineError(f"Simulated failure at {phase}.")
