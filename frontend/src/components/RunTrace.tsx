import type { RunDetail } from "../types";

export function RunTrace({ detail }: { detail: RunDetail }) {
  const { run } = detail;

  return (
    <section className="trace-layout">
      <div className="trace-main glass-surface liftable revealable">
        <div className="section-heading">
          <div>
            <p className="eyebrow">Active trace</p>
            <h2>{run.goal}</h2>
          </div>
          <span className="state-badge">{run.state}</span>
        </div>

        <div className="timeline">
          {run.steps.map((step, index) => (
            <article className="step-card liftable revealable" key={step.step_id}>
              <div className="step-index">{String(index + 1).padStart(2, "0")}</div>
              <div className="step-body">
                <div className="step-heading">
                  <div>
                    <p className="eyebrow">{step.agent_name}</p>
                    <h3>{step.name}</h3>
                  </div>
                  <span className={`step-status step-status-${step.status.toLowerCase()}`}>
                    {step.status}
                  </span>
                </div>
                <p>{step.input_summary}</p>
                {step.output_summary ? <p className="output-text">{step.output_summary}</p> : null}
                {step.cost_usage ? (
                  <dl className="cost-grid">
                    <div>
                      <dt>Model</dt>
                      <dd>{step.cost_usage.model}</dd>
                    </div>
                    <div>
                      <dt>Tokens</dt>
                      <dd>{step.cost_usage.total_tokens}</dd>
                    </div>
                    <div>
                      <dt>Latency</dt>
                      <dd>{step.cost_usage.latency_ms}ms</dd>
                    </div>
                    <div>
                      <dt>Cost</dt>
                      <dd>{step.cost_usage.estimated_cost_cny.toFixed(6)}</dd>
                    </div>
                  </dl>
                ) : null}
              </div>
            </article>
          ))}
        </div>
      </div>

      <aside className="event-panel glass-surface liftable revealable">
        <p className="eyebrow">Events</p>
        <h2>Runtime signal</h2>
        <div className="event-stack">
          {run.events.map((event) => (
            <div className="event-row liftable revealable" key={event.event_id}>
              <span>{event.event_type}</span>
              <p>{event.message}</p>
            </div>
          ))}
        </div>
      </aside>
    </section>
  );
}
