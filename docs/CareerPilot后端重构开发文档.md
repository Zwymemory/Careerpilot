# CareerPilot 后端重构开发文档

本文档用于在无法直接读取现有后端代码时，重新完整实现 CareerPilot 后端。目标是让 Google AI Studio 或其他代码生成工具仅凭本文档即可理解：项目要做什么、需要哪些接口、每个模块的职责、模型 API 如何接入、前端期望拿到什么数据。

## 1. 项目定位

CareerPilot 是一个面向国内学生实习投递场景的求职 Agent 平台。它不是“凭空制造简历”，而是把用户已有的真实经历和目标 JD 做结构化解析、证据匹配、缺口分析、中文简历改写、面试准备、投递记录和质量评测。

核心原则：

- 证据锁定：所有建议必须能追溯到用户输入的真实简历、项目经历或 JD 原文。
- 人在回路：涉及简历改写、投递、状态推进的关键动作需要人工确认。
- 可追踪：每次 Agent 运行都要记录 run、step、event、cost、latency 和产物。
- 中文优先：面向国内求职，除 Python、FastAPI、RAG、Function Calling 等技术关键词外，输出以中文为主。
- 可演示：前端需要能展示完整流程，后端需要提供稳定的 dry-run 和真实 LLM 两种模式。

## 2. 技术栈

- Python 3.12+，当前本地使用 Python 3.14 也可运行。
- FastAPI + Uvicorn。
- Pydantic v2 + pydantic-settings。
- httpx 用于调用 DeepSeek、OpenAI、Tavily 等外部 API。
- pytest 用于单元测试和回归测试。
- 本地内存存储或轻量文件存储即可；后续可替换为 SQLite/PostgreSQL。

推荐目录结构：

```text
backend/
  app/
    main.py
    core/config.py
    api/routes/
      health.py
      parsers.py
      runs.py
      loop_runs.py
      matches.py
      rewrite_drafts.py
      interview_packs.py
      applications.py
      evals.py
      research.py
      provider_balances.py
      production.py
    schemas/
    services/
  tests/
  pyproject.toml
  .env.example
```

## 3. 环境变量

不要把真实 key 写入仓库。`.env` 仅本地使用，`.env.example` 只保留空值和说明。

```env
BACKEND_CORS_ORIGINS=http://localhost:5173,http://localhost:5174

LLM_DRY_RUN=true
LLM_PROVIDER=deepseek
LLM_MODEL=deepseek-chat
LLM_BASE_URL=https://api.deepseek.com/v1
LLM_API_KEY=

JUDGE_DRY_RUN=true
JUDGE_PROVIDER=openai
JUDGE_MODEL=gpt-4.1-mini
JUDGE_BASE_URL=https://api.openai.com/v1
JUDGE_API_KEY=

TAVILY_DRY_RUN=true
TAVILY_BASE_URL=https://api.tavily.com
TAVILY_API_KEY=
TAVILY_MAX_RESULTS=5
TAVILY_SEARCH_DEPTH=basic

BALANCE_DEEPSEEK_BUDGET_CNY=50
BALANCE_OPENAI_BUDGET_USD=5
BALANCE_TAVILY_MONTHLY_CREDITS=1000
BALANCE_DEEPSEEK_AVG_CALL_COST_CNY=0.002
BALANCE_OPENAI_AVG_CALL_COST_USD=0.01
BALANCE_TAVILY_AVG_CALL_CREDITS=1
BALANCE_USD_TO_CNY=7.2

API_ACCESS_TOKEN=
RATE_LIMIT_REQUESTS_PER_MINUTE=180
SECURITY_HEADERS_ENABLED=true
```

兼容规则：如果代码里使用 `DEEPSEEK_API_KEY`、`OPENAI_API_KEY`、`TAVILY_API_KEY`，也可以映射到上面的 `LLM_API_KEY`、`JUDGE_API_KEY`、`TAVILY_API_KEY`。

## 4. 通用响应约定

所有生成类接口都应该返回：

- `run_id`：本次运行 ID。
- `profile` 或 `result`：结构化结果。
- `evidence`：证据链，包含字段路径、原文片段、置信度、是否推断。
- `metadata`：模型、来源、是否 dry-run、是否修复 JSON。
- `issues`：解析或生成中的问题，不能静默吞掉。
- `cost`：token、耗时、估算成本。

所有 LLM 输出必须尽量要求 JSON Schema / structured output。如果模型返回了 Markdown 或半坏 JSON，允许做一次 JSON repair，但要把 `json_repaired=true` 写入 metadata。

## 5. 接口清单

### 5.1 健康检查

`GET /api/health`

