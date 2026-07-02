# Week2 代码详解：Resume / JD 结构化解析

## 本周目标

Week2 落地 CareerPilot 的 ResumeParserAgent 和 JobIntelAgent 最小闭环：

- 简历文本结构化解析；
- JD 文本结构化解析；
- Pydantic structured output；
- JSON repair；
- schema validation；
- 每次解析写入 run trace。

真实 LLM API key 不是本阶段阻塞项。当前默认 `LLM_DRY_RUN=true`，解析服务使用保守启发式 parser，后续配置 DeepSeek/OpenAI key 后可切换到 LLM structured output。

## 核心文件

```text
backend/app/schemas/parser.py
backend/app/services/json_repair.py
backend/app/services/structured_parser.py
backend/app/api/routes/parsers.py
backend/tests/test_parser.py
```

## 设计说明

`parser.py` 定义简历和 JD 的结构化输出。

ResumeProfile 包含：

- education；
- skills；
- projects；
- experiences；
- keywords；
- evidence；
- inferred_fields；
- needs_confirmation。

JobProfile 包含：

- company；
- title；
- hard_requirements；
- nice_to_have；
- responsibilities；
- tech_keywords；
- hidden_keywords；
- company_context；
- evidence；
- inferred_fields；
- needs_confirmation。

这样可以满足 Agent.md 的底线：事实字段、推断字段、待确认字段必须分开，不能把猜测当成事实。

## JSON Repair

`json_repair.py` 处理 LLM 常见输出问题：

- Markdown fenced JSON；
- JSON 前后解释文字；
- 尾逗号；
- Python dict 风格单引号。

repair 后仍然必须经过 Pydantic validation。repair 只能修格式，不能绕过 schema。

## Parser Service

`StructuredParserService` 提供：

```text
parse_resume(text)
parse_job(text)
```

如果配置了真实 LLM key：

```text
LLM structured output
→ JSON repair
→ Pydantic validation
→ profile
```

如果 LLM 输出无法通过 repair/validation：

```text
fallback heuristic parser
→ metadata.issues 记录失败原因
```

如果是默认 dry-run：

```text
heuristic parser
→ 本地可演示
→ 不产生真实模型费用
```

## API

W2 新增两个解析接口。它们当前主要通过 curl / Postman / API client 验证，前端页面还没有单独的 Resume/JD 上传解析表单。

这点很重要：

- 当前前端页面仍然是 Week1 的 Agent run trace 工作台；
- W2 parser 接口会写入 run trace，所以前端点击 `Refresh` 后能在 `Recent runs` 看到 parser run；
- 但 parser 的详细结构化结果目前通过 API 返回，不会在前端专门渲染。

### Parse Resume

```bash
curl -X POST http://localhost:8000/api/parsers/resume \
  -H "Content-Type: application/json" \
  -d '{
    "user_id": "local-user",
    "source_name": "resume.md",
    "text": "Education: Example University\nSkills: Python, FastAPI, React\nProject: CareerPilot..."
  }'
```

### Parse Job

```bash
curl -X POST http://localhost:8000/api/parsers/job \
  -H "Content-Type: application/json" \
  -d '{
    "user_id": "local-user",
    "text": "Company: Example AI\nTitle: AI Agent Backend Intern\nRequired: Python, FastAPI, SQL"
  }'
```

两个接口都会创建 run trace：

- `parse_resume` 使用 `ResumeParserAgent`；
- `parse_job` 使用 `JobIntelAgent`；
- run 最终进入 `COMPLETED`；
- step output_summary 记录解析摘要。

### 如何把返回 JSON 打印得更好看

截图里 JSON 挤成一行，是因为 curl 默认直接输出原始 JSON。可以这样格式化：

```bash
curl -s -X POST http://localhost:8000/api/parsers/resume \
  -H "Content-Type: application/json" \
  -d '{
    "user_id": "local-user",
    "source_name": "resume.md",
    "text": "Education: Example University\nSkills: Python, FastAPI, React\nProject: CareerPilot built a traceable Agent workflow."
  }' | python -m json.tool
```

如果本机装了 `jq`，也可以：

```bash
curl -s ... | jq
```

## 返回 JSON 字段解释

### 顶层字段

