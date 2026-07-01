export type RunState =
  | "CREATED"
  | "PLANNING"
  | "RUNNING"
  | "WAITING_APPROVAL"
  | "APPROVED"
  | "REJECTED"
  | "FAILED"
  | "COMPLETED";

export type StepStatus = "PENDING" | "RUNNING" | "SUCCEEDED" | "FAILED" | "SKIPPED";

export interface CostUsage {
  provider: string;
  model: string;
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens: number;
  latency_ms: number;
  estimated_cost_cny: number;
  created_at: string;
}

export interface AgentStep {
  step_id: string;
  run_id: string;
  name: string;
  agent_name: string;
  status: StepStatus;
  input_summary: string;
  output_summary: string | null;
  latency_ms: number | null;
  model: string | null;
  cost_usage: CostUsage | null;
  error: string | null;
  created_at: string;
  updated_at: string;
}

export interface AgentEvent {
  event_id: string;
  run_id: string;
  event_type: string;
  message: string;
  payload: Record<string, unknown>;
  created_at: string;
}

export interface AgentRun {
  run_id: string;
  user_id: string;
  goal: string;
  state: RunState;
  current_step: string | null;
  idempotency_key: string | null;
  steps: AgentStep[];
  events: AgentEvent[];
  costs: CostUsage[];
  created_at: string;
  updated_at: string;
}

export interface RunSummary {
  run_id: string;
  user_id: string;
  goal: string;
  state: RunState;
  current_step: string | null;
  step_count: number;
  total_tokens: number;
  total_cost_cny: number;
  created_at: string;
  updated_at: string;
}

export interface RunDetail {
  run: AgentRun;
  total_tokens: number;
  total_cost_cny: number;
}
