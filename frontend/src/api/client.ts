import type {
  JobProfile,
  MatchResponse,
  ParseJobResponse,
  ParseResumeResponse,
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
