# Week1 代码详解

## 可行性判断

项目可行，且文档边界完整。CareerPilot 的难点不在单次生成，而在“可追踪、可审批、可恢复”的工作流工程化。Week1 不应过早实现完整 Agent，而应先固定 API 合约、运行追踪、成本记录和 LLM 统一入口，为 Week2-Week5 的解析、匹配、改写和审批打基础。

## 本阶段目标

- 后端使用 FastAPI 初始化 API。
- 使用 Pydantic v2 定义 run、step、event、cost、LLM schema。
- 建立统一 `LLMClient`，支持 dry-run、timeout、retry、structured-output 参数、token/cost 记录。
- 建立 `RunStore` 保存 run trace，并支持 `Idempotency-Key`。
- 前端使用 React + TypeScript 展示 run 状态、step trace、event、token、cost、latency。
- 所有正式导出类动作在 Week1 先停在 `WAITING_APPROVAL`。

## 后端结构

```text
backend/app/main.py                FastAPI app factory
backend/app/core/config.py         环境变量配置
backend/app/schemas/llm.py         LLM 请求和响应 schema
backend/app/schemas/run.py         run/step/event/cost schema
backend/app/services/llm_client.py 统一 LLM client
backend/app/services/run_store.py  Week1 in-memory trace store
backend/app/services/run_orchestrator.py Week1 编排器
backend/app/api/routes/runs.py     run API
```

## Run Trace 流程

1. 前端提交 goal。
2. 后端读取 `Idempotency-Key`，避免重复点击创建重复 run。
3. `RunOrchestrator` 创建 run，并进入 `PLANNING`。
4. `PlannerAgent` 通过统一 LLM client 生成 dry-run plan。
5. 后端记录 step、event、tokens、latency、estimated cost。
6. trace checkpoint 完成后，run 进入 `WAITING_APPROVAL`。

## 验证流程

```bash
cd backend
python3 -m compileall app tests
```

安装依赖后可继续运行：

```bash
pip install -e ".[dev]"
pytest
uvicorn app.main:app --reload
```

前端验证：

```bash
cd frontend
npm install
npm run build
npm run dev
```

## 面试讲法

Week1 我没有直接堆 Agent，而是先实现 Agent 平台的底座：统一 LLM Client、Run Trace、Cost Tracking 和 Idempotency。这样后续 ResumeParserAgent、MatchAgent、ResumeRewriteAgent 都会天然具备可观测性和可恢复能力，也能满足简历生成必须 evidence-locked 和 human-in-the-loop 的安全约束。

## 常见追问

**为什么 Week1 用内存 store？**

为了先固定领域模型和 API 合约。Week3 引入 LoopEngine 时再把 `RunStore` 替换为 SQLAlchemy repository，避免第一周就被数据库迁移细节拖慢。

**如何防止重复扣费？**

所有创建 run 的接口支持 `Idempotency-Key`。同一用户使用同一个 key 重复提交会返回同一个 run。

**没有 API key 能不能演示？**

可以。`LLM_DRY_RUN=true` 时，统一 LLM client 会返回稳定的模拟响应，同时照常生成 token、latency 和成本记录。
