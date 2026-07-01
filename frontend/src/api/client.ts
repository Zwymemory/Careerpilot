import type { RunDetail, RunSummary } from "../types";

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
