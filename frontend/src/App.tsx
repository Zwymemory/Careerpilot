import { useEffect, useMemo, useState } from "react";

import { createRun, listRuns } from "./api/client";
import { RunTrace } from "./components/RunTrace";
import type { RunDetail, RunSummary } from "./types";

const defaultGoal =
  "为 AI Agent 实习岗位生成 Week1 可追踪运行计划，保留人工审批点和成本记录。";

export default function App() {
  const [goal, setGoal] = useState(defaultGoal);
  const [runs, setRuns] = useState<RunSummary[]>([]);
  const [activeRun, setActiveRun] = useState<RunDetail | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function refreshRuns() {
    const data = await listRuns();
    setRuns(data);
  }

  useEffect(() => {
    refreshRuns().catch((err: unknown) => {
      setError(err instanceof Error ? err.message : "Failed to load runs.");
    });
  }, []);

  async function handleCreateRun() {
    setIsLoading(true);
    setError(null);
    try {
      const detail = await createRun(goal);
      setActiveRun(detail);
      await refreshRuns();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create run.");
    } finally {
      setIsLoading(false);
    }
  }

  const latestRun = useMemo(() => activeRun?.run ?? null, [activeRun]);

  return (
    <main className="app-shell">
      <section className="top-bar">
        <div>
          <p className="eyebrow">CareerPilot Week1</p>
          <h1>Agent Run Trace</h1>
        </div>
        <div className="status-chip">Evidence-locked</div>
      </section>

      <section className="workspace-grid">
        <div className="command-panel">
          <label htmlFor="goal">Run goal</label>
          <textarea
            id="goal"
            value={goal}
            onChange={(event) => setGoal(event.target.value)}
            rows={5}
          />
          <button type="button" onClick={handleCreateRun} disabled={isLoading}>
            {isLoading ? "Starting..." : "Start Week1 Run"}
          </button>
          {error ? <p className="error-text">{error}</p> : null}
        </div>

        <div className="metric-strip">
          <Metric label="Runs" value={runs.length.toString()} />
          <Metric label="Latest state" value={latestRun?.state ?? "None"} />
          <Metric label="Tokens" value={activeRun?.total_tokens.toString() ?? "0"} />
          <Metric label="Cost CNY" value={(activeRun?.total_cost_cny ?? 0).toFixed(6)} />
        </div>
      </section>

      {activeRun ? (
        <RunTrace detail={activeRun} />
      ) : (
        <section className="empty-state">
          <h2>Ready for the first trace</h2>
          <p>Create a run to see planner output, checkpoints, events, and cost usage.</p>
        </section>
      )}

      <section className="run-list">
        <h2>Recent runs</h2>
        <div className="table">
          {runs.map((run) => (
            <div className="table-row" key={run.run_id}>
              <span>{run.run_id}</span>
              <span>{run.state}</span>
              <span>{run.step_count} steps</span>
              <span>{run.total_tokens} tokens</span>
            </div>
          ))}
        </div>
      </section>
    </main>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="metric">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}
