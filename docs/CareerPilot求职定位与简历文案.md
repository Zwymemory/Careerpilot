# CareerPilot 求职定位与简历文案

## 项目定位

CareerPilot 更适合定位为：

```text
AI Agent 工作流平台 / LLM 应用工程 / Human-in-the-loop Agent 系统
```

不建议只说成：

```text
简历生成器
```

也不建议说成：

```text
RAG 项目
```

因为 CareerPilot 的核心不是“检索知识后回答问题”，而是：

```text
围绕真实求职任务，把多个 Agent 步骤串成可追踪、可审批、可评测的工作流。
```

## 和 RAG 项目的区别

你的 RAG 项目更偏：

- 知识库入库；
- chunk / embedding / BM25；
- 混合检索；
- rerank；
- context packing；
- 查询改写；
- 召回评测；
- 文档问答准确率。

CareerPilot 更偏：

- 多阶段 Agent workflow；
- 简历/JD 结构化解析；
- plan / execute / verify / reflect；
- evidence-locked generation；
- human-in-the-loop 审批；
- run trace / checkpoint / event；
- token 和 cost 可观测；
- 面试准备、投递 CRM、质量评测；
- Tavily 联网研究；
- LLM-as-Judge 与 QualityGate。

一句话区别：

```text
RAG 项目证明你能构建知识检索和问答系统；
CareerPilot 证明你能把 LLM 接入一个真实业务流程，并处理状态、工具、审批、成本和质量门禁。
```

## 当前项目适合投什么方向

更适合投：

- AI Agent 实习生；
- LLM 应用开发实习生；
- AI 全栈开发实习生；
- 后端开发实习生（LLM/Agent 方向）；
- 平台工程实习生（AI workflow / observability）；
- ToB AI 应用工程实习。

如果岗位强调：

- LangChain / LangGraph / Spring AI；
- Function Calling / Tool Calling；
- Agent workflow；
- RAG；
- LLM 评测；
- Prompt Engineering；
- FastAPI / React；
- 可观测性；
- 成本控制；
- 人工审核；

CareerPilot 都可以作为主项目讲。

## 简历项目标题建议

### 中文版

```text
CareerPilot 实习求职 Agent 工作流平台
```

### 偏 AI Agent 版

```text
CareerPilot 证据锁定的求职 Agent Workflow 平台
```

### 偏工程平台版

```text
CareerPilot 可追踪 LLM Agent 工作流与质量评测平台
```

## 技术栈写法

```text
Python + FastAPI + React + TypeScript + Pydantic v2 + DeepSeek API + OpenAI-compatible API
+ Tavily Search API + ReportLab + Playwright(optional) + Docker Compose + Run Trace + QualityGate
```

如果简历空间有限：

```text
Python/FastAPI、React/TypeScript、Pydantic、DeepSeek/OpenAI-compatible API、Tavily Search、Docker Compose、Run Trace
```

## 简历项目介绍

可以写：

```text
项目面向学生实习投递场景，构建从岗位收集、简历/JD 结构化解析、匹配评分、能力缺口分析、证据锁定改写、面试准备、投递 CRM 到质量评测的 AI Agent 工作流平台。系统强调 run trace、checkpoint、成本记录和人工审批，避免生成无证据经历。
```

## 简历 bullet 版本

### 版本 A：AI Agent 方向

```text
• 基于 FastAPI 设计多阶段求职 Agent workflow，串联简历/JD 解析、匹配、改写、面试准备、投递 CRM 和 QualityGate，记录 run/step/event/checkpoint，实现可追踪、可复盘的 Agent 执行链路。
• 构建 evidence-locked generation 机制，将简历原始证据、JD 要求、匹配缺口映射到改写建议；无证据内容只进入风险提示，不写入正式简历，支持人工审批后导出 PDF。
• 接入 Tavily Search API 作为 ResearchAgent 工具，为岗位背景、公司信息和真实面试题风格提供联网参考；外部资料只用于问题风格和岗位理解，不作为候选人经历证据。
• 实现 EvalHarness 和可选 LLM-as-Judge，对解析覆盖、匹配证据、改写真实性、面试准备完整度和 CRM 记录质量进行评分，输出 QualityGate PASS/WARN/BLOCK 与 HTML 评测报告。
• 补充生产化边界：Docker Compose、本地/演示 API Token 鉴权、限流、安全响应头、readiness 检查和 token/cost 汇总接口，支持模型调用成本可观测。
```