```json
{
  "run_id": "run_xxx",
  "profile": {},
  "metadata": {}
}
```

- `run_id`：本次解析对应的 Agent run ID。可以用它查询 trace：`GET /api/runs/{run_id}`。
- `profile`：解析后的结构化简历或 JD 结果，是后续 Matching Agent 的输入。
- `metadata`：本次 parser 的来源、模型、dry-run 状态、JSON repair 状态和 warning。

### Resume profile

`/api/parsers/resume` 的 `profile` 字段含义：

- `education`：教育经历数组。每条包含 `school`、`degree`、`major`、`start_date`、`end_date` 和 `evidence`。
- `skills`：从简历中明确抽出的技能关键词，比如 `Python`、`FastAPI`、`React`。
- `projects`：项目经历数组。每条包含 `name`、`description`、项目涉及的 `skills` 和证据。
- `experiences`：实习/工作经历数组。每条包含 `company`、`title`、`description`、日期和证据。
- `keywords`：供后续匹配使用的统一关键词集合。当前 dry-run 中通常和技能关键词接近。
- `evidence`：扁平化证据列表。它说明某个字段来自原文哪一段。
- `inferred_fields`：哪些字段是推断出来的。按 Agent.md 规则，推断字段不能当事实。
- `needs_confirmation`：哪些字段缺失或需要用户确认。例如没有识别到教育经历，就会出现 `education`。

Resume 中的 `evidence` 结构：

```json
{
  "field_path": "skills",
  "source_text": "Python",
  "confidence": 0.72,
  "is_inferred": false
}
```

- `field_path`：这条证据对应哪个字段。
- `source_text`：原文证据。
- `confidence`：解析置信度。当前 heuristic parser 是粗略置信度，后续 LLM/parser 会更细。
- `is_inferred`：是否推断。`false` 表示直接来自原文。

### Job profile

`/api/parsers/job` 的 `profile` 字段含义：

- `company`：公司名。
- `title`：岗位名。
- `hard_requirements`：硬性要求，后续 Matching Agent 会重点匹配。
- `nice_to_have`：加分项，不是必须满足，但会影响匹配质量和简历优化方向。
- `responsibilities`：岗位职责。
- `tech_keywords`：技术关键词，比如 `Python`、`FastAPI`、`SQL`。
- `hidden_keywords`：隐性能力要求，比如沟通、ownership、协作、快节奏环境等。
- `company_context`：公司/团队背景信息。
- `evidence`：字段对应的原文证据。
- `inferred_fields`：推断字段。
- `needs_confirmation`：需要确认或缺失的字段。

### metadata

```json
{
  "parser": "resume",
  "source": "heuristic_dry_run",
  "model": null,
  "dry_run": true,
  "json_repaired": false,
  "issues": []
}
```

- `parser`：本次使用哪个 parser，值为 `resume` 或 `job`。
- `source`：解析来源。
  - `heuristic_dry_run`：当前默认模式，不调用模型，本地规则解析。
  - `llm_structured_output`：使用真实 LLM structured output。
  - `heuristic_fallback`：LLM 输出不合格，回退到启发式 parser。
- `model`：真实 LLM 模型名。dry-run 时为 `null`。
- `dry_run`：是否 dry-run。`true` 表示没有调用真实模型。
- `json_repaired`：是否对 LLM JSON 做过格式修复。dry-run 不经过 LLM，所以通常为 `false`。
- `issues`：解析过程中的 warning/error。例如缺少教育经历、缺少硬性要求、LLM 输出 schema validation 失败。

## 前端界面说明与验证

W2 当前没有新增前端 parser 页面，所以前端验证主要验证 Week1 工作台仍可运行，并理解每块 UI 的含义。

启动：

```bash
cd backend
source .venv/bin/activate
uvicorn app.main:app --reload
```

```bash
cd frontend
npm run dev
```

打开：

```text
http://localhost:5173
```

### 前端每个部分是什么含义

1. 背景层

浅色流动背景和细微网格是视觉层，不承载业务数据。它的作用是让 Agent 工作台更像产品界面，而不是普通后台表单。

2. 右上角音乐球 / Music Dock

音乐球是本地音乐控制区：

