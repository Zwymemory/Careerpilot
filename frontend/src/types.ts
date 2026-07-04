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

export interface AgentCheckpoint {
  checkpoint_id: string;
  run_id: string;
  step_id: string | null;
  name: string;
  phase: string;
  data: Record<string, unknown>;
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
  checkpoints: AgentCheckpoint[];
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

export interface ParseIssue {
  code: string;
  message: string;
  severity: "info" | "warning" | "error";
  field_path: string | null;
}

export interface EvidenceItem {
  field_path: string;
  source_text: string;
  confidence: number;
  is_inferred: boolean;
}

export interface ResumeEducation {
  school: string;
  degree: string | null;
  major: string | null;
  start_date: string | null;
  end_date: string | null;
  evidence: EvidenceItem[];
}

export interface ResumeProject {
  name: string;
  description: string;
  skills: string[];
  evidence: EvidenceItem[];
}

export interface ResumeExperience {
  company: string | null;
  title: string;
  description: string;
  start_date: string | null;
  end_date: string | null;
  evidence: EvidenceItem[];
}

export interface ResumeProfile {
  education: ResumeEducation[];
  skills: string[];
  projects: ResumeProject[];
  experiences: ResumeExperience[];
  keywords: string[];
  evidence: EvidenceItem[];
  inferred_fields: string[];
  needs_confirmation: string[];
}

export interface JobProfile {
  company: string | null;
  title: string | null;
  hard_requirements: string[];
  nice_to_have: string[];
  responsibilities: string[];
  tech_keywords: string[];
  hidden_keywords: string[];
  company_context: string[];
  evidence: EvidenceItem[];
  inferred_fields: string[];
  needs_confirmation: string[];
}

export interface ParseMetadata {
  parser: "resume" | "job";
  source: "llm_structured_output" | "heuristic_dry_run" | "heuristic_fallback";
  model: string | null;
  dry_run: boolean;
  json_repaired: boolean;
  issues: ParseIssue[];
}

export interface ParseResumeResponse {
  run_id: string;
  profile: ResumeProfile;
  metadata: ParseMetadata;
}

export interface ParseJobResponse {
  run_id: string;
  profile: JobProfile;
  metadata: ParseMetadata;
}

export interface BrowserSafetyReport {
  allowed: boolean;
  rules: string[];
  warnings: string[];
  blocked_reason: string | null;
}

export interface JobSnapshot {
  source_type: "url" | "html" | "text";
  source_url: string | null;
  source_name: string | null;
  title: string | null;
  text: string;
  text_hash: string;
  html_hash: string | null;
  screenshot_path: string | null;
  screenshot_hash: string | null;
  screenshot_status: "captured" | "skipped" | "unavailable";
  captured_at: string;
  safety: BrowserSafetyReport;
}

export interface JobCollectResponse {
  run_id: string;
  snapshot: JobSnapshot;
  profile: JobProfile;
  metadata: ParseMetadata;
}

export interface MatchEvidence {
  requirement: string;
  matched_resume_items: string[];
  missing_terms: string[];
  evidence: EvidenceItem[];
  confidence: number;
}

export interface MatchGap {
  requirement: string;
  severity: "low" | "medium" | "high";
  reason: string;
  suggested_action: string;
}

export interface MatchPriority {
  item: string;
  priority: "P0" | "P1" | "P2";
  reason: string;
}

export interface MatchScoreBreakdown {
  hard_requirements: number;
  nice_to_have: number;
  responsibilities: number;
  keyword_alignment: number;
}

export interface MatchProfile {
  overall_score: number;
  score_breakdown: MatchScoreBreakdown;
  evidence_mapping: MatchEvidence[];
  gaps: MatchGap[];
  priority_ranking: MatchPriority[];
  matched_keywords: string[];
  missing_keywords: string[];
  summary: string;
}

export interface MatchResponse {
  run_id: string;
  match: MatchProfile;
}

export interface RewriteChange {
  change_id: string;
  section: "summary" | "skills" | "project" | "experience" | "evidence_needed";
  original_text: string;
  revised_text: string;
  rationale: string;
  evidence: EvidenceItem[];
  risk_level: "low" | "medium" | "high";
}

export interface TailoredResumeProject {
  name: string;
  bullets: string[];
  evidence_paths: string[];
}

export interface TailoredResumeArtifact {
  language: "zh-CN";
  company: string | null;
  title: string | null;
  headline: string;
  summary: string;
  skills: string[];
  projects: TailoredResumeProject[];
  experiences: string[];
  education: string[];
  evidence_notice: string;
  risk_notes: string[];
  markdown: string;
}

export interface ResumeRewriteDraft {
  draft_id: string;
  approval_status: "WAITING_APPROVAL" | "APPROVED" | "REJECTED";
  company: string | null;
  title: string | null;
  headline: string;
  target_keywords: string[];
  changes: RewriteChange[];
  risk_warnings: string[];
  tailored_resume: TailoredResumeArtifact | null;
  markdown: string;
}

export interface ResumeRewriteResponse {
  run_id: string;
  draft: ResumeRewriteDraft;
}

export type InterviewQuestionCategory =
  | "technical"
  | "project"
  | "behavioral"
  | "gap"
  | "system_design";

export interface InterviewQuestion {
  question_id: string;
  category: InterviewQuestionCategory;
  question: string;
  why_asked: string;
  suggested_angle: string;
  priority: "P0" | "P1" | "P2";
  evidence: EvidenceItem[];
}

export interface ProjectFollowUp {
  project_name: string;
  question: string;
  probe_focus: string;
  evidence: EvidenceItem[];
  risk_flags: string[];
}

export interface StarAnswerDraft {
  prompt: string;
  situation: string;
  task: string;
  action: string;
  result: string;
  evidence: EvidenceItem[];
  risk_notes: string[];
}

export interface KnowledgePoint {
  topic: string;
  why_matters: string;
  current_signal: "covered" | "partial" | "gap";
  review_prompt: string;
  evidence: EvidenceItem[];
}

export interface MockInterviewDimension {
  name: string;
  score: number;
  feedback: string;
}

export interface MockInterviewScore {
  overall_score: number;
  dimensions: MockInterviewDimension[];
  strengths: string[];
  risks: string[];
  next_actions: string[];
}

export interface InterviewPack {
  pack_id: string;
  company: string | null;
  title: string | null;
  target_keywords: string[];
  predicted_questions: InterviewQuestion[];
  project_followups: ProjectFollowUp[];
  star_answers: StarAnswerDraft[];
  knowledge_points: KnowledgePoint[];
  mock_score: MockInterviewScore;
  evidence_warnings: string[];
  markdown: string;
}

export interface InterviewPackResponse {
  run_id: string;
  pack: InterviewPack;
}

export type ApplicationStatus =
  | "SAVED"
  | "READY_TO_APPLY"
  | "APPLIED"
  | "INTERVIEWING"
  | "OFFER"
  | "REJECTED"
  | "ARCHIVED";

export interface ApplicationMemory {
  memory_id: string;
  category: "strength" | "gap" | "preference" | "feedback" | "follow_up";
  text: string;
  source: string;
  confidence: number;
  evidence: EvidenceItem[];
  created_at: string;
}

export interface ApplicationTask {
  task_id: string;
  title: string;
  reason: string;
  priority: "P0" | "P1" | "P2";
  status: "OPEN" | "DONE";
  due_hint: string | null;
  created_at: string;
  completed_at: string | null;
}

export interface InterviewFeedback {
  feedback_id: string;
  stage: string;
  feedback_text: string;
  strengths: string[];
  concerns: string[];
  follow_up_tasks: string[];
  created_at: string;
}

export interface ApplicationRecord {
  application_id: string;
  user_id: string;
  company: string | null;
  title: string | null;
  job_url: string | null;
  status: ApplicationStatus;
  match_score: number | null;
  interview_score: number | null;
  resume_headline: string | null;
  target_keywords: string[];
  notes: string | null;
  memories: ApplicationMemory[];
  tasks: ApplicationTask[];
  feedback: InterviewFeedback[];
  source_run_ids: string[];
  created_at: string;
  updated_at: string;
}

export interface ApplicationResponse {
  run_id: string;
  record: ApplicationRecord;
}

export type EvalArtifactType =
  | "parser"
  | "matching"
  | "rewrite"
  | "interview"
  | "application"
  | "judge";

export type EvalRuleStatus = "passed" | "warning" | "failed";
export type EvalRuleSeverity = "info" | "warning" | "critical";
export type EvalGateDecision = "PASS" | "WARN" | "BLOCK";
export type EvalJudgeMode = "rule_based" | "llm_as_judge_dry_run" | "llm_as_judge";

export interface EvalRuleResult {
  rule_id: string;
  category: EvalArtifactType;
  name: string;
  status: EvalRuleStatus;
  severity: EvalRuleSeverity;
  score: number;
  message: string;
  evidence: string[];
}

export interface QualityGateResult {
  decision: EvalGateDecision;
  passed: boolean;
  score: number;
  blocking_reasons: string[];
  warnings: string[];
  release_notes: string[];
}

export interface EvalReport {
  report_id: string;
  user_id: string;
  case_name: string;
  judge_mode: EvalJudgeMode;
  evaluated_artifacts: EvalArtifactType[];
  overall_score: number;
  gate: QualityGateResult;
  rule_results: EvalRuleResult[];
  summary: string;
  html_report: string;
  judge_cost_usage: CostUsage | null;
  created_at: string;
}

export interface EvalReportSummary {
  report_id: string;
  case_name: string;
  judge_mode: EvalJudgeMode;
  overall_score: number;
  decision: EvalGateDecision;
  evaluated_artifacts: EvalArtifactType[];
  created_at: string;
}

export interface EvalRunResponse {
  run_id: string;
  report: EvalReport;
}