返回：

```json
{
  "status": "ok",
  "service": "CareerPilot API"
}
```

### 5.2 W2 Parser：结构化录入

`POST /api/parsers/resume`

请求：

```json
{
  "user_id": "local-user",
  "source_name": "resume.md",
  "text": "教育经历：...\n技能：...\n项目：..."
}
```

返回重点：

```json
{
  "run_id": "run_xxx",
  "profile": {
    "education": [],
    "skills": [],
    "projects": [],
    "experiences": [],
    "keywords": []
  },
  "evidence": [],
  "metadata": {
    "parser": "resume",
    "source": "llm_structured_output",
    "model": "deepseek-chat",
    "dry_run": false
  },
  "issues": []
}
```

`POST /api/parsers/job`

请求：

```json
{
  "user_id": "local-user",
  "text": "公司：星河智能科技\n岗位名称：AI Agent 全栈开发实习生\n岗位职责：...\n任职要求：..."
}
```

返回重点：

```json
{
  "profile": {
    "company": "星河智能科技",
    "title": "AI Agent 全栈开发实习生",
    "hard_requirements": [],
    "nice_to_have": [],
    "responsibilities": [],
    "keywords": []
  }
}
```

要求：

- 中文 JD 要能正常解析。
- 不要把“学历、经验、地点、薪资”误判为技术关键词。
- 如果 LLM 不可用，启发式 fallback 也要给出可用结果，并标记 `source=heuristic_fallback`。

### 5.3 W3 LoopEngine：规划、执行、校验

`POST /api/loop-runs`

用途：创建一个可追踪 Agent run，执行 planner、trace_commit 等步骤。

请求：

```json
{
  "user_id": "local-user",
  "goal": "为 AI Agent 实习岗位生成可追踪运行计划，保留人工审批点和成本记录。"
}
```

返回：`RunDetail`，包含 state、steps、events、cost_summary。

`POST /api/loop-runs/{run_id}/approve`

请求头可以带 `X-Approval-Note`，用于人工确认。

`POST /api/loop-runs/{run_id}/resume`

审批后继续执行。

`GET /api/loop-runs/{run_id}/events/stream`

SSE 流式事件，前端可实时展示运行过程。

要求：

- 状态至少包括 `CREATED`、`RUNNING`、`WAITING_APPROVAL`、`COMPLETED`、`FAILED`。
- 每个 step 要记录 started/completed 事件、耗时、输出摘要。

### 5.4 W4 MatchAgent：岗位匹配报告

`POST /api/matches`

请求：

```json
{
  "user_id": "local-user",
  "resume_profile": {},
  "job_profile": {}
}
```

返回：

```json
{
  "run_id": "run_xxx",
  "match": {
    "score": 73.47,
    "level": "部分匹配",
    "evidence_mappings": [],
    "gaps": [],
    "rewrite_priorities": []
  }
}
```

要求：

- 输出匹配分、证据映射、主要缺口、改写优先级。
- 缺口分为：真实缺失、表达缺失、证据不足。
- 不能建议用户伪造不会的技能；只能建议“补充真实项目/经历证据”。

### 5.5 W5 ResumeRewriteAgent：中文简历改写与导出

`POST /api/rewrite-drafts`

请求：

```json
{
  "user_id": "local-user",
  "resume_profile": {},
  "job_profile": {},
  "match_report": {},
  "style": "chinese_resume"
}
```

返回：

```json
{
  "run_id": "run_xxx",
  "draft": {
    "headline": "AI Agent 全栈开发实习生 | Python · FastAPI · PostgreSQL",
    "summary": "具备 ... 的候选人，关注 ...",
    "sections": [],
    "changes": [],
    "risks": []
  }
}
```

`POST /api/rewrite-drafts/{run_id}/approve`

人工确认改写真实。

`GET /api/rewrite-drafts/{run_id}/export.md`

导出 Markdown。

`GET /api/rewrite-drafts/{run_id}/export.pdf`

导出 PDF。

要求：

- PDF 必须支持中文字体，不能出现乱码或问号。
- 输出要像真实简历：摘要、技能、项目经历、证据说明，而不是一堆机器生成的 diff。
- 技术词可保留英文，其他说明尽量中文。
- 高风险改写必须放入 `risks`，且默认不进入正式简历。

### 5.6 W6 InterviewCoachAgent：面试准备包

`POST /api/interview-packs`

请求：

```json
{
  "user_id": "local-user",
  "resume_profile": {},
  "job_profile": {},
  "match_report": {},
  "rewrite_draft": {}
}
```

返回：