- 收起时显示一个音符球；
- 聚焦/点击后展开为 `Music Dock`；
- 左侧音符按钮用于选择本地音频；
- 右侧播放按钮用于播放/暂停；
- `No track` 表示当前没有选择音乐；
- 音频播放后，背景会随音频能量轻微变化。

3. Hero 文案区

中间大标题是产品定位。它表达 CareerPilot 的核心：每一次 Agent 运行都要可追踪、可信、可复盘。

4. 输入框 Composer

这是 Week1 run 创建入口：

- 输入目标；
- 点击右侧上箭头；
- 前端调用 `POST /api/runs`；
- 后端创建一个可追踪 run；
- 页面展示该 run 的 trace。

注意：这个输入框当前不是 W2 Resume/JD parser 的入口。W2 parser 入口暂时是 `/api/parsers/resume` 和 `/api/parsers/job`。

5. Metrics 四个指标卡

- `Runs`：当前内存 store 里 run 的数量。
- `State`：最近一次 run 的状态，例如 `Idle`、`Waiting Approval`、`Completed`。
- `Tokens`：最近一次 LLM/dry-run 记录的 token 数。
- `Cost CNY`：估算人民币成本。dry-run 或 heuristic parser 通常为 0。

6. Trace 区

如果刚通过输入框启动了 run，这里会显示该 run 的步骤、事件、成本、模型信息。

如果还没有 active run，会显示：

```text
Ready for the first run
```

7. Recent runs

历史 run 列表。点击 `Refresh` 后，前端重新请求 `GET /api/runs`。

W2 parser 接口也会创建 run，所以你执行 curl 后，再回到前端点 `Refresh`，应该能看到新的 parser run：

- Resume parser run：step 名称是 `parse_resume`；
- JD parser run：step 名称是 `parse_job`；
- state 应该是 `COMPLETED`；
- tokens/cost 在 dry-run heuristic parser 下通常是 0。

### 前端预期结果

基础页面预期：

- 页面能打开；
- 背景有浅色流动视觉；
- 右上角音乐球能展开；
- 输入框可以输入目标；
- 点击上箭头后会创建 run；
- 四个 metrics 有数据更新；
- `Recent runs` 能看到新 run。

W2 parser 与前端联动预期：

1. 先执行 parser curl；
2. 回到前端点击 `Refresh`；
3. `Runs` 数量增加；
4. `Recent runs` 出现 `COMPLETED` 的 parser run；
5. parser 的结构化 JSON 结果仍以 curl/API response 为准，当前前端还没有专门展示 profile。

## 验证流程

### 后端自动化验证

```bash
cd backend
.venv/bin/python -m pytest
```

当前覆盖：

- JSON repair 能处理 fenced JSON 和尾逗号；
- resume parser 返回 skills/profile/run trace；
- job parser 返回 requirements/profile/run trace；
- Week1 run store 测试仍通过。

### 代码质量验证

```bash
cd backend
.venv/bin/ruff check .
```

预期：

```text
All checks passed!
```

### 前端构建验证

```bash
cd frontend
npm run build
```

预期：

```text
✓ built
```

### API 手工验证预期

Resume parser：

- HTTP status：`201`；
- 返回 `run_id`；
- `profile.skills` 至少包含输入文本里的技能；
- `metadata.source` 为 `heuristic_dry_run`；
- `metadata.dry_run` 为 `true`；
- `metadata.issues` 如果为空，表示本次解析没有明显缺失；如果有内容，表示哪些字段需要确认。

Job parser：

- HTTP status：`201`；
- 返回 `run_id`；
- `profile.company` 能识别 `Company`；
- `profile.title` 能识别 `Title`；
- `profile.hard_requirements` 包含 `Required` 行；
- `profile.nice_to_have` 包含 `Preferred` 行；
- `profile.tech_keywords` 包含文本中出现的技术词；
- `metadata.source` 为 `heuristic_dry_run`。

## 什么时候需要模型 API

现在 W2 不强制需要模型 API，因为默认 dry-run/heuristic parser 已经能完成本地验证。

真正需要你提供模型 API 的时间点：

