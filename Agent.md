# CareerPilot Agent.md：项目底线规则与开发约束

本文件是 CareerPilot 项目的底层规则。后续所有对话、代码实现、Agent 行为和文档输出都必须遵守。

## 1. 项目使命

CareerPilot 的目标是帮助学生和求职者更高效地完成求职准备，包括：

```text
岗位分析
简历解析
岗位匹配
简历定制
投递材料生成
面试准备
反馈复盘
```

它不是“伪造经历工具”，也不是“自动骚扰招聘平台工具”。

系统必须帮助用户更真实、更清晰、更有针对性地表达已有能力。

## 2. 最高优先级原则

### 2.1 不伪造经历

任何 Agent 都不能编造：

- 未发生过的实习；
- 未做过的项目；
- 未掌握的技术；
- 虚假的量化指标；
- 虚假的学校、奖项、论文、证书；
- 虚假的公司经历；
- 虚假的投递或面试反馈。

如果缺少证据，只能：

```text
建议用户补充信息
弱化表达
标记为待确认
```

不能直接写成事实。

### 2.2 Evidence-locked Generation

所有简历改写必须能追溯到 evidence。

每条新增或强化表述都要对应：

```text
source_resume_section
source_project
source_experience
source_user_input
source_feedback
```

如果没有证据，输出必须标记：

```text
NEEDS_USER_CONFIRMATION
```

### 2.3 Human-in-the-loop

以下动作必须人工审批：

- 生成正式投递版简历；
- 导出 PDF；
- 生成求职信；
- 生成邮件正文；
- 保存为正式投递记录；
- 使用外部浏览器读取登录态页面；
- 任何可能影响用户真实求职的动作。

系统不能自动投递岗位，除非用户明确要求且后续版本实现合法合规的审批流程。

### 2.4 不绕过平台规则

Browser Tool 只能用于：

- 用户提供 URL 的岗位读取；
- 公开页面内容提取；
- 截图留证；
- 用户授权页面的辅助阅读。

不能用于：

- 绕过验证码；
- 绕过登录限制；
- 批量刷接口；
- 自动骚扰 HR；
- 违反招聘网站 robots/服务条款的行为。

## 3. 工程底线

### 3.1 所有 Agent run 必须可追踪

每次 run 必须记录：

```text
runId
userId
goal
state
step
agentName
toolName
input
output
status
latencyMs
model
tokens
cost
error
createdAt
```

不能有不可追踪的黑盒执行。

### 3.2 所有关键步骤必须可恢复

LoopEngine 必须支持：

```text
checkpoint
resume
retry
timeout
fallback
```

如果模型调用失败，不应丢失已完成步骤。

### 3.3 幂等性

可能重复提交的接口必须支持：

```text
Idempotency-Key
```

防止用户重复点击导致重复 run、重复扣费、重复生成 artifact。

### 3.4 成本可见

所有 LLM 调用必须记录成本。

前端应尽量展示：

```text
本次 run 已消耗 tokens
预计成本
调用模型
耗时
```

### 3.5 质量评测

新增重要能力时，必须同步考虑 Eval Harness。

至少包含：

```text
JSONL case
rule-based grader
LLM-as-judge 可选
QualityGate
HTML report
```

不能只靠人工看 demo。

## 4. Agent 行为规则

### 4.1 PlannerAgent

PlannerAgent 负责拆任务，但不能直接生成最终材料。

它必须输出：

```text
plan
required_tools
approval_points
risk_points
```

### 4.2 ResumeParserAgent

必须区分：

```text
事实字段
推断字段
待确认字段
```

不能把推断字段当事实。

### 4.3 JobIntelAgent

解析 JD 时必须区分：

```text
hard_requirements
nice_to_have
hidden_keywords
responsibilities
company_context
```

如果网页抓取失败，必须返回明确错误，而不是编造岗位内容。

### 4.4 MatchAgent

匹配分必须可解释。

不能只输出：

```text
score = 85
```

必须输出：

```text
matched_requirements
missing_requirements
resume_evidence
reasoning
```

### 4.5 ResumeRewriteAgent

必须遵守：

```text
不新增无证据经历
不夸大熟练程度
不虚构指标
不改变教育经历
不虚构公司/岗位
```

允许：

```text
优化措辞
调整项目顺序
突出和 JD 相关的技术
把已有经历表达得更结构化
把弱表达改成强但真实的表达
```

### 4.6 QualityJudgeAgent

必须检查：

```text
是否有无证据新增内容
是否存在夸大表达
是否遗漏 JD 关键要求
是否格式错误
是否过度关键词堆砌
是否适合投递
```

如果有风险，必须阻断进入正式导出流程。

### 4.7 InterviewCoachAgent

生成面试答案时必须基于用户真实经历。

不能帮助用户伪造项目细节。

可以帮助用户：

```text
梳理项目讲法
解释技术原理
准备追问
把不会的点标成需要复习
```

## 5. 前端规则

前端使用：

```text
React + TypeScript + Vite
```

优先组件：

```text
Tailwind CSS
shadcn/ui
TanStack Query
React Router
Zustand 可选
```

前端必须展示：

- run 状态；
- step trace；
- tool input/output 摘要；
- artifact 预览；
- diff view；
- human approval 按钮；
- cost / latency；
- failure reason；
- eval report。

前端不能隐藏风险提示。

## 6. 安全与隐私

简历和求职记录属于敏感个人数据。

必须遵守：

- 默认本地存储；
- 不上传无关第三方；
- API key 不进入前端；
- 日志中避免打印完整简历和 token；
- 导出的 artifact 要有用户确认；
- 删除用户数据时要删除关联 artifact。

## 7. 技术选型规则

### 7.1 后端

必须使用 Python。

默认：

```text
FastAPI
Pydantic
SQLAlchemy
Alembic
PostgreSQL
Redis
Playwright
pytest
```

### 7.2 前端

默认：

```text
React + TypeScript
```

如果后续明确切换 Vue，必须整体切换，不要 React/Vue 混用。

### 7.3 LLM

模型必须通过统一 LLM Client 调用，不允许业务代码散落直接请求不同厂商。

LLM Client 必须处理：

```text
timeout
retry
structured output
token usage
cost
provider fallback
```

## 8. 文档规则

每完成一个阶段，必须补：

```text
WeekX代码详解.md
验证流程
面试讲法
常见追问
```

项目 README 必须始终能回答：

- 项目解决什么问题；
- 如何启动；
- 如何演示；
- 核心架构；
- 技术亮点；
- 当前限制；
- 后续规划。

## 9. 简历导向规则

每个功能都要能落到简历表达。

优先开发能形成以下表达的能力：

- LoopEngine；
- Multi-Agent；
- Tool Runtime；
- Browser Tool；
- Human-in-the-loop；
- Evidence-locked Generation；
- Eval Harness；
- QualityGate；
- Cost Tracking；
- Run Trace；
- Artifact Generation。

不要优先做花哨但讲不清楚的功能。

## 10. 默认开发顺序

如果用户没有特别指定，按以下顺序推进：

```text
Week1 项目骨架 + LLM Client + Run Trace
Week2 Resume/JD Parser
Week3 LoopEngine
Week4 MatchAgent
Week5 ResumeRewriteAgent + Approval
Week6 Browser Tool
Week7 InterviewCoachAgent
Week8 Memory + Application CRM
Week9 Eval Harness
Week10 Production Polish
```

## 11. 最后一条底线

CareerPilot 的目标是帮助用户把真实能力表达清楚，而不是制造虚假竞争力。

任何时候，如果“更好看”和“真实可信”冲突，必须选择：

```text
真实可信
```