```json
{
  "pack": {
    "readiness_score": 73,
    "predicted_questions": [],
    "project_followups": [],
    "answer_frameworks": [],
    "truthfulness_warnings": [],
    "needs_practice": []
  }
}
```

要求：

- 面试题要像真实面试，不要只问“如何满足 Python 要求”。
- 推荐题型：
  - 请结合你的项目经历，说明你在哪个模块使用了 FastAPI，遇到过什么问题，最后怎么验证？
  - 你的 Agent 工作流如何拆分任务？失败重试和人工确认如何设计？
  - 如果 JD 要求 SQL/REST API，但简历证据不足，你准备怎么诚实回答？
- STAR 讲法要解释为：Situation 背景、Task 任务、Action 行动、Result 结果。
- 如果接入 Tavily，可用 web search 辅助生成更接近真实岗位的追问题，但不能直接复制网上内容。

### 5.7 W7 JobCollector：岗位抓取与研究

`POST /api/job-collector`

用途：基于关键词、城市、岗位方向抓取或整理岗位候选。

请求：

```json
{
  "query": "AI Agent 实习 后端 FastAPI",
  "location": "苏州",
  "limit": 5
}
```

要求：

- Tavily 可用时查真实网页摘要。
- Tavily 不可用时返回 dry-run 示例，并标明来源。

### 5.8 W8 ApplicationCRM：投递记录与长期记忆

`POST /api/applications`

请求：

```json
{
  "user_id": "local-user",
  "company": "星河智能科技",
  "title": "AI Agent 全栈开发实习生",
  "resume_run_id": "run_xxx",
  "match_run_id": "run_xxx",
  "interview_pack_run_id": "run_xxx",
  "status": "ready_to_apply",
  "notes": "准备投递前确认 JD、简历和面试材料。"
}
```

`GET /api/applications`

按状态和用户查询。

`PATCH /api/applications/{application_id}/status`

更新投递状态，如 `ready_to_apply`、`applied`、`interviewing`、`offer`、`rejected`。

要求：

- 不自动替用户投递，只保存记录和下一步任务。
- 记录长期记忆，例如本次核心技能信号、主要缺口、下一步补强建议。

### 5.9 W9 EvalHarness：质量评测与 QualityGate

`POST /api/evals`

请求：

```json
{
  "name": "AI Agent 求职链路质量评测",
  "artifacts": {
    "resume_profile": {},
    "job_profile": {},
    "match_report": {},
    "rewrite_draft": {},
    "interview_pack": {},
    "application": {}
  },
  "mode": "judge"
}
```

返回：

```json
{
  "report_id": "eval_xxx",
  "score": 93.12,
  "gate": "WARN",
  "passed": 21,
  "warnings": 3,
  "failures": 0,
  "items": []
}
```

`GET /api/evals`

返回评测报告列表。

`GET /api/evals/{report_id}`

返回 JSON 报告。

`GET /api/evals/{report_id}/report.html`

返回可打开的 HTML 报告。

要求：

- 检查解析覆盖、匹配证据、改写真实性、面试准备完整性、CRM 记录质量。
- `PASS/WARN/FAIL` 必须可解释。
- OpenAI Judge 可用时调用模型评测；不可用时用规则评测 fallback。

### 5.10 W10 Production：生产化检查、余额、研究

`GET /api/production/readiness`

返回生产化就绪检查：配置、密钥是否存在、dry-run 状态、安全头、CORS、测试覆盖提示等。

`GET /api/production/cost-summary`

返回 token 和成本摘要。

`POST /api/research/search`

请求：

```json
{
  "query": "AI Agent 全栈开发实习 面试题 FastAPI RAG",
  "max_results": 5
}
```

返回 Tavily 或 dry-run 搜索结果。

`GET /api/provider-balances`

返回 DeepSeek、OpenAI、Tavily 的余额摘要。前端只展示“约可调用次数”和百分比，不得返回 API key。

返回：

```json
{
  "generated_at": "2026-07-05T00:00:00Z",
  "summary": "2/3 个供应商返回实时余额，其余使用本地预算估算。",
  "providers": [
    {
      "provider": "deepseek",
      "label": "DeepSeek",
      "configured": true,
      "live": true,
      "status": "ok",
      "percent_remaining": 39,
      "estimated_calls_remaining": 9800,
      "balance_label": "CNY/USD 19.60",
      "remaining_label": "约 9800 次",
      "unit_label": "按 ¥0.002/次估算",
      "source": "live",
      "issues": []
    }
  ],
  "docs": {
    "deepseek": "https://api-docs.deepseek.com/api/get-user-balance",
    "openai": "https://platform.openai.com/docs/api-reference/usage",
    "tavily": "https://docs.tavily.com/documentation/api-reference/endpoint/usage"
  }
}
```

