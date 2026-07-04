# Week7 代码详解：InterviewCoachAgent

Week7 的目标是把前面几周的结构化材料继续转成“面试可练习内容”。

这一周新增的是 Interview Coach Agent，它会基于：

- Week2 的简历/JD 结构化结果；
- Week4 的匹配分、缺口和优先级；
- Week5 的证据锁定简历改写草稿；

生成：

- 面试题预测；
- 项目追问；
- 项目回答框架；
- 技术复习清单；
- 模拟面试准备分。

## 为什么 W7 不能直接编面试答案？

CareerPilot 的底线仍然是：

```text
只能基于真实经历准备表达，不能替用户制造虚假经历。
```

所以 W7 输出的项目回答框架不是“最终背诵稿”，而是一个结构化讲法。它底层仍参考
STAR（Situation / Task / Action / Result，即背景、任务、行动、结果），但产品界面不会
强迫用户理解这个术语：

- 背景怎么讲；
- 任务和个人职责怎么讲；
- 行动从哪些模块拆；
- 结果必须基于已有证据。

如果某个技术点没有证据，InterviewCoachAgent 会把它放入“需要补强”，而不是写成用户已经掌握。

## 后端新增文件

### `backend/app/schemas/interview.py`

这个文件定义 W7 的输入和输出结构。

`InterviewPackRequest` 是接口输入：

- `resume_profile`：Week2 简历结构化结果。
- `job_profile`：Week2 JD 结构化结果。
- `match_profile`：Week4 匹配结果，可选但推荐传入。
- `rewrite_draft`：Week5 改写草稿，可选。
- `user_id`：当前用户。

`InterviewPack` 是核心输出：

- `pack_id`：面试包 ID。
- `company`：目标公司。
- `title`：目标岗位。
- `target_keywords`：面试准备关键词。
- `predicted_questions`：预测面试题。
- `project_followups`：项目追问。
- `star_answers`：项目回答框架。字段名沿用早期 schema，前端展示为“项目回答框架”。
- `knowledge_points`：技术复习点。
- `mock_score`：模拟面试准备分。
- `evidence_warnings`：证据风险提示。主流程隐藏，开发者视图和质量评测使用。
- `markdown`：可导出的面试准备包文本。

### `InterviewQuestion`

一条预测面试题包含：

- `category`：题目类型，例如技术题、项目题、缺口追问、系统设计题。
- `question`：具体问题。
- `why_asked`：为什么面试官可能问。
- `suggested_angle`：建议回答角度。
- `priority`：准备优先级，`P0` 最高。
- `evidence`：支撑这道题的简历证据。

### `ProjectFollowUp`

项目追问用于模拟面试官深挖项目。

字段包括：

- `project_name`
- `question`
- `probe_focus`
- `evidence`
- `risk_flags`

如果项目没有覆盖某个 JD 关键词，系统不会让用户硬说“我做过”，而是放入 `risk_flags`。

### `StarAnswerDraft`

项目回答框架不是完整作文，而是结构：

- `prompt`
- `situation`
- `task`
- `action`
- `result`
- `evidence`
- `risk_notes`

这让用户可以用自己的语言练习，同时保持回答不越界。

### `KnowledgePoint`

技术复习点有三种状态：

- `covered`：已有证据。
- `partial`：部分相关。
- `gap`：需要补强。

如果是 `gap`，前端会把它展示在“需要补强”区域。

## 核心服务

### `backend/app/services/interview_coach_agent.py`

`InterviewCoachAgent.create_pack(...)` 是 W7 的主入口。

流程：

```text
resume_profile
job_profile
match_profile
rewrite_draft
→ target keywords
→ predicted questions
→ project followups
→ answer frameworks
→ knowledge points
→ mock score
→ evidence warnings
→ markdown
```

### 1. 生成 target keywords

关键词来源优先级：

1. Week5 `rewrite_draft.target_keywords`
2. Week4 `matched_keywords`
3. Week4 `missing_keywords`
4. Week4 `priority_ranking`
5. JD `tech_keywords`
6. JD `hidden_keywords`
7. 简历 `skills`

这样 W7 会把“岗位最关心什么”和“用户真实有什么证据”放在一起。

### 2. 生成预测问题

W7 会从四类来源生成问题：

#### 项目难点

例如简历有 `CareerPilot` 项目：

```text
请结合 CareerPilot，讲一次你遇到的核心技术难点：当时问题是什么，你怎么定位，最后怎么验证？
```

这类问题更接近真实面试，因为面试官通常不会只问“会不会某技术”，而是追问：

- 你到底做了哪一块；
- 你遇到过什么具体问题；
- 你怎么定位；
- 最后怎么证明方案有效。

#### 硬性要求

例如 JD 有 `FastAPI`：

```text
请结合一个真实项目，说明你在哪里用过 FastAPI，当时解决了什么工程问题？
```

如果简历里有证据，`suggested_angle` 会提示先引用证据再展开。

#### 岗位职责

例如 JD 要求“构建 AI Agent 系统”：

