from app.core.config import Settings
from app.schemas.llm import ChatMessage, LLMRequest
from app.schemas.run import CostUsage, EventType, RunState
from app.services.llm_client import LLMClient
from app.services.run_store import RunStore


class RunOrchestrator:
    def __init__(self, settings: Settings, store: RunStore) -> None:
        self.settings = settings
        self.store = store
        self.llm_client = LLMClient(settings)

    async def start_week1_run(
        self,
        user_id: str,
        goal: str,
        idempotency_key: str | None,
    ):
        run = self.store.create_run(user_id=user_id, goal=goal, idempotency_key=idempotency_key)
        if run.steps:
            return run

        self.store.set_state(run.run_id, RunState.PLANNING, "planner")
        planner_step = self.store.add_step(
            run.run_id,
            name="planner",
            agent_name="PlannerAgent",
            input_summary="Create a safe Week1 execution plan with approval points.",
        )

        response = await self.llm_client.chat(
            LLMRequest(
                messages=[
                    ChatMessage(
                        role="system",
                        content=(
                            "You are CareerPilot PlannerAgent. Respect evidence-locked "
                            "generation and human-in-the-loop rules."
                        ),
                    ),
                    ChatMessage(role="user", content=goal),
                ]
            )
        )
        cost = CostUsage(
            provider=response.provider,
            model=response.model,
            prompt_tokens=response.usage.prompt_tokens,
            completion_tokens=response.usage.completion_tokens,
            total_tokens=response.usage.total_tokens,
            latency_ms=response.latency_ms,
            estimated_cost_cny=response.estimated_cost_cny,
        )
        self.store.complete_step(
            run.run_id,
            planner_step.step_id,
            output_summary=response.content,
            latency_ms=response.latency_ms,
            model=response.model,
            cost_usage=cost,
        )
        self.store.add_event(
            run.run_id,
            EventType.LLM_CALL_COMPLETED,
            "PlannerAgent LLM call completed.",
            {"dry_run": response.dry_run, "model": response.model},
        )

        self.store.set_state(run.run_id, RunState.RUNNING, "trace_commit")
        trace_step = self.store.add_step(
            run.run_id,
            name="trace_commit",
            agent_name="TraceAgent",
            input_summary="Persist run trace, step result, and cost summary.",
        )
        self.store.complete_step(
            run.run_id,
            trace_step.step_id,
            output_summary="Run trace checkpoint is available for frontend inspection.",
        )

        self.store.set_state(run.run_id, RunState.WAITING_APPROVAL, "human_approval")
        self.store.add_event(
            run.run_id,
            EventType.APPROVAL_REQUIRED,
            "Human approval is required before any user-facing artifact export.",
            {"approval_point": "export_artifact"},
        )
        return self.store.get_run(run.run_id)
