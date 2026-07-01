from datetime import UTC, datetime
from enum import StrEnum
from typing import Any

from pydantic import BaseModel, Field


class RunState(StrEnum):
    CREATED = "CREATED"
    PLANNING = "PLANNING"
    RUNNING = "RUNNING"
    WAITING_APPROVAL = "WAITING_APPROVAL"
    APPROVED = "APPROVED"
    REJECTED = "REJECTED"
    FAILED = "FAILED"
    COMPLETED = "COMPLETED"


class StepStatus(StrEnum):
    PENDING = "PENDING"
    RUNNING = "RUNNING"
    SUCCEEDED = "SUCCEEDED"
    FAILED = "FAILED"
    SKIPPED = "SKIPPED"


class EventType(StrEnum):
    RUN_CREATED = "RUN_CREATED"
    STATE_CHANGED = "STATE_CHANGED"
    STEP_STARTED = "STEP_STARTED"
    STEP_COMPLETED = "STEP_COMPLETED"
    LLM_CALL_COMPLETED = "LLM_CALL_COMPLETED"
    COST_RECORDED = "COST_RECORDED"
    APPROVAL_REQUIRED = "APPROVAL_REQUIRED"
    ERROR = "ERROR"


class CostUsage(BaseModel):
    provider: str
    model: str
    prompt_tokens: int = 0
    completion_tokens: int = 0
    total_tokens: int = 0
    latency_ms: int = 0
    estimated_cost_cny: float = 0
    created_at: datetime = Field(default_factory=lambda: datetime.now(UTC))


class AgentEvent(BaseModel):
    event_id: str
    run_id: str
    event_type: EventType
    message: str
    payload: dict[str, Any] = Field(default_factory=dict)
    created_at: datetime = Field(default_factory=lambda: datetime.now(UTC))


class AgentStep(BaseModel):
    step_id: str
    run_id: str
    name: str
    agent_name: str
    status: StepStatus = StepStatus.PENDING
    input_summary: str
    output_summary: str | None = None
    latency_ms: int | None = None
    model: str | None = None
    cost_usage: CostUsage | None = None
    error: str | None = None
    created_at: datetime = Field(default_factory=lambda: datetime.now(UTC))
    updated_at: datetime = Field(default_factory=lambda: datetime.now(UTC))


class AgentRun(BaseModel):
    run_id: str
    user_id: str
    goal: str
    state: RunState = RunState.CREATED
    current_step: str | None = None
    idempotency_key: str | None = None
    steps: list[AgentStep] = Field(default_factory=list)
    events: list[AgentEvent] = Field(default_factory=list)
    costs: list[CostUsage] = Field(default_factory=list)
    created_at: datetime = Field(default_factory=lambda: datetime.now(UTC))
    updated_at: datetime = Field(default_factory=lambda: datetime.now(UTC))

    @property
    def total_cost_cny(self) -> float:
        return round(sum(cost.estimated_cost_cny for cost in self.costs), 6)

    @property
    def total_tokens(self) -> int:
        return sum(cost.total_tokens for cost in self.costs)


class CreateRunRequest(BaseModel):
    goal: str = Field(min_length=3, max_length=500)
    user_id: str = Field(default="local-user", min_length=1, max_length=80)


class RunSummary(BaseModel):
    run_id: str
    user_id: str
    goal: str
    state: RunState
    current_step: str | None
    step_count: int
    total_tokens: int
    total_cost_cny: float
    created_at: datetime
    updated_at: datetime


class RunDetail(BaseModel):
    run: AgentRun
    total_tokens: int
    total_cost_cny: float
