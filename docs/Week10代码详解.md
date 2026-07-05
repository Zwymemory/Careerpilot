# Week10 代码详解：生产化收尾、Judge 配置与成本可观测

Week10 的目标不是再增加一个求职功能，而是把前面 W1-W9 的 Agent 链路整理成一个可以演示、可以部署、可以解释的工程版本。

本周新增能力：

- Docker Compose 本地生产形态；
- 可选 API Token 鉴权；
- API 限流；
- 安全响应头；
- 生产就绪检查；
- LLM/Judge 成本汇总；
- OpenAI-compatible LLM-as-Judge 配置；
- Tavily 联网研究配置；
- W10 smoke demo 脚本；
- 项目简历定位文档。

## W10 的产品意义

CareerPilot 已经能完成：

```text
解析简历/JD
→ 规划 Agent 流程
→ 匹配岗位
→ 生成证据锁定的改写建议
→ 面试准备
→ 投递 CRM
→ QualityGate 评测
```

但真实工程还需要回答这些问题：

- 这个服务怎么启动？
- API 是否有最基本的访问边界？
- LLM 调用成本能不能被看到？
- Judge 模型是否真的启用？
- 演示时如何快速验证链路？
- 面试时如何解释这个项目不是普通 RAG？

W10 就是为这些问题收尾。

## 环境配置

### `backend/app/core/config.py`

新增配置：

```python
judge_dry_run: bool = True
judge_provider: str = "openai"
judge_model: str = "gpt-4.1-mini"
judge_base_url: str = "https://api.openai.com/v1"
judge_api_key: str | None = None

tavily_dry_run: bool = True
tavily_base_url: str = "https://api.tavily.com"
tavily_api_key: str | None = None

api_access_token: str | None = None
rate_limit_requests_per_minute: int = 180
security_headers_enabled: bool = True
```

含义：

- `judge_*`：给 W9 QualityGate 的真实 LLM-as-Judge 使用；
- `tavily_*`：给联网岗位研究、公司背景补充和面试题参考使用；
- `api_access_token`：本地为空，部署或公开演示时开启；
- `rate_limit_requests_per_minute`：每个客户端每分钟最多请求数；
- `security_headers_enabled`：是否加基础安全响应头。

Tavily 在 CareerPilot 里不是“替用户编经历”的来源。它只用于岗位、公司、面试题风格等外部背景参考。候选人简历内容仍然必须来自 W2 解析出的真实简历证据。

### `.env` 与 `.env.example`

真实 key 只写在本地 `backend/.env`。

`backend/.env.example` 只保留空值和示例配置，方便别人复现项目，但不会泄露密钥。

## LLMClient 的改造

### `backend/app/services/llm_client.py`

W10 前，`LLMClient` 只读取全局 `LLM_*` 配置。

W10 后，它支持按用途传入 override：

```python
LLMClient(
    settings,
    provider=settings.judge_provider,
    model=settings.judge_model,
    base_url=settings.judge_base_url,
    api_key=settings.judge_api_key,
    dry_run=settings.judge_dry_run,
)
```

这样 Parser、Planner、Judge 可以使用不同模型或不同 provider。

这不是 Function Calling。

这里更准确的说法是：

```text
LLM structured output + judge prompt + JSON schema约束
```

Function Calling 更像是模型选择并调用工具。当前 Judge 是后端主动调用模型做审查，模型只返回结构化评审 JSON。

## Production Guard

### `backend/app/services/production_guard.py`

这个文件实现一个轻量的生产保护中间件。

### 1. API Token 鉴权

如果没有设置：

```env
API_ACCESS_TOKEN=
```

那么本地开发不受影响。

如果设置了：

```env
API_ACCESS_TOKEN=your-demo-token
```

那么除 `/api/health` 外，所有 `/api/*` 都需要：

```http
Authorization: Bearer your-demo-token
```

或：

```http
X-API-Key: your-demo-token
```

这保证公开演示环境不会被随意调用。

### 2. 限流

`InMemoryRateLimiter` 用 `x-forwarded-for` 或客户端 IP 作为 key。

它维护一个 60 秒滑动窗口：

```text
请求进入
→ 清理 60 秒前的旧请求
→ 如果窗口内数量超过限制，返回 429
→ 否则放行
```

当前实现适合：

- 本地 demo；
- 单实例部署；
- 面试演示。

如果生产多实例部署，应换成 Redis 或网关级限流。

### 3. 安全响应头

默认加：

- `X-Content-Type-Options: nosniff`
- `X-Frame-Options: DENY`
- `Referrer-Policy: strict-origin-when-cross-origin`
- `Permissions-Policy: camera=(), microphone=(), geolocation=()`

这不是完整安全方案，但能体现项目有基本安全边界意识。

## FastAPI 注册

### `backend/app/main.py`

W10 新增：

