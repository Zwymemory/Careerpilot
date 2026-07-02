import type { RunDetail } from "../types";

type OutputBlock =
  | { kind: "heading"; level: number; text: string }
  | { kind: "paragraph"; text: string }
  | { kind: "list"; items: string[] }
  | { kind: "table"; rows: string[][] };

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
                {step.output_summary ? <FormattedOutput text={step.output_summary} /> : null}
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

function FormattedOutput({ text }: { text: string }) {
  const blocks = parseOutputBlocks(text);

  return (
    <div className="formatted-output">
      {blocks.map((block, index) => {
        if (block.kind === "heading") {
          const HeadingTag = block.level <= 3 ? "h4" : "h5";
          return <HeadingTag key={`heading-${index}`}>{block.text}</HeadingTag>;
        }

        if (block.kind === "list") {
          return (
            <ul key={`list-${index}`}>
              {block.items.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          );
        }

        if (block.kind === "table") {
          const [header, ...rows] = block.rows;
          return (
            <div className="output-table-wrap" key={`table-${index}`}>
              <table className="output-table">
                {header ? (
                  <thead>
                    <tr>
                      {header.map((cell) => (
                        <th key={cell}>{cell}</th>
                      ))}
                    </tr>
                  </thead>
                ) : null}
                <tbody>
                  {rows.map((row, rowIndex) => (
                    <tr key={`${row.join("-")}-${rowIndex}`}>
                      {row.map((cell, cellIndex) => (
                        <td key={`${cell}-${cellIndex}`}>{cell}</td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          );
        }

        return <p key={`paragraph-${index}`}>{block.text}</p>;
      })}
    </div>
  );
}

function parseOutputBlocks(text: string): OutputBlock[] {
  const normalized = normalizeOutputText(text);
  const lines = normalized
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
  const blocks: OutputBlock[] = [];
  let listItems: string[] = [];
  let tableRows: string[][] = [];

  const flushList = () => {
    if (listItems.length) {
      blocks.push({ kind: "list", items: listItems });
      listItems = [];
    }
  };

  const flushTable = () => {
    const usefulRows = tableRows.filter(
      (row) => !row.every((cell) => /^:?-{2,}:?$/.test(cell.replace(/\s/g, ""))),
    );
    if (usefulRows.length) {
      blocks.push({ kind: "table", rows: usefulRows });
    }
    tableRows = [];
  };

  lines.forEach((line) => {
    const headingMatch = line.match(/^(#{2,6})\s+(.+)$/);
    if (headingMatch) {
      flushList();
      flushTable();
      blocks.push({
        kind: "heading",
        level: headingMatch[1].length,
        text: cleanInlineMarkdown(headingMatch[2])
      });
      return;
    }

    if (line.includes("|") && line.split("|").filter((cell) => cell.trim()).length >= 2) {
      flushList();
      const cells = line
        .split("|")
        .map((cell) => cleanInlineMarkdown(cell))
        .filter(Boolean);
      if (cells.length) {
        tableRows.push(cells);
      }
      return;
    }

    const listMatch = line.match(/^(?:[-*]|\d+\.)\s+(.+)$/);
    if (listMatch) {
      flushTable();
      listItems.push(cleanInlineMarkdown(listMatch[1]));
      return;
    }

    flushList();
    flushTable();
    blocks.push({ kind: "paragraph", text: cleanInlineMarkdown(line) });
  });

  flushList();
  flushTable();

  return blocks.length ? blocks : [{ kind: "paragraph", text: cleanInlineMarkdown(text) }];
}

function normalizeOutputText(text: string): string {
  return text
    .replace(/\r/g, "")
    .replace(/\s+---\s+/g, "\n\n")
    .replace(/\s+(#{2,6}\s+)/g, "\n\n$1")
    .replace(/\s+(\*\*[^*]+：\*\*)/g, "\n\n$1")
    .replace(/\s+(\|\s*[^|\n]+(?:\|[^|\n]+){2,}\|?)/g, "\n$1")
    .replace(/\s+(\|\s*:?-{2,}:?\s*(?:\|\s*:?-{2,}:?\s*)+\|?)/g, "\n$1")
    .replace(/\n{3,}/g, "\n\n");
}

function cleanInlineMarkdown(value: string): string {
  return value
    .replace(/\*\*(.*?)\*\*/g, "$1")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/\s{2,}/g, " ")
    .trim();
}
