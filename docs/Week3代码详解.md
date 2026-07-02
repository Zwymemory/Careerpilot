# Week3 代码详解：LoopEngine

## 本周目标

Week3 把 CareerPilot 从“单接口 parser”推进到工程化 Agent workflow：

- Plan / Execute / Verify / Reflect；
- checkpoint；
- event stream；
- idempotency；
- resume from failed step；
- human-in-the-loop；
- approval 后 commit。

这周的目标不是做复杂 AI 能力，而是把“Agent 每一步如何被追踪、恢复、审批、提交”这件事打牢。

## 核心文件

```text
backend/app/schemas/loop.py
backend/app/services/loop_engine.py
backend/app/api/routes/loop_runs.py
backend/app/schemas/run.py
backend/app/services/run_store.py
backend/tests/test_loop_engine.py
```

## 核心设计

LoopEngine 主流程：

```text
Plan
→ Execute
→ Verify
→ Reflect
→ Human Approval
→ Commit
```

对应代码中的 `LoopPhase`：

```text
plan
execute
verify
reflect
human_approval
commit
```

## Run / Step / Event / Checkpoint

W1 已经有：

- Run；
- Step；
- Event；
- CostUsage。

W3 新增：

```text
AgentCheckpoint
```

每个 checkpoint 包含：

- `checkpoint_id`：checkpoint ID；
- `run_id`：所属 run；
- `step_id`：所属 step；
- `name`：checkpoint 名称；
- `phase`：所在 Loop phase；
- `data`：该阶段可恢复的数据；
- `created_at`：创建时间。

为什么 checkpoint 很重要：

- event 是“发生了什么”；
- step 是“执行到哪一步”；
- checkpoint 是“这一步的可恢复结果”。

没有 checkpoint，就只能看日志，不能安全 resume。

## LoopEngine 每一步做什么

### Plan

代码位置：

```text
LoopEngine._plan()
```

职责：

- 设置 run state 为 `PLANNING`；
- 创建 `plan` step；
- 生成计划阶段列表；
- 保存 plan checkpoint。

当前 checkpoint 示例：

```json
{
  "planned_steps": ["execute", "verify", "reflect", "human_approval", "commit"],
  "has_resume_text": true,
  "has_job_text": true
}
```

### Execute

代码位置：

```text
LoopEngine._execute()
```

职责：

- 设置 run state 为 `RUNNING`；
- 根据输入调用 ResumeParserAgent / JobIntelAgent；
- 保存解析 profile；
- 记录 LLM token/cost；
- 保存 execute checkpoint。

如果输入了 `resume_text`，会调用：

```text
StructuredParserService.parse_resume()
```

如果输入了 `job_text`，会调用：

```text
StructuredParserService.parse_job()
```

execute checkpoint 会保存结构化 profile，供后续 verify / reflect / resume 使用。

### Verify

代码位置：

```text
LoopEngine._verify()
```

职责：

- 检查 execute 是否产生 profile；
- 汇总 parser metadata 中的 issues；
- 保存 verify checkpoint。

当前 verify 不做复杂质量评估，只做最小可恢复校验。更强的 QualityGate 会在后续 Week9 Eval Harness 做。

### Reflect

代码位置：

```text
LoopEngine._reflect()
```

职责：

- 根据已解析内容判断下一步；
- 如果 resume 和 JD 都有，输出 `ready_for_matching_agent`；
- 如果只有 resume，输出 `need_job_description`；
- 如果只有 JD，输出 `need_resume`；
- 保存 reflect checkpoint。

这一步为 W4 Matching Agent 做准备。

### Human Approval

代码位置：

```text
LoopEngine._request_human_approval()
```

职责：

- 设置 run state 为 `WAITING_APPROVAL`；
- 创建 `human_approval` step；
- 写入 approval checkpoint；
- 写入 `APPROVAL_REQUIRED` event。

为什么 W3 先进入 approval，而不是直接完成：

- CareerPilot 的底线是 human-in-the-loop；
- 任何用户可见产物或 workflow commit 前，都必须保留人工确认点；
- 后续简历改写、导出 PDF 时也会沿用这个模式。

### Commit

代码位置：

```text
LoopEngine.approve()
```

职责：

- 用户审批后完成 `human_approval` step；
- 写入 `APPROVAL_COMPLETED` event；
- 创建 `commit` step；
- 保存 commit checkpoint；
- 设置 run state 为 `COMPLETED`。

## API

### 创建 Loop Run

```bash
curl -X POST http://localhost:8000/api/loop-runs \
  -H "Content-Type: application/json" \
  -H "Idempotency-Key: loop-demo-1" \
  -d '{
    "user_id": "local-user",
    "goal": "为 AI Agent 实习岗位生成可追踪的匹配准备流程",
    "resume_text": "Education: Example University\nSkills: Python, FastAPI, React\nProject: CareerPilot built a traceable Agent workflow.",
    "job_text": "Company: Example AI\nTitle: AI Agent Backend Intern\nRequired: Python, FastAPI, SQL\nPreferred: React, TypeScript"
  }' | python -m json.tool
```