```python
@app.middleware("http")
async def apply_production_guard(request: Request, call_next):
    return await production_guard_middleware(request, call_next, settings)
```

并注册：

```python
app.include_router(production.router, prefix="/api")
```

注意中间件在所有路由前执行，所以认证、限流、安全头都是统一入口。

## 生产检查接口

### `backend/app/api/routes/production.py`

新增两个接口。

### `/api/production/readiness`

返回：

```json
{
  "status": "ready",
  "environment": "local",
  "llm_configured": true,
  "judge_configured": true,
  "auth_enabled": false,
  "rate_limit_requests_per_minute": 180
}
```

它用于回答：

- 后端是否启动；
- LLM 是否从 dry-run 切到真实调用；
- Judge 是否启用；
- API 是否开启鉴权；
- 限流配置是多少。

### `/api/production/cost-summary`

返回当前进程内所有 run 的成本汇总：

- run 数；
- 成本记录数；
- prompt token；
- completion token；
- total token；
- estimated cost CNY；
- 按 provider/model 分组的成本；
- 最近若干条成本。

当前成本来自 `RunStore` 内存记录，后续接数据库后应聚合 SQL 表。

## RunStore 成本汇总

### `backend/app/services/run_store.py`

新增：

```python
def cost_summary(self) -> CostSummary:
```

它扫描所有 `run.costs`，按：

```text
provider + model
```

聚合：

- 调用次数；
- prompt tokens；
- completion tokens；
- total tokens；
- estimated cost。

这让 CareerPilot 不只是“能调用模型”，还可以回答：

```text
这次求职 Agent 流程大概花了多少钱？
哪个模型成本最高？
最近的 LLM 调用是什么？
```

这是面向 Agent 工程非常重要的可观测性点。

## LLM-as-Judge 真调用

### `backend/app/services/eval_harness.py`

W9 已经有 rule-based QualityGate 和 dry-run Judge。

W10 增加：

```python
async def evaluate_async(...)
async def _llm_judge_or_fallback(...)
```

流程：

```text
先跑规则评测
→ 如果 judge_mode=llm_as_judge
→ 检查 JUDGE_DRY_RUN 和 JUDGE_API_KEY
→ 调 OpenAI-compatible chat completions
→ 要求模型只返回 JSON
→ JSON repair + Pydantic 转换
→ 把 Judge 结果作为一条 EvalRuleResult 加入报告
→ 把 Judge 的 token/cost 写入 run trace
```

如果没有 key、处于 dry-run、模型报错或 JSON 无法修复：

```text
不会让整个评测失败
→ 降级成规则评测 warning
→ 在报告里标记 judge.llm_not_configured 或 judge.llm_fallback
```

这符合 Agent 系统的工程原则：

```text
外部模型能力可以增强系统，但不能让核心工作流不可用。
```

## Docker Compose

### `docker-compose.yml`

包含：

- `backend`：FastAPI；
- `frontend`：Nginx 静态托管 React；
- healthcheck：前端等待后端 `/api/health` 通过；
- `env_file`: `backend/.env`。

### 前端 Nginx 反代

`frontend/nginx.conf` 把：

```text
/api/*
```

转发给：

```text
backend:8000/api/*
```

所以 Docker 环境下前端代码仍然可以用相对路径调用 API。

## Demo 脚本

### `scripts/demo_w10.sh`

它会依次调用：

```text
/api/health
/api/production/readiness
/api/evals
/api/production/cost-summary
```

用途：

- 快速确认服务能跑；
- 快速确认生产配置；
- 快速生成一次 QualityGate 报告；
- 快速查看成本汇总。

## W10 的边界

W10 完成的是“项目收尾版”，不是完整商业生产版。

已完成：

- 可部署 demo；
- 可演示安全边界；
- 可查看成本；
- 可启用真实 Judge；
- 可解释项目工程价值。

仍可深化：

- PostgreSQL 持久化 run / profile / report；
- Redis 限流和任务队列；
- 后台 worker 执行长任务；
- OpenTelemetry tracing；
- 多用户登录与权限隔离；
- 文件上传和中文 PDF 简历模板增强；
- 面试题库检索或联网检索增强；
- 更严格的 LLM judge rubric 和 benchmark 数据集。

## 面试时怎么讲 W10

可以这样介绍：

```text
我在项目收尾阶段补了生产化边界：Docker Compose 启动、API Token 鉴权、
每客户端限流、安全响应头、健康和 readiness 检查、成本汇总接口，以及可选 LLM-as-Judge。
这样这个 Agent 项目不仅能生成求职材料，还能追踪模型调用成本、审查输出质量，并在外部模型失败时降级。
```

这能体现你不是只会调用大模型，而是在做：

```text
AI Agent workflow engineering
LLM observability
human-in-the-loop safety
production readiness
```
