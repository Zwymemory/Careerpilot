# Week5 代码详解：ResumeRewriteAgent + Approval

Week5 的目标是把 Week4 的匹配结果继续往前推进：从“这份简历哪里匹配、哪里缺失”进入“如何安全地改写简历”。

这周的重点不是生成一份华丽简历，而是建立一个可信的改写闭环：

- 定制简历草稿
- evidence-locked generation
- diff view
- human approval
- PDF export

## 为什么 W5 不直接让模型自由改简历？

CareerPilot 的底线是：

```text
只能优化表达，不能伪造经历。
所有新增描述必须能追溯到 evidence。
```

所以 W5 第一版使用 deterministic `ResumeRewriteAgent`，它不会直接把缺失技能写成用户已经掌握的技能。

例如 W4 发现缺少 `SQL`：

- 错误做法：直接生成“熟练使用 SQL 进行数据分析”。
- 当前做法：生成 `evidence_needed`，提示“如果真实经历支持，再补充 SQL 证据”。

这让 W5 的输出可以被人工审批，也可以在 Active Trace 中复盘。

## 后端新增文件

### `backend/app/schemas/rewrite.py`

这个文件定义 W5 的输入和输出结构。

`ResumeRewriteRequest` 是创建草稿的输入：

- `resume_profile`：W2 简历解析结果。
- `job_profile`：W2 JD 解析结果。
- `match_profile`：W4 匹配结果。
- `user_id`：当前用户。

`ResumeRewriteDraft` 是核心输出：

- `draft_id`：草稿 ID。
- `approval_status`：审批状态，当前支持 `WAITING_APPROVAL`、`APPROVED`、`REJECTED`。
- `company`：目标公司。
- `title`：目标岗位。
- `headline`：定制版简历标题。
- `target_keywords`：优先呈现的关键词。
- `changes`：改写 diff 列表。
- `risk_warnings`：风险提示。
- `markdown`：可导出的草稿文本。

`RewriteChange` 表示一条改写建议：

- `section`：改写位置，例如 `summary`、`skills`、`project`、`experience`、`evidence_needed`。
- `original_text`：原文。
- `revised_text`：建议改写。
- `rationale`：为什么这样改。
- `evidence`：支撑这条改写的原始证据。
- `risk_level`：风险等级。

### `backend/app/services/resume_rewrite_agent.py`

这是 W5 的核心逻辑。

#### 1. 生成 target keywords

Agent 会优先使用 W4 中已经匹配、且也出现在简历中的关键词。

这样做的原因是：

```text
关键词必须来自真实简历证据，而不是只来自 JD。
```

#### 2. 生成 summary change

如果有可用关键词，Agent 会生成一个短 summary。

这条 summary 的风险通常是 `medium`，因为它是新写出来的概括句，需要人工确认表达是否准确。

#### 3. 生成 skills change

Agent 不新增技能，只会调整顺序：

```text
把 JD 匹配到的技能放到前面。
```

例如：

```text
Original: Python, FastAPI, React
Revised: Python, FastAPI, React — ordered for the target JD.
```

#### 4. 生成 evidence-backed changes

对于 W4 的 `evidence_mapping`，如果某条岗位要求确实有简历证据支撑，Agent 会把原始项目/经历改写得更贴合 JD。

例如：

```text
Original:
Built a traceable Agent workflow with FastAPI and React.

Revised:
Built a traceable Agent workflow with FastAPI and React;
positioned for AI Agent Backend Intern by foregrounding Python, FastAPI, SQL.
```

注意：这里仍然会显示 evidence。人工审批时可以看这条改写是否过度。

#### 5. 生成 evidence_needed changes

如果 W4 发现高风险缺口，例如 SQL 不在简历证据中，Agent 不会生成正式简历 bullet，而是生成：

```text
Evidence needed before adding this claim: Add truthful resume evidence for SQL.
```

这就是 evidence-locked 的关键。

### `backend/app/api/routes/rewrite_drafts.py`

新增接口：

```http
POST /api/rewrite-drafts
```

流程：

1. 创建 `AgentRun`。
2. 设置 state 为 `RUNNING`。
3. 增加 `ResumeRewriteAgent` 的 `rewrite` step。
4. 生成草稿。
5. 保存 checkpoint：`rewrite_draft`。
6. 增加 `HumanReviewer` 的 `human_approval` step。
7. 发送 `APPROVAL_REQUIRED` event。
8. 设置 state 为 `WAITING_APPROVAL`。

