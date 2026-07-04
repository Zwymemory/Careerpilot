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
            <p className="eyebrow">当前运行轨迹</p>
            <h2>{run.goal}</h2>
          </div>
          <span className="state-badge">{formatRunState(run.state)}</span>
        </div>

        <div className="timeline">
          {run.steps.map((step, index) => (
            <article className="step-card liftable" key={step.step_id}>
              <div className="step-index">{String(index + 1).padStart(2, "0")}</div>
              <div className="step-body">
                <div className="step-heading">
                  <div>
                    <p className="eyebrow">{step.agent_name}</p>
                    <h3>{formatStepName(step.name)}</h3>
                  </div>
                  <span className={`step-status step-status-${step.status.toLowerCase()}`}>
                    {formatStepStatus(step.status)}
                  </span>
                </div>
                <p>{localizeTraceText(step.input_summary)}</p>
                {step.output_summary ? (
                  <FormattedOutput text={localizeTraceText(step.output_summary)} />
                ) : null}
                {step.cost_usage ? (
                  <dl className="cost-grid">
                    <div>
                      <dt>模型</dt>
                      <dd>{step.cost_usage.model}</dd>
                    </div>
                    <div>
                      <dt>Token</dt>
                      <dd>{step.cost_usage.total_tokens}</dd>
                    </div>
                    <div>
                      <dt>延迟</dt>
                      <dd>{step.cost_usage.latency_ms}ms</dd>
                    </div>
                    <div>
                      <dt>成本</dt>
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
        <p className="eyebrow">事件</p>
        <h2>运行信号</h2>
        <div className="event-stack">
          {run.events.map((event) => (
            <div className="event-row liftable" key={event.event_id}>
              <span>{formatEventType(event.event_type)}</span>
              <p>{localizeTraceText(event.message)}</p>
            </div>
          ))}
        </div>
      </aside>
    </section>
  );
}

function formatRunState(state: string): string {
  const labels: Record<string, string> = {
    IDLE: "空闲",
    CREATED: "已创建",
    RUNNING: "运行中",
    WAITING_APPROVAL: "等待审批",
    COMPLETED: "已完成",
    FAILED: "失败",
    CANCELLED: "已取消",
    PAUSED: "已暂停"
  };
  return labels[state] ?? titleizeToken(state);
}

function formatStepStatus(status: string): string {
  const labels: Record<string, string> = {
    PENDING: "等待中",
    RUNNING: "运行中",
    SUCCEEDED: "已成功",
    FAILED: "失败",
    SKIPPED: "已跳过"
  };
  return labels[status] ?? titleizeToken(status);
}

function formatStepName(name: string): string {
  const labels: Record<string, string> = {
    planner: "规划器",
    trace_commit: "轨迹提交",
    plan: "规划",
    execute: "执行",
    verify: "校验",
    reflect: "反思",
    human_approval: "人工审批",
    commit: "提交",
    resume_parser: "简历解析",
    job_parser: "JD 解析",
    match_agent: "匹配分析",
    rewrite_draft: "改写草稿",
    rewrite_approval: "改写审批",
    rewrite_export: "PDF 导出",
    job_collect: "岗位收集",
    parse_collected_job: "收集结果解析",
    interview_generate: "面试准备包"
  };
  return labels[name] ?? titleizeToken(name);
}

function formatEventType(eventType: string): string {
  const labels: Record<string, string> = {
    RUN_CREATED: "运行已创建",
    STATE_CHANGED: "状态变更",
    STEP_STARTED: "步骤开始",
    STEP_COMPLETED: "步骤完成",
    CHECKPOINT_SAVED: "Checkpoint 已保存",
    RESUME_REQUESTED: "请求恢复",
    LLM_CALL_COMPLETED: "LLM 调用完成",
    COST_RECORDED: "成本已记录",
    APPROVAL_REQUIRED: "需要审批",
    APPROVAL_COMPLETED: "审批完成",
    ERROR: "错误"
  };
  return labels[eventType] ?? titleizeToken(eventType);
}

function localizeTraceText(text: string): string {
  return text
    .replace("Run created.", "运行已创建。")
    .replace(
      "Create a safe Week1 execution plan with approval points.",
      "创建包含人工审批点的 Week1 安全执行计划。",
    )
    .replace(
      "Persist run trace, step result, and cost summary.",
      "持久化运行轨迹、步骤结果和成本摘要。",
    )
    .replace(
      "Run trace checkpoint is available for frontend inspection.",
      "运行轨迹 checkpoint 已可在前端检查。",
    )
    .replace(
      "Commit verified loop outputs after approval.",
      "审批后提交已校验的 LoopEngine 输出。",
    )
    .replace(
      "Loop outputs committed after human approval.",
      "LoopEngine 输出已在人工审批后提交。",
    )
    .replace(
      "Plan LoopEngine stages from available resume/JD inputs.",
      "根据已有简历/JD 输入规划 LoopEngine 阶段。",
    )
    .replace("Execute parser tools selected by the plan.", "执行规划选中的解析工具。")
    .replace("Validate parser outputs and collect warning issues.", "校验解析结果并收集风险提示。")
    .replace(
      "Decide next safe workflow actions from verified parser outputs.",
      "基于已校验的解析结果决定下一步安全动作。",
    )
    .replace(
      "Wait for user approval before committing workflow output.",
      "提交工作流输出前等待用户审批。",
    )
    .replace(
      "Review evidence-locked rewrite draft before export.",
      "导出前审阅证据锁定的改写草稿。",
    )
    .replace(
      "Prepare approved rewrite draft for PDF export.",
      "准备已审批的改写草稿以导出 PDF。",
    )
    .replace(
      "Approved rewrite draft is ready for PDF export.",
      "已审批的改写草稿可以导出 PDF。",
    )
    .replace("LLM usage and estimated cost recorded.", "已记录 LLM 用量和预估成本。")
    .replace("PlannerAgent LLM call completed.", "PlannerAgent 的 LLM 调用已完成。")
    .replace("Parser LLM call completed.", "Parser 的 LLM 调用已完成。")
    .replace("Resume parser LLM call completed.", "简历解析 LLM 调用已完成。")
    .replace("JD parser LLM call completed.", "JD 解析 LLM 调用已完成。")
    .replace("Human approval completed.", "人工审批已完成。")
    .replace("Resume rewrite approval completed.", "简历改写审批已完成。")
    .replace("Collected JD parsing failed.", "收集到的岗位 JD 解析失败。")
    .replace(/Collect job posting from URL: (.+)$/g, (_, url: string) => `从公开岗位链接收集 JD：${url}`)
    .replace(
      /Collect job posting from text with (\d+) characters\./g,
      (_, count: string) => `从粘贴文本收集 ${count} 个字符的岗位 JD。`,
    )
    .replace(
      /Collect job posting from HTML with (\d+) characters\./g,
      (_, count: string) => `从 HTML 片段收集 ${count} 个字符的岗位 JD。`,
    )
    .replace(
      /Collected (\d+) characters from ([a-z]+); screenshot=([a-z]+)\./g,
      (_, count: string, source: string, screenshot: string) =>
        `已从${formatCollectorSource(source)}收集 ${count} 个字符；截图状态：${formatScreenshotStatus(screenshot)}。`,
    )
    .replace(
      /Parse collected JD text with (\d+) characters\./g,
      (_, count: string) => `解析已收集的 ${count} 个字符岗位 JD。`,
    )
    .replace(
      /Collected JD parsed: (\d+) hard requirements, (\d+) nice-to-have items, (\d+) tech keywords\./g,
      (_, hard: string, nice: string, keywords: string) =>
        `收集到的 JD 已解析：${hard} 个硬性要求，${nice} 个加分项，${keywords} 个技术关键词。`,
    )
    .replace(
      /Generate interview prep from (\d+) project\(s\), (\d+) hard requirement\(s\), and (\d+) gap\(s\)\./g,
      (_, projects: string, hard: string, gaps: string) =>
        `基于 ${projects} 个项目、${hard} 个硬性要求和 ${gaps} 个缺口生成面试准备包。`,
    )
    .replace(
      /Created interview pack with (\d+) predicted question\(s\), (\d+) project follow-up\(s\), (\d+) STAR draft\(s\), and score ([0-9.]+)\/100\./g,
      (_, questions: string, followups: string, stars: string, score: string) =>
        `已生成面试包：${questions} 个预测题、${followups} 个项目追问、${stars} 个 STAR 草稿，准备分 ${score}/100。`,
    )
    .replace("Interview pack generation failed.", "面试准备包生成失败。")
    .replace(/State changed to ([A-Z_]+)\./g, (_, state: string) => `状态已切换为${formatRunState(state)}。`)
    .replace(/Step ([a-zA-Z0-9_/-]+) started\./g, (_, name: string) => `步骤“${formatStepName(name)}”已开始。`)
    .replace(/Step ([a-zA-Z0-9_/-]+) completed\./g, (_, name: string) => `步骤“${formatStepName(name)}”已完成。`)
    .replace(/Parse resume text with (\d+) characters\./g, (_, count: string) => `解析 ${count} 个字符的简历文本。`)
    .replace(/Parse JD text with (\d+) characters\./g, (_, count: string) => `解析 ${count} 个字符的岗位 JD。`)
    .replace(/Approved by ([^.]+)\./g, (_, user: string) => `由 ${user} 审批通过。`)
    .replace(/Rewrite draft approved by ([^.]+)\./g, (_, user: string) => `改写草稿由 ${user} 审批通过。`)
    .replace(/Planned stages: ([^.]+)\./g, (_, stages: string) => `已规划阶段：${stages}。`)
    .replace(/Executed tools: ([^.]+)\./g, (_, tools: string) => `已执行工具：${tools}。`)
    .replace(/Reflection produced next actions: ([^.]+)\./g, (_, actions: string) => `反思阶段给出下一步动作：${actions}。`);
}

function formatCollectorSource(source: string): string {
  const labels: Record<string, string> = {
    url: "公开链接",
    html: "HTML",
    text: "文本"
  };
  return labels[source] ?? titleizeToken(source);
}

function formatScreenshotStatus(status: string): string {
  const labels: Record<string, string> = {
    captured: "已截图",
    skipped: "未请求",
    unavailable: "不可用"
  };
  return labels[status] ?? titleizeToken(status);
}

function titleizeToken(value: string): string {
  return value
    .split("_")
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(" ");
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