预期：

- HTTP status 为 `201`；
- `run.state` 为 `WAITING_APPROVAL`；
- `run.current_step` 为 `human_approval`；
- `run.steps` 包含 `plan`、`execute`、`verify`、`reflect`、`human_approval`；
- `run.checkpoints` 包含 `plan`、`execute`、`verify`、`reflect`、`human_approval`；
- 如果 `.env` 使用真实 DeepSeek，则 `total_tokens` 和 `total_cost_cny` 会有值。

### 审批并 Commit

```bash
curl -X POST http://localhost:8000/api/loop-runs/{run_id}/approve \
  -H "Content-Type: application/json" \
  -d '{
    "approved_by": "local-user",
    "notes": "确认进入后续匹配流程"
  }' | python -m json.tool
```

预期：

- `run.state` 变为 `COMPLETED`；
- `run.current_step` 变为 `commit`；
- 新增 `APPROVAL_COMPLETED` event；
- 新增 `commit` checkpoint。

### 从失败处 Resume

```bash
curl -X POST http://localhost:8000/api/loop-runs/{run_id}/resume \
  -H "Content-Type: application/json" \
  -d '{
    "user_id": "local-user"
  }' | python -m json.tool
```

当前可恢复范围：

- 如果失败发生在 `verify` 或 `reflect`，可以从 execute checkpoint 继续；
- 如果失败发生在更早阶段，没有可用 execute checkpoint，系统会拒绝 resume。

这是有意设计：不能为了 resume 而重新编造或隐藏输入缺失。

### Event Stream

```bash
curl http://localhost:8000/api/loop-runs/{run_id}/events/stream
```

返回 SSE 格式：

```text
event: RUN_CREATED
data: {...}

event: CHECKPOINT_SAVED
data: {...}
```

当前 stream 会返回已有事件；后续前端接入时，可以用它实时显示 LoopEngine 进度。

## Idempotency

创建 loop run 时支持：

```text
Idempotency-Key
```

相同 user + 相同 key 重复请求时：

- 返回同一个 run；
- 不重复创建 steps；
- 不重复调用 parser；
- 避免用户重复点击导致重复扣费。

## Resume 设计

失败时：

- 当前 step 会标记为 `FAILED`；
- run state 变为 `FAILED`；
- event 里记录 `ERROR`；
- 已完成阶段的 checkpoint 保留。

resume 时：

- 写入 `RESUME_REQUESTED` event；
- 从 execute checkpoint 读取已解析 profile；
- 继续 verify / reflect / human approval。

为什么只从 checkpoint 恢复，而不是重新读日志：

- 日志是给人看的；
- checkpoint 是给机器恢复状态用的；
- 这是 Agent workflow 工程化和普通脚本的差别。

## 验证流程

### 后端测试

```bash
cd backend
.venv/bin/python -m pytest
```

当前覆盖：

- LoopEngine 创建 run 后进入 `WAITING_APPROVAL`；
- approval 后进入 `COMPLETED`；
- idempotency key 不重复创建 run；
- verify 失败后可以从 checkpoint resume；
- event stream 返回 SSE；
- W1/W2 测试仍通过。

### Ruff

```bash
cd backend
.venv/bin/ruff check .
```

预期：

```text
All checks passed!
```

### 前端 build

```bash
cd frontend
npm run build
```

预期：

```text
✓ built
```

## 面试讲法

我把 Agent workflow 拆成 Run、Step、Event、Checkpoint 四层：

- Run 表示一次完整任务；
- Step 表示当前执行阶段；
- Event 表示可观测日志；
- Checkpoint 表示可恢复状态。

LoopEngine 不只是顺序调用几个函数，而是把每一步都落成可追踪、可审批、可恢复的数据结构。这样当模型调用失败、用户刷新页面、或后续任务中断时，系统不是从头重跑，而是从上一个稳定 checkpoint 继续。

同时，LoopEngine 默认不会直接 commit，而是进入 human approval。这保证了后续简历改写、导出 PDF、面试材料生成这些用户可见产物，都有人工确认点。

## 常见追问

Q：为什么 W3 没直接做复杂 ReAct？

A：CareerPilot 的核心不是炫技式 ReAct，而是生产级 workflow。先把 checkpoint、resume、idempotency、approval、event stream 做稳，后面接 MatchAgent / RewriteAgent 才不会失控。

Q：为什么 event 和 checkpoint 都需要？

A：event 是给人看的进度记录，checkpoint 是给系统恢复用的状态快照。两者用途不同。

Q：为什么 commit 前必须 approval？

A：因为 CareerPilot 处理的是求职材料，不能让 Agent 未经确认就生成或导出用户可见结果。

Q：现在的 event stream 是真的实时吗？

A：当前是返回已有事件的 SSE 格式，为前端实时展示打接口基础。后续引入后台任务队列后，可以把新事件持续推送给前端。
