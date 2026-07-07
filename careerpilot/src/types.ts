export interface ResumeProfile {
  education: string[];
  skills: string[];
  projects: string[];
  experiences: string[];
  keywords: string[];
}

export interface JobProfile {
  company: string;
  title: string;
  hard_requirements: string[];
  nice_to_have: string[];
  responsibilities: string[];
  keywords: string[];
}

export interface EvidenceMapping {
  requirement: string;
  resume_evidence: string;
  confidence: number; // 0-100
  is_inferred: boolean;
}

export interface GapItem {
  gap_type: '真实缺失' | '表达缺失' | '证据不足';
  description: string;
}

export interface MatchReport {
  score: number;
  level: string; // "完全匹配" | "部分匹配" | "不匹配"
  evidence_mappings: EvidenceMapping[];
  gaps: GapItem[];
  rewrite_priorities: string[];
}

export interface RewriteSection {
  title: string;
  content: string;
  original: string;
  modified: boolean;
}

export interface RewriteChange {
  field: string;
  before: string;
  after: string;
  reason: string;
}

export interface RewriteRisk {
  risk_level: 'HIGH' | 'MEDIUM' | 'LOW';
  description: string;
}

export interface RewriteDraft {
  headline: string;
  summary: string;
  sections: RewriteSection[];
  changes: RewriteChange[];
  risks: RewriteRisk[];
}

export interface StarAnswer {
  situation: string;
  task: string;
  action: string;
  result: string;
}

export interface PredictedQuestion {
  question: string;
  intent: string;
  star_suggested_answer: StarAnswer;
}

export interface ProjectFollowup {
  project_name: string;
  question: string;
  reference_point: string;
}

export interface InterviewPack {
  readiness_score: number;
  predicted_questions: PredictedQuestion[];
  project_followups: ProjectFollowup[];
  answer_frameworks: string[];
  truthfulness_warnings: string[];
  needs_practice: string[];
}

export interface Application {
  id: string;
  company: string;
  title: string;
  resume_run_id: string;
  match_run_id: string;
  interview_pack_run_id: string;
  status: 'ready_to_apply' | 'applied' | 'interviewing' | 'offer' | 'rejected';
  notes: string;
  memory?: string;
  created_at: string;
}

export interface EvalItem {
  check_name: string;
  status: 'PASS' | 'WARN' | 'FAIL';
  description: string;
}

export interface EvalReport {
  report_id: string;
  score: number;
  gate: 'PASS' | 'WARN' | 'FAIL';
  passed: number;
  warnings: number;
  failures: number;
  items: EvalItem[];
}

export interface LoopStep {
  step_id: string;
  name: string;
  status: 'PENDING' | 'RUNNING' | 'COMPLETED' | 'FAILED';
  started_at?: string;
  completed_at?: string;
  output_summary?: string;
}

export interface LoopEvent {
  timestamp: string;
  level: 'info' | 'warn' | 'error';
  message: string;
}

export interface CostSummary {
  token_count: number;
  cost_cny: number;
  latency_ms: number;
}

export interface LoopRun {
  run_id: string;
  goal: string;
  state: 'CREATED' | 'RUNNING' | 'WAITING_APPROVAL' | 'COMPLETED' | 'FAILED';
  steps: LoopStep[];
  events: LoopEvent[];
  cost_summary: CostSummary;
  user_id: string;
}

export interface ProviderBalance {
  provider: string;
  label: string;
  configured: boolean;
  live: boolean;
  status: string;
  percent_remaining: number;
  estimated_calls_remaining: number;
  balance_label: string;
  remaining_label: string;
  unit_label: string;
  source: 'live' | 'estimate';
  issues: string[];
}