### 版本 B：后端 / 平台工程方向

```text
• 使用 Python/FastAPI + Pydantic v2 搭建求职 Agent 后端，抽象统一 LLMClient、结构化输出解析、JSON repair、本地 fallback 和错误降级，保障外部模型不稳定时核心流程可运行。
• 设计 RunStore 记录 run、step、event、checkpoint、cost usage 和 idempotency key，为前端提供 Agent 执行轨迹、成本统计和失败恢复基础。
• 实现 MatchAgent、ResumeRewriteAgent、InterviewCoachAgent、ApplicationCRMAgent、EvalHarness 等模块，覆盖从岗位理解到投递记录的完整业务链路。
• 增加 Docker Compose、API Token 鉴权、限流、安全响应头、健康检查和 readiness 接口，完成面向演示环境的生产化收尾。
```

### 版本 C：全栈 / 产品化方向

```text
• 基于 React + TypeScript 构建面向求职流程的前端，将底层 Agent trace 隐藏为开发者视图，主界面聚焦岗位录入、匹配报告、简历改写、面试包、投递 CRM 和质量评测。
• 实现玻璃拟态交互、滚动渐显、预加载、模型处理粒子动画、音乐联动背景和运行状态反馈，提升 LLM 长耗时任务的可感知性。
• 前后端联动展示结构化画像、匹配分、证据映射、缺口优先级、改写风险、审批状态、面试准备项和 QualityGate 报告。
```

## 面试时 30 秒介绍

```text
CareerPilot 是一个面向实习投递场景的 AI Agent 工作流平台。它不是简单生成简历，而是把岗位收集、简历/JD 解析、匹配评分、证据锁定改写、面试准备、投递 CRM 和质量评测串成一条可追踪的 Agent 流程。每一步都会记录 run trace、checkpoint、token 成本和证据来源，并且关键产物需要人工审批，避免模型编造经历。
```

## 面试时 2 分钟介绍

```text
这个项目的核心是 Agent workflow engineering。我先用 FastAPI 和 Pydantic 定义简历画像、岗位画像、匹配报告、改写草稿、面试包、投递记录和评测报告等结构化模型，然后用 RunStore 记录每次执行的 run、step、event、checkpoint 和 LLM cost。

流程上，W2 做结构化解析，W3 做 LoopEngine 的 plan / execute / verify / reflect，W4 做简历和 JD 的证据匹配，W5 做证据锁定的简历改写，W7 做面试准备，W8 做投递 CRM，W9 用 EvalHarness 和 QualityGate 检查生成结果是否可靠，W10 补 Docker、鉴权、限流、readiness 和成本汇总。

这个项目最重要的设计不是“生成”，而是“生成以后怎么证明可信”：每条改写建议都要有原始简历证据或 JD 要求支撑；无证据的内容只会作为风险提醒；最终导出前需要人工审批。这能体现我对 AI Agent 状态管理、工具边界、质量评测、成本观测和人类审批的理解。
```

## 对标截图项目的简历版写法

如果参考你截图里的“项目经历”版式，可以写成下面这一版。它比前面的版本更适合放进简历主体：