1. W2 深化：把 heuristic parser 切到真实 LLM structured output。
2. W4 Matching Agent：更复杂的岗位匹配解释和 gap analysis 需要 LLM 更自然地分析。
3. W5 ResumeRewriteAgent：定制简历改写必须依赖 LLM。
4. W7 InterviewCoachAgent：面试问答生成需要 LLM。
5. Week9 Eval Harness：如果做 LLM-as-judge，需要高质量 judge 模型。

建议你先准备这些 API：

### 必备

DeepSeek API：

- 用途：主力解析、规划、匹配、改写、总结；
- 后端兼容 OpenAI chat completions；
- 需要配置：
  - `LLM_PROVIDER=deepseek`
  - `LLM_MODEL=deepseek-chat`
  - `LLM_BASE_URL=https://api.deepseek.com/v1`
  - `LLM_API_KEY=你的 key`
  - `LLM_DRY_RUN=false`

### 推荐

OpenAI API：

- 用途：少量高质量 judge / 终审 / 复杂质量评估；
- 不一定马上用；
- Week9 Eval Harness 或质量评测阶段会更需要。

### 可选

Tavily 或 Exa：

- 用途：岗位搜索、公司信息补充；
- Week6 Browser Tool / 岗位搜索工具阶段再接入；
- 如果你已经有，可以先准备，但不是 W2 阻塞项。

Embedding API 或本地 embedding：

- 用途：后续匹配、证据召回、简历/JD 语义相似度；
- 可以先用本地 BGE/E5，暂时不急。

目前最建议你先准备：DeepSeek API key。等你给我 key 或告诉我 `.env` 已配置好，我会把 W2 parser 切到真实 LLM structured output，并保留 dry-run/fallback。

## DeepSeek 真实模型验证

`.env` 已被 `.gitignore` 忽略，API key 只应该放在本地 `backend/.env`，不要提交到 Git。

把以下配置写入 `backend/.env`：

```env
LLM_DRY_RUN=false
LLM_PROVIDER=deepseek
LLM_MODEL=deepseek-chat
LLM_BASE_URL=https://api.deepseek.com/v1
LLM_API_KEY=你的 DeepSeek key
```

然后重启后端：

```bash
cd backend
source .venv/bin/activate
uvicorn app.main:app --reload
```

再执行 parser curl。真实模型路径的预期变化：

- `metadata.source` 从 `heuristic_dry_run` 变为 `llm_structured_output`；
- `metadata.model` 变为 `deepseek-chat`；
- `metadata.dry_run` 变为 `false`；
- `run` 里会记录 token 和成本；
- 如果 DeepSeek 返回的 JSON 有 code fence、尾逗号或前后解释文字，`json_repaired` 可能为 `true`；
- 如果模型输出不符合 schema，会回退到 `heuristic_fallback`，并在 `metadata.issues` 记录原因。

这一步完成后，W2 才算从“可本地演示”升级为“真实模型解析可用”。之后再进入 W3 LoopEngine 会更稳。

## 面试讲法

我没有直接把 LLM 输出传给业务层，而是设计了三层保护：

1. Prompt 要求 structured output；
2. JSON repair 只修复格式问题；
3. Pydantic schema validation 决定结果能否进入系统。

如果 LLM 输出不可信，系统会回退到保守 heuristic parser，并把问题记录到 metadata.issues。这样既能支持真实模型，也能保证本地 dry-run 演示稳定。

同时，parser endpoint 不只是返回 JSON，它还会写入 run trace。也就是说 ResumeParserAgent / JobIntelAgent 的每次执行都有 run、step、event，符合生产级 Agent workflow 的可观测性要求。

## 常见追问

Q：为什么不用正则直接解析所有内容？

A：正则只适合保底和 dry-run。真实场景简历/JD 格式不稳定，所以主路径应该是 LLM structured output，再用 schema validation 控制质量。

Q：JSON repair 会不会掩盖模型错误？

A：不会。repair 只处理格式问题，例如 code fence 和尾逗号。字段是否符合业务结构仍由 Pydantic validation 决定。

Q：为什么现在 dry-run 不调用 LLM？

A：为了本地开发和演示零成本、可重复。等 API key 配好后，服务会自动走真实 LLM structured output。

Q：如何防止 parser 编造内容？

A：schema 中保留 evidence、inferred_fields、needs_confirmation；Agent 规则要求事实、推断、待确认分离。当前 heuristic parser 也只抽文本中明确出现的内容。