要求：

- DeepSeek 可用官方余额接口。
- OpenAI Costs/Usage 接口可能需要组织管理员权限；403 时返回本地估算并写入 issues。
- Tavily 可用 usage/credits 类接口；若官方接口不可用，返回预算估算。
- 水位百分比要与前端水位一致，39% 就只显示约 39% 高度。

## 6. LLM 调用要求

建议抽象 `LLMClient`：

```python
class LLMClient:
    async def structured_json(self, *, system: str, user: str, schema: type[BaseModel]) -> BaseModel:
        ...
```

实现要求：

- 支持 DeepSeek OpenAI-compatible Chat Completions。
- 支持 OpenAI 作为 Judge 或备用模型。
- 支持 timeout、retry、429 backoff。
- 所有 prompt 都要要求中文输出、证据锁定、不得伪造经历。
- 记录 prompt_tokens、completion_tokens、total_tokens、latency_ms、estimated_cost。

注意：把结构化 JSON 转换成更自然的简历语言，不是 function calling。它更像“二次 LLM 生成 / structured rewrite”。Function calling 是模型决定调用工具，例如 `search_web`、`get_balance`、`parse_resume`。

## 7. Tavily 调用要求

Tavily 用于岗位研究、真实面试题参考、公司/行业信息搜索。

要求：

- 后端封装 `TavilyClient.search(query, max_results, search_depth)`。
- 搜索结果要保存 title、url、content、score。
- 前端展示时只展示摘要，不要把长网页内容原样塞入页面。
- dry-run 时返回固定示例，便于演示。

## 8. 安全与部署要求

- `.env` 必须被 `.gitignore` 忽略。
- 任何接口都不能返回 API key。
- 支持 CORS 配置，默认允许 `localhost:5173` 和 `localhost:5174`。
- 可选 `API_ACCESS_TOKEN`：如果配置了，写操作接口需要 Bearer token。
- 生产部署前关闭不必要的 dry-run，并确认 provider balance 不暴露敏感字段。

## 9. 前端依赖的关键字段

前端需要：

- 首页输入框：调用主流程或具体 W2-W9 接口。
- W2 区域：展示 resume_profile、job_profile、source、model、issues。
- W3 区域：展示 run 状态、steps、checkpoints、approval notes。
- W4 区域：展示匹配分、证据映射、主要缺口、改写优先级。
- W5 区域：展示中文投递稿、改写条目、风险提示、审批和 PDF 导出。
- W6 区域：展示真实面试问题、项目追问、STAR 讲法、需要补强项。
- W8 区域：展示投递记录、长期记忆、下一步任务。
- W9 区域：展示 QualityGate、PASS/WARN/FAIL、HTML 报告链接。
- 浮动按钮：
  - 音乐按钮：纯前端。
  - API 余额按钮：调用 `GET /api/provider-balances`。
  - Demo 按钮：前端播放 `public/careerpilot-demo.mp4` 或外部演示视频。

## 10. 测试与验收

后端验收命令：

```bash
cd backend
pip install -e ".[dev]"
pytest
uvicorn app.main:app --reload
```

前端联调：

```bash
cd frontend
npm install
npm run build
npm run dev
```

最低测试覆盖：

- Parser：中文简历/JD 能解析；LLM 不可用时 fallback 可用。
- Match：输出匹配分、缺口、证据映射。
- Rewrite：不伪造经历；中文 PDF 不乱码。
- Interview：题目像真实面试，且和项目经历/JD 相关。
- Application：能保存和更新投递状态。
- Eval：能生成 JSON 和 HTML 报告。
- Provider balance：密钥缺失、403、实时余额成功三种情况都能返回安全响应。

## 11. 当前产品要求摘要

如果从零重写，优先保证下面这些体验：

1. 用户输入真实简历和目标 JD。
2. 后端解析成结构化 profile。
3. 后端匹配岗位，说明“哪里匹配、哪里缺证据、哪里不能写”。
4. 后端生成中文简历改写稿，必须能导出中文正常显示的 PDF。
5. 后端生成真实面试准备包，问题要结合项目经历，而不是泛泛技术八股。
6. 后端保存投递记录和下一步任务。
7. 后端用 QualityGate 检查整条链路质量。
8. 前端可以展示 API 余额和 Demo 视频，但不能暴露密钥。

这个项目最终在简历中的定位是：面向求职投递场景的 AI Agent 应用平台，重点体现 Agent workflow、structured output、evidence-locked generation、human-in-the-loop、run trace、LLM/Tavily 工具集成和质量评测闭环。