```text
CareerPilot 实习求职 Agent 工作流平台                                      2026.07 - 至今
技术栈：Python + FastAPI + React + TypeScript + Pydantic v2 + DeepSeek API + OpenAI-compatible API
+ Tavily Search API + ReportLab + Docker Compose + pytest + QualityGate

项目面向学生实习投递场景，构建可追踪、可审阅、可评测的 AI Agent 工作流，覆盖岗位收集、简历/JD 解析、匹配评分、
证据锁定改写、面试准备、投递 CRM、反馈记忆与质量评测，避免模型编造经历或自动替用户投递。

• Agent 工作流能力：基于 FastAPI 设计 ResumeParser、JobIntel、MatchAgent、ResumeRewriteAgent、InterviewCoach、
  ApplicationCRM、EvalHarness 等模块，串联 run / step / event / checkpoint，记录 token、latency 和 estimated cost。
• 证据锁定生成：使用 Pydantic schema 约束简历/JD结构化输出，将岗位要求、简历证据、匹配缺口映射到改写建议；
  缺少证据的内容只进入 risk/gap，不写入正式简历，支持人工确认后导出中文 PDF。
• 联网研究工具：接入 Tavily Search API，为岗位背景、公司信息和相似面试题风格提供 web evidence；
  InterviewCoach 结合 JD、匹配缺口、项目证据和外部参考生成项目追问、回答框架与复习清单。
• 质量评测与门禁：实现 rule-based + 可选 LLM-as-Judge 的 EvalHarness，对解析覆盖、匹配证据、改写真实性、
  面试准备和 CRM 记录进行评分，输出 QualityGate PASS/WARN/BLOCK 和 HTML 质量报告。
• 产品化与安全边界：补充 Docker Compose、API Token 鉴权、限流、安全响应头、readiness/cost-summary 接口和
  pytest 回归测试；前端隐藏开发者细节，聚焦岗位录入、匹配、改写、面试包、投递记录和质量报告。
```

## 和截图项目的技术对比

不建议直接说 CareerPilot “全面优于”截图里的项目。更准确的判断是：

```text
CareerPilot 在业务链路完整度、用户流程、证据锁定、人类审批、前端产品化和求职场景落地上更完整；
截图项目在后端工程基础设施、持久化、异步任务、benchmark 指标和生产级 RAG/评测深度上更硬核。
```

CareerPilot 已经强于参考项目的部分：

- 端到端产品链路更完整：从 JD/简历解析到匹配、改写、面试、CRM、QualityGate；
- Agent workflow 更贴近真实业务：每一步有状态、审批、trace 和成本；
- 证据锁定更适合求职场景：避免模型把不存在的经历写进简历；
- 前端演示效果更强：可以让面试官直接看到一个完整 AI Agent 应用；
- Tavily 联网研究让面试包和岗位理解更接近真实信息。

当前不如参考项目的部分：

- 还没有 PostgreSQL/SQLAlchemy 持久化 run trace、profile、memory 和 eval case；
- 还没有 Redis/worker 做异步任务队列、幂等去重和限流共享；
- 还没有成体系 JSONL benchmark，例如固定 100 条 JD/简历样本，统计 Precision/Recall/PassRate；
- 没有像 Coding Agent Harness 那样做 subprocess sandbox、patch 验证和真实执行环境隔离；
- 多用户/租户/权限隔离目前仍是轻量 demo 级。

所以面试时可以这样讲：

```text
我这个项目不是单点 RAG，而是一个面向求职流程的 Agent workflow 产品原型。
它已经实现了多阶段 Agent、证据锁定、人工审批、质量门禁和联网研究工具。
如果继续工程化，我会优先补 PostgreSQL 持久化、Redis worker、JSONL benchmark 和 OpenTelemetry，
让它从可演示项目升级成更接近生产级的 AI Agent 平台。
```

## 面试官可能追问

### 1. 为什么这不是一个普通 RAG 项目？

回答重点：

```text
RAG 的核心是检索和上下文构造，而 CareerPilot 的核心是多阶段 Agent workflow。
它可能使用 RAG 作为某个工具，但项目主线是任务规划、工具执行、状态追踪、证据锁定、人工审批和质量评测。
```

### 2. 为什么需要 Human-in-the-loop？

回答重点：

```text
求职材料是高风险内容，模型不能自动替用户确认经历真实性。
所以系统只生成建议，最终是否采纳、是否导出、是否投递都需要用户确认。
```

### 3. LLM-as-Judge 有什么风险？

回答重点：

```text
Judge 不能作为唯一真相来源，所以我先用规则评测做 deterministic baseline，再用 LLM-as-Judge 做补充审查。
如果 Judge 调用失败，系统会降级到规则评测，而不是让整个工作流失败。
```

### 4. 这个项目还能怎么深化？

回答重点：

```text
可以接 PostgreSQL 持久化 run trace 和 profiles，接 Redis/worker 做异步任务，接 OpenTelemetry 做 tracing，
引入真实面试题库或岗位语料增强 InterviewCoach，设计 benchmark 集合评估匹配和改写质量，并做多用户权限隔离。
```
