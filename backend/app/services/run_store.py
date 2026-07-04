from datetime import UTC, datetime
from uuid import uuid4

from app.schemas.run import (
    AgentCheckpoint,
    AgentEvent,
    AgentRun,
    AgentStep,
    CostSummary,
    CostUsage,
    EventType,
    ModelCostSummary,
    RunState,
    RunSummary,
    StepStatus,
)


def new_id(prefix: str) -> str:
    return f"{prefix}_{uuid4().hex[:12]}"


class RunStore:
    """Week1 in-memory store. Replace with SQLAlchemy repositories in Week3."""

    def __init__(self) -> None:
        self._runs: dict[str, AgentRun] = {}
        self._idempotency_index: dict[tuple[str, str], str] = {}

    def create_run(self, user_id: str, goal: str, idempotency_key: str | None) -> AgentRun:
        if idempotency_key:
            existing_run_id = self._idempotency_index.get((user_id, idempotency_key))
            if existing_run_id:
                return self._runs[existing_run_id]

        run = AgentRun(
            run_id=new_id("run"),
            user_id=user_id,
            goal=goal,
            idempotency_key=idempotency_key,
        )
        self._runs[run.run_id] = run
        if idempotency_key:
            self._idempotency_index[(user_id, idempotency_key)] = run.run_id
        self.add_event(run.run_id, EventType.RUN_CREATED, "Run created.", {"goal": goal})
        return run

    def list_runs(self) -> list[RunSummary]:
        return [
            RunSummary(
                run_id=run.run_id,
                user_id=run.user_id,
                goal=run.goal,
                state=run.state,
                current_step=run.current_step,
                step_count=len(run.steps),
                total_tokens=run.total_tokens,
                total_cost_cny=run.total_cost_cny,
                created_at=run.created_at,
                updated_at=run.updated_at,
            )
            for run in sorted(self._runs.values(), key=lambda item: item.created_at, reverse=True)
        ]

    def get_run(self, run_id: str) -> AgentRun | None:
        return self._runs.get(run_id)

    def clear(self) -> None:
        self._runs.clear()
        self._idempotency_index.clear()

    def cost_summary(self) -> CostSummary:
        costs = [cost for run in self._runs.values() for cost in run.costs]
        by_model: dict[tuple[str, str], dict[str, int | float]] = {}
        for cost in costs:
            key = (cost.provider, cost.model)
            bucket = by_model.setdefault(
                key,
                {
                    "call_count": 0,
                    "prompt_tokens": 0,
                    "completion_tokens": 0,
                    "total_tokens": 0,
                    "estimated_cost_cny": 0.0,
                },
            )
            bucket["call_count"] += 1
            bucket["prompt_tokens"] += cost.prompt_tokens
            bucket["completion_tokens"] += cost.completion_tokens
            bucket["total_tokens"] += cost.total_tokens
            bucket["estimated_cost_cny"] += cost.estimated_cost_cny

        model_summaries = [
            ModelCostSummary(
                provider=provider,
                model=model,
                call_count=int(bucket["call_count"]),
                prompt_tokens=int(bucket["prompt_tokens"]),
                completion_tokens=int(bucket["completion_tokens"]),
                total_tokens=int(bucket["total_tokens"]),
                estimated_cost_cny=round(float(bucket["estimated_cost_cny"]), 6),
            )
            for (provider, model), bucket in sorted(by_model.items())
        ]
        return CostSummary(
            run_count=len(self._runs),
            cost_record_count=len(costs),
            prompt_tokens=sum(cost.prompt_tokens for cost in costs),
            completion_tokens=sum(cost.completion_tokens for cost in costs),
            total_tokens=sum(cost.total_tokens for cost in costs),
            estimated_cost_cny=round(sum(cost.estimated_cost_cny for cost in costs), 6),
            by_model=model_summaries,
            recent=sorted(costs, key=lambda item: item.created_at, reverse=True)[:8],
        )

    def set_state(self, run_id: str, state: RunState, current_step: str | None = None) -> AgentRun:
        run = self._must_get(run_id)
        run.state = state
        run.current_step = current_step
        run.updated_at = datetime.now(UTC)
        self.add_event(
            run_id,
            EventType.STATE_CHANGED,
            f"State changed to {state}.",
            {"state": state, "current_step": current_step},
        )
        return run

    def add_step(
        self,
        run_id: str,
        name: str,
        agent_name: str,
        input_summary: str,
    ) -> AgentStep:
        run = self._must_get(run_id)
        step = AgentStep(
            step_id=new_id("step"),
            run_id=run_id,
            name=name,
            agent_name=agent_name,
            status=StepStatus.RUNNING,
            input_summary=input_summary,
        )
        run.steps.append(step)
        run.current_step = name
        run.updated_at = datetime.now(UTC)
        self.add_event(
            run_id,
            EventType.STEP_STARTED,
            f"Step {name} started.",
            {"step_id": step.step_id},
        )
        return step

    def complete_step(
        self,
        run_id: str,
        step_id: str,
        output_summary: str,
        latency_ms: int | None = None,
        model: str | None = None,
        cost_usage: CostUsage | None = None,
    ) -> AgentStep:
        run = self._must_get(run_id)
        step = self._must_get_step(run, step_id)
        step.status = StepStatus.SUCCEEDED
        step.output_summary = output_summary
        step.latency_ms = latency_ms
        step.model = model
        step.cost_usage = cost_usage
        step.updated_at = datetime.now(UTC)
        run.updated_at = datetime.now(UTC)
        if cost_usage:
            self.record_cost(run_id, cost_usage)
        self.add_event(
            run_id,
            EventType.STEP_COMPLETED,
            f"Step {step.name} completed.",
            {"step_id": step.step_id, "output_summary": output_summary},
        )
        return step

    def record_cost(self, run_id: str, cost_usage: CostUsage) -> None:
        run = self._must_get(run_id)
        run.costs.append(cost_usage)
        run.updated_at = datetime.now(UTC)
        self.add_event(
            run_id,
            EventType.COST_RECORDED,
            "LLM usage and estimated cost recorded.",
            cost_usage.model_dump(mode="json"),
        )

    def skip_step(self, run_id: str, step_id: str, reason: str) -> AgentStep:
        run = self._must_get(run_id)
        step = self._must_get_step(run, step_id)
        step.status = StepStatus.SKIPPED
        step.output_summary = reason
        step.updated_at = datetime.now(UTC)
        run.updated_at = datetime.now(UTC)
        self.add_event(
            run_id,
            EventType.STEP_COMPLETED,
            f"Step {step.name} skipped.",
            {"step_id": step.step_id, "reason": reason},
        )
        return step

    def fail_step(self, run_id: str, step_id: str, error: str) -> AgentStep:
        run = self._must_get(run_id)
        step = self._must_get_step(run, step_id)
        step.status = StepStatus.FAILED
        step.error = error
        step.updated_at = datetime.now(UTC)
        run.state = RunState.FAILED
        run.updated_at = datetime.now(UTC)
        self.add_event(run_id, EventType.ERROR, error, {"step_id": step_id})
        return step

    def save_checkpoint(
        self,
        run_id: str,
        name: str,
        phase: str,
        data: dict,
        step_id: str | None = None,
    ) -> AgentCheckpoint:
        run = self._must_get(run_id)
        checkpoint = AgentCheckpoint(
            checkpoint_id=new_id("checkpoint"),
            run_id=run_id,
            step_id=step_id,
            name=name,
            phase=phase,
            data=data,
        )
        run.checkpoints.append(checkpoint)
        run.updated_at = datetime.now(UTC)
        self.add_event(
            run_id,
            EventType.CHECKPOINT_SAVED,
            f"Checkpoint {name} saved.",
            {
                "checkpoint_id": checkpoint.checkpoint_id,
                "phase": phase,
                "step_id": step_id,
            },
        )
        return checkpoint

    def add_event(
        self,
        run_id: str,
        event_type: EventType,
        message: str,
        payload: dict,
    ) -> AgentEvent:
        run = self._must_get(run_id)
        event = AgentEvent(
            event_id=new_id("event"),
            run_id=run_id,
            event_type=event_type,
            message=message,
            payload=payload,
        )
        run.events.append(event)
        return event

    def _must_get(self, run_id: str) -> AgentRun:
        run = self.get_run(run_id)
        if not run:
            raise KeyError(run_id)
        return run

    @staticmethod
    def _must_get_step(run: AgentRun, step_id: str) -> AgentStep:
        for step in run.steps:
            if step.step_id == step_id:
                return step
        raise KeyError(step_id)


run_store = RunStore()