审批接口：

```http
POST /api/rewrite-drafts/{run_id}/approve
```

流程：

1. 检查 run 是否存在。
2. 检查是否处于 `WAITING_APPROVAL`。
3. 把草稿状态改成 `APPROVED`。
4. 完成 `human_approval` step。
5. 增加 `ExportAgent` 的 `export` step。
6. 保存 checkpoint：`rewrite_approval`。
7. 设置 run state 为 `COMPLETED`。

导出接口：

```http
GET /api/rewrite-drafts/{run_id}/export.pdf
```

导出前必须满足：

```text
run.state == COMPLETED
draft.approval_status == APPROVED
```

否则返回 `409`。

当前 PDF 是一个 dependency-free preview PDF。后续生产版可以替换成更漂亮的模板渲染器。

## 前端新增内容

### `frontend/src/types.ts`

新增：

- `RewriteChange`
- `ResumeRewriteDraft`
- `ResumeRewriteResponse`

这些类型和后端 schema 对齐。

### `frontend/src/api/client.ts`

新增：

```ts
createRewriteDraft(...)
approveRewriteDraft(...)
exportRewritePdf(...)
```

### `frontend/src/App.tsx`

新增状态：

```ts
rewriteResult
rewriteApprovalNotes
```

新增操作：

- `handleCreateRewriteDraft`
- `handleApproveRewriteDraft`
- `handleExportRewritePdf`

W5 的按钮依赖顺序是：

```text
Parse resume + Parse JD
→ Run match
→ Create draft
→ Approve draft
→ Export PDF
```

### `RewriteSummary`

这个组件负责展示：

- 草稿 headline。
- target keywords。
- approval status。
- changes 数量。
- evidence links 数量。
- diff 列表。
- risk warnings。

## API 返回 JSON 怎么看

示例：

```json
{
  "run_id": "run_xxx",
  "draft": {
    "draft_id": "draft_xxx",
    "approval_status": "WAITING_APPROVAL",
    "company": "Example AI",
    "title": "AI Agent Backend Intern",
    "headline": "AI Agent Backend Intern | Python · FastAPI · React",
    "target_keywords": ["Python", "FastAPI", "React"],
    "changes": [
      {
        "section": "skills",
        "original_text": "Python, FastAPI, React",
        "revised_text": "Python, FastAPI, React — ordered for the target JD.",
        "risk_level": "low"
      }
    ],
    "risk_warnings": [
      "Do not add SQL unless the user can provide real evidence."
    ]
  }
}
```

字段含义：

- `run_id`：这次 W5 改写运行的 trace ID。
- `draft_id`：草稿 ID。
- `approval_status`：当前是否等待审批。
- `headline`：面向岗位的标题。
- `target_keywords`：基于证据优先展示的关键词。
- `changes`：建议改写项。
- `original_text`：原文。
- `revised_text`：改写建议。
- `rationale`：改写理由。
- `evidence`：支撑改写的证据。
- `risk_warnings`：不能直接写入简历的风险点。

## 验证方式

后端：

```bash
cd backend
./.venv/bin/pytest
./.venv/bin/ruff check .
```

前端：

```bash
cd frontend
npm run lint
npm run build
```

页面验证：

1. 点击 `Parse resume`。
2. 点击 `Parse JD`。
3. 点击 `Run match`。
4. 点击 `Create draft`。
5. 检查 W5 面板是否出现 diff 和 risk warnings。
6. 点击 `Approve draft`。
7. 点击 `Export PDF`。

预期：

- 未完成 W4 时，W5 不能生成草稿。
- 生成草稿后，Active Trace 进入 `WAITING_APPROVAL`。
- 未审批时，后端禁止 PDF 导出。
- 审批后，Active Trace 进入 `COMPLETED`。
- PDF 可以下载。

## 面试讲法

Week5 我没有让模型直接生成最终简历，而是实现了 evidence-locked ResumeRewriteAgent。它使用 Week2 的结构化简历和 JD，以及 Week4 的匹配证据和 gap，生成可审阅的 diff、风险提示和审批流。所有缺少证据的内容都被标记为 `evidence_needed`，必须人工确认后才能进入导出阶段。这保证了 CareerPilot 的简历生成不是黑盒文案，而是可追踪、可审批、可复盘的 Agent 工作流。