```text
这份 JD 提到“构建 AI Agent 系统”。你做过哪些相近部分？边界在哪里？
```

这类问题考察系统设计、工程拆解、边界意识。

#### 匹配缺口

如果 W4 发现 `SQL` 缺失：

```text
JD 提到 SQL。你目前有哪些相近基础？如果现场被追问，你会如何说明边界和补强计划？
```

这里的建议角度是：

```text
先说明已有相近经验，再明确不会夸大；最后给出补强计划。
```

### 3. 生成项目追问

每个项目默认生成两类追问：

1. 架构类：

```text
项目核心架构是什么？哪些模块最能证明你适合这个岗位？
```

2. 复盘类：

```text
你最难排查的问题是什么，最后如何验证？
```

这比简单生成“介绍一下项目”更接近真实面试，因为面试官通常会深挖：

- 你负责了什么；
- 为什么这么设计；
- 失败时如何定位；
- 结果怎么验证。

### 4. 生成项目回答框架

`_star_answers()` 会从简历项目和经历生成项目回答框架。

例如项目 `CareerPilot`：

- 背景：项目背景；
- 任务：要证明哪些岗位能力；
- 行动：按需求理解、方案设计、核心实现、测试验证来讲；
- 结果：只讲证据能支撑的产出。

如果没有量化指标，W7 不会编数字，而是提示可以讲：

- 可展示物；
- 代码；
- 运行截图；
- 报告。

### 5. 生成技术复习清单

`_knowledge_points()` 会根据关键词判断当前信号：

- 简历 evidence 覆盖到：`covered`
- W4 明确缺失：`gap`
- 其他情况：`partial`

这份清单帮助用户知道面试前先复习什么。

### 6. 生成模拟面试准备分

`_score()` 会估算四个维度：

- 证据可信度；
- 岗位贴合度；
- 表达准备度；
- 技术复习度。

这个分数不是面试通过概率，而是准备完整度。

## API 路由

### `backend/app/api/routes/interview_packs.py`

接口：

```http
POST /api/interview-packs
```

流程：

1. 创建 `AgentRun`。
2. 设置 state 为 `RUNNING`。
3. 增加 `InterviewCoachAgent` 的 `interview_generate` step。
4. 调用 `InterviewCoachAgent().create_pack_with_llm(...)`。
5. 完成 step。
6. 保存 checkpoint：`interview_pack`。
7. 设置 run state 为 `COMPLETED`。
8. 返回 `run_id` 和 `pack`。

## 前端新增内容

### `frontend/src/types.ts`

新增：

- `InterviewQuestion`
- `ProjectFollowUp`
- `StarAnswerDraft`
- `KnowledgePoint`
- `MockInterviewScore`
- `InterviewPack`
- `InterviewPackResponse`

### `frontend/src/api/client.ts`

新增：

```ts
createInterviewPack({
  resume_profile,
  job_profile,
  match_profile,
  rewrite_draft
})
```

对应接口：

```http
POST /api/interview-packs
```

### `frontend/src/App.tsx`

新增状态：

```ts
interviewResult
```

新增操作：

```ts
handleCreateInterviewPack()
```

用户主流程新增第五步：

```text
准备面试
```

展示内容包括：

- 准备分；
- 关键词；
- 预测问题；
- 项目追问；
- 项目回答框架；
- 需要补强；
- 证据风险（开发者视图展示，主流程隐藏）。

开发者视图新增 Week7 面板，方便查看 W7 与 W2/W4/W5 的关系。

## W7 与项目主题的关系

W7 把 CareerPilot 从“帮你改简历”推进到“帮你准备真实面试表达”。

它和普通问答机器人的区别是：

```text
普通问答：根据问题直接生成答案。
CareerPilot W7：根据简历证据、岗位要求、匹配缺口和改写草稿生成可追踪准备材料。
```

简历里可以这样描述 W7：

```text
实现 InterviewCoachAgent，基于结构化简历、JD、匹配缺口和证据锁定改写草稿，生成真实面试风格的问题预测、项目追问、项目回答框架、技术复习清单与模拟准备分，并通过 run trace/checkpoint 保留生成过程。
```

## 验证方式

### 后端测试

```bash
backend/.venv/bin/pytest backend/tests/test_interview_coach_agent.py
```

预期：

- service 能生成面试包；
- API 能返回 `run_id` 和 `pack`；
- run state 是 `COMPLETED`；
- checkpoint 名称是 `interview_pack`；
- 面试包包含预测题、项目追问、项目回答框架和准备分。

### 前端构建

```bash
cd frontend
npm run build
```

预期：

- TypeScript 类型全部通过；
- W7 的前端类型和后端 schema 对齐；
- 面试准备包模块能被编译进页面。

## 后续可深化方向

W7 当前是规则型第一版。后续可以深化：

- 接入真实 LLM 生成更自然的面试问答；
- 增加语音模拟面试；
- 增加回答评分 rubric；
- 增加“反问面试官”生成；
- 把用户每次模拟面试反馈写入 Week8 长期记忆。
