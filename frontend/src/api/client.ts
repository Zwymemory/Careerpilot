import type {
  ApplicationResponse,
  ApplicationStatus,
  ApplicationRecord,
  EvalJudgeMode,
  EvalReport,
  EvalReportSummary,
  EvalRunResponse,
  InterviewPackResponse,
  JobCollectResponse,
  JobProfile,
  MatchProfile,
  MatchResponse,
  ParseJobResponse,
  ParseResumeResponse,
  ResumeRewriteResponse,
  ResumeProfile,
  RunDetail,
  RunSummary
} from "../types";

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? "";

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const { headers, ...requestInit } = init ?? {};
  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...requestInit,
    headers: {
      "Content-Type": "application/json",
      ...headers
    }
  });

  if (!response.ok) {
    const message = await response.text();
    throw new Error(message || `Request failed with ${response.status}`);
  }
  return response.json() as Promise<T>;
}

export function listRuns(): Promise<RunSummary[]> {
  return request<RunSummary[]>("/api/runs");
}

export function createRun(goal: string): Promise<RunDetail> {
  return request<RunDetail>("/api/runs", {
    method: "POST",
    headers: {
      "Idempotency-Key": `local-${Date.now()}`
    },
    body: JSON.stringify({ goal, user_id: "local-user" })
  });
}

export function getRun(runId: string): Promise<RunDetail> {
  return request<RunDetail>(`/api/runs/${runId}`);
}

export function parseResume(text: string): Promise<ParseResumeResponse> {
  return request<ParseResumeResponse>("/api/parsers/resume", {
    method: "POST",
    body: JSON.stringify({
      text,
      user_id: "local-user",
      source_name: "frontend-resume"
    })
  });
}

export function parseJob(text: string): Promise<ParseJobResponse> {
  return request<ParseJobResponse>("/api/parsers/job", {
    method: "POST",
    body: JSON.stringify({
      text,
      user_id: "local-user"
    })
  });
}

export function collectJob(payload: {
  url?: string;
  html?: string;
  text?: string;
  source_name?: string;
  capture_screenshot?: boolean;
}): Promise<JobCollectResponse> {
  return request<JobCollectResponse>("/api/job-collector", {
    method: "POST",
    body: JSON.stringify({
      ...payload,
      user_id: "local-user"
    })
  });
}

export function createLoopRun(payload: {
  goal: string;
  resume_text?: string;
  job_text?: string;
}): Promise<RunDetail> {
  return request<RunDetail>("/api/loop-runs", {
    method: "POST",
    headers: {
      "Idempotency-Key": `loop-${Date.now()}`
    },
    body: JSON.stringify({
      ...payload,
      user_id: "local-user"
    })
  });
}

export function approveLoopRun(runId: string, notes?: string): Promise<RunDetail> {
  return request<RunDetail>(`/api/loop-runs/${runId}/approve`, {
    method: "POST",
    body: JSON.stringify({
      approved_by: "local-user",
      notes: notes || null
    })
  });
}

export function resumeLoopRun(runId: string): Promise<RunDetail> {
  return request<RunDetail>(`/api/loop-runs/${runId}/resume`, {
    method: "POST",
    body: JSON.stringify({
      user_id: "local-user"
    })
  });
}

export function createMatch(payload: {
  resume_profile: ResumeProfile;
  job_profile: JobProfile;
}): Promise<MatchResponse> {
  return request<MatchResponse>("/api/matches", {
    method: "POST",
    body: JSON.stringify({
      ...payload,
      user_id: "local-user"
    })
  });
}

export function createRewriteDraft(payload: {
  resume_profile: ResumeProfile;
  job_profile: JobProfile;
  match_profile: MatchProfile;
}): Promise<ResumeRewriteResponse> {
  return request<ResumeRewriteResponse>("/api/rewrite-drafts", {
    method: "POST",
    body: JSON.stringify({
      ...payload,
      user_id: "local-user"
    })
  });
}

export function createInterviewPack(payload: {
  resume_profile: ResumeProfile;
  job_profile: JobProfile;
  match_profile?: MatchProfile;
  rewrite_draft?: ResumeRewriteResponse["draft"];
}): Promise<InterviewPackResponse> {
  return request<InterviewPackResponse>("/api/interview-packs", {
    method: "POST",
    body: JSON.stringify({
      ...payload,
      user_id: "local-user"
    })
  });
}

export function listApplications(userId = "local-user"): Promise<ApplicationRecord[]> {
  return request<ApplicationRecord[]>(`/api/applications?user_id=${encodeURIComponent(userId)}`);
}

export function createApplicationRecord(payload: {
  job_profile: JobProfile;
  resume_profile?: ResumeProfile;
  match_profile?: MatchProfile;
  rewrite_draft?: ResumeRewriteResponse["draft"];
  interview_pack?: InterviewPackResponse["pack"];
  job_url?: string;
  status?: ApplicationStatus;
  notes?: string;
  source_run_ids?: string[];
}): Promise<ApplicationResponse> {
  return request<ApplicationResponse>("/api/applications", {
    method: "POST",
    body: JSON.stringify({
      ...payload,
      user_id: "local-user"
    })
  });
}

export function addApplicationFeedback(
  applicationId: string,
  payload: {
    stage: string;
    feedback_text: string;
    strengths?: string[];
    concerns?: string[];
    follow_up_tasks?: string[];
  },
): Promise<ApplicationResponse> {
  return request<ApplicationResponse>(`/api/applications/${applicationId}/feedback`, {
    method: "POST",
    body: JSON.stringify({
      ...payload,
      user_id: "local-user"
    })
  });
}

export function updateApplicationStatus(
  applicationId: string,
  statusValue: ApplicationStatus,
  notes?: string,
): Promise<ApplicationResponse> {
  return request<ApplicationResponse>(`/api/applications/${applicationId}/status`, {
    method: "PATCH",
    body: JSON.stringify({
      status: statusValue,
      notes: notes || null,
      user_id: "local-user"
    })
  });
}

export function listEvalReports(userId = "local-user"): Promise<EvalReportSummary[]> {
  return request<EvalReportSummary[]>(`/api/evals?user_id=${encodeURIComponent(userId)}`);
}

export function createEvalReport(payload: {
  case_name: string;
  judge_mode?: EvalJudgeMode;
  min_score?: number;
  expected_keywords?: string[];
  required_sections?: string[];
  resume_profile?: ResumeProfile;
  job_profile?: JobProfile;
  match_profile?: MatchProfile;
  rewrite_draft?: ResumeRewriteResponse["draft"];
  interview_pack?: InterviewPackResponse["pack"];
  application_record?: ApplicationRecord;
}): Promise<EvalRunResponse> {
  return request<EvalRunResponse>("/api/evals", {
    method: "POST",
    body: JSON.stringify({
      ...payload,
      user_id: "local-user"
    })
  });
}

export function evalReportHtmlUrl(report: EvalReport): string {
  return `${API_BASE_URL}/api/evals/${report.report_id}/report.html`;
}

export function approveRewriteDraft(runId: string, notes?: string): Promise<RunDetail> {
  return request<RunDetail>(`/api/rewrite-drafts/${runId}/approve`, {
    method: "POST",
    body: JSON.stringify({
      approved_by: "local-user",
      notes: notes || null
    })
  });
}

export async function exportRewritePdf(runId: string): Promise<Blob> {
  const response = await fetch(`${API_BASE_URL}/api/rewrite-drafts/${runId}/export.pdf`);
  if (!response.ok) {
    const message = await response.text();
    throw new Error(message || `Request failed with ${response.status}`);
  }
  return response.blob();
}
