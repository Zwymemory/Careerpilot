# Week8 代码详解：Memory + Application CRM

Week8 的目标是把 CareerPilot 从“单次生成材料”推进到“长期求职管理”。

前面几周已经能完成：

```text
岗位收集
→ 简历/JD 解析
→ 匹配和缺口
→ 简历改写
→ 面试准备
```

但真实求职不是一次性动作。用户会投多个岗位，每个岗位会有不同状态、反馈和下一步任务。

所以 Week8 新增 Application CRM：

- 投递记录；
- 面试反馈；
- 长期记忆；
- 下一步任务。

## W8 不做什么？

W8 不会自动帮用户投递岗位。

原因是 Agent.md 中明确规定：

```text
系统不能自动投递岗位，除非用户明确要求且后续版本实现合法合规的审批流程。
```

所以 W8 当前只做：

```text
记录、整理、提醒、复盘
```

不做：

```text
自动投递、自动联系 HR、伪造反馈
```

## 后端新增文件

### `backend/app/schemas/application.py`

这个文件定义 W8 的核心数据结构。

### `ApplicationRecord`

一条投递记录包含：

- `application_id`：投递记录 ID。
- `user_id`：用户 ID。
- `company`：公司。
- `title`：岗位。
- `job_url`：岗位链接。
- `status`：投递状态。
- `match_score`：W4 匹配分。
- `interview_score`：W7 面试准备分。
- `resume_headline`：W5 改写标题。
- `target_keywords`：本次投递关键词。
- `notes`：用户备注。
- `memories`：长期记忆。
- `tasks`：下一步任务。
- `feedback`：面试反馈。
- `source_run_ids`：关联的 Agent run。
- `created_at` / `updated_at`：时间。

`status` 当前支持：

```text
SAVED
READY_TO_APPLY
APPLIED
INTERVIEWING
OFFER
REJECTED
ARCHIVED
```

### `ApplicationMemory`

长期记忆不是聊天记录，而是结构化事实。

字段包括：

- `category`：记忆类型。
- `text`：记忆正文。
- `source`：来源，例如 `match_profile`、`interview_feedback`。
- `confidence`：可信度。
- `evidence`：关联证据。
- `created_at`：创建时间。

记忆类型包括：

- `strength`：优势。
- `gap`：缺口。
- `preference`：偏好。
- `feedback`：反馈。
- `follow_up`：跟进事项。

### `ApplicationTask`

下一步任务包含：

- `title`：任务标题。
- `reason`：为什么要做。
- `priority`：`P0`、`P1`、`P2`。
- `status`：`OPEN` 或 `DONE`。
- `due_hint`：例如“投递前”“面试前”。

### `InterviewFeedback`

面试反馈结构：

- `stage`：面试阶段，例如初面、二面、HR 面。
- `feedback_text`：原始反馈。
- `strengths`：正向信号。
- `concerns`：暴露问题。
- `follow_up_tasks`：跟进任务。

## 核心服务

### `backend/app/services/application_crm.py`

这里有两个核心类：

```python
ApplicationStore
ApplicationCRMAgent
```

### `ApplicationStore`

当前是内存存储：

- `save(record)`
- `get(application_id)`
- `list(user_id)`
- `clear()`

为什么现在用内存？

Week8 的重点是打通产品闭环和数据结构。生产化数据库会放到后续 Week10 或之后。

### `ApplicationCRMAgent.create_record(...)`

这个方法把 W2/W4/W5/W7 的产物汇总为一条投递记录。

输入：

- `job_profile`
- `resume_profile`
- `match_profile`
- `rewrite_draft`
- `interview_pack`
- `job_url`
- `notes`
- `source_run_ids`

输出：

```text
ApplicationRecord
```

生成逻辑：

1. 从 JD 中提取公司和岗位。
2. 从 W4 提取 `match_score`。
3. 从 W7 提取 `interview_score`。
4. 从 W5 提取简历标题。
5. 合并关键词。
6. 生成长期记忆。
7. 生成下一步任务。

### 初始长期记忆怎么生成？

`_create_initial_memories(...)` 会从这些地方生成记忆：

#### 简历技能

如果简历有技能：

```text
本次投递的核心技能信号：Python、FastAPI、React...
```

#### 匹配关键词

如果 W4 匹配到了关键词：

```text
目标岗位已匹配关键词：Python、FastAPI...
```

#### 能力缺口

如果 W4 发现缺口：

```text
SQL: 如果真实经历支持，补充 SQL 相关证据...
```

#### 面试准备行动

如果 W7 生成了下一步行动：

```text
复习 SQL：准备基础概念和真实练习...
```

### 下一步任务怎么生成？

`_create_next_tasks(...)` 会生成：

- 投递前确认材料；
- 审批简历改写草稿；
- 补强 W4 P0/P1 缺口；
- 完成 W7 面试准备建议。

这让 W8 不只是“展示历史”，而是能推动用户下一步行动。

### `ApplicationCRMAgent.add_feedback(...)`

当用户输入面试反馈时：

1. 新增 `InterviewFeedback`。
2. 如果状态还没进入面试，会自动切到 `INTERVIEWING`。
3. 把正向信号写入 `strength` memory。
4. 把暴露问题写入 `gap` memory。
5. 把 follow-up 写入 `ApplicationTask`。
6. 去重后保存。

例如用户输入：

```text
项目讲得清楚，但 SQL 细节需要补强。
```

系统会沉淀为：

- 一条反馈记忆；
- 一条 SQL 缺口记忆；
- 一个面试前补强任务。

## API 路由

### `backend/app/api/routes/applications.py`

新增接口：

```http
POST /api/applications
GET /api/applications
GET /api/applications/{application_id}
POST /api/applications/{application_id}/feedback
PATCH /api/applications/{application_id}/status
```

### 创建投递记录

```http
POST /api/applications
```

流程：

1. 创建 `AgentRun`。
2. 设置 state 为 `RUNNING`。
3. 增加 `ApplicationCRMAgent` 的 `application_record` step。
4. 调用 `create_record(...)`。
5. 保存 checkpoint：`application_record`。
6. 设置 run state 为 `COMPLETED`。

### 添加面试反馈

```http
POST /api/applications/{application_id}/feedback
```

流程：

1. 找到投递记录。
2. 创建新 `AgentRun`。
3. 增加 `interview_feedback` step。
4. 把反馈转成 memory 和 task。
5. 保存 checkpoint：`application_feedback`。
6. 设置 run state 为 `COMPLETED`。

### 更新状态

```http
PATCH /api/applications/{application_id}/status
```

流程：

1. 找到投递记录。
2. 创建新 `AgentRun`。
3. 增加 `application_status` step。
4. 更新状态和备注。
5. 保存 checkpoint：`application_status`。

## 前端新增内容

### `frontend/src/types.ts`

新增：

- `ApplicationStatus`
- `ApplicationMemory`
- `ApplicationTask`
- `InterviewFeedback`
- `ApplicationRecord`
- `ApplicationResponse`

### `frontend/src/api/client.ts`

新增：

```ts
listApplications()
createApplicationRecord(...)
addApplicationFeedback(...)
updateApplicationStatus(...)
```

### `frontend/src/App.tsx`

新增状态：

```ts
applicationResult
applications
applicationNotes
applicationStatusDraft
feedbackStage
feedbackText
feedbackStrengths
feedbackConcerns
feedbackTasks
```

新增操作：

- `handleCreateApplicationRecord()`
- `handleAddApplicationFeedback()`
- `handleUpdateApplicationStatus()`

主流程新增第六步：

```text
投递管理
```

W8 面板展示：

- 当前投递状态；
- 匹配分；
- 面试准备分；
- 长期记忆数量；
- 打开任务数量；
- 关键词；
- 长期记忆列表；
- 下一步任务；
- 最近投递记录。

开发者视图新增 Week8 面板，方便查看 ApplicationCRMAgent 与 run trace。

## W8 与项目主题的关系

没有 W8，CareerPilot 只是一个“单次材料生成工具”。

有了 W8，它开始像一个真正的求职 Agent：

```text
它知道你投过什么岗位；
知道每次投递有什么缺口；
知道面试反馈暴露了什么问题；
知道下一步该补什么。
```

这就是 Memory + CRM 的意义。

简历里可以这样描述 W8：

```text
实现 ApplicationCRMAgent 与本地 Application CRM，支持将岗位、匹配报告、改写草稿、面试准备包和面试反馈沉淀为投递记录、长期记忆与下一步任务，并通过 run trace/checkpoint 追踪状态更新和反馈写入过程。
```

## 验证方式

### 后端测试

```bash
backend/.venv/bin/pytest backend/tests/test_application_crm.py
```

预期：

- 能创建投递记录；
- 能生成 memory 和 task；
- 能追加面试反馈；
- 反馈会更新状态为 `INTERVIEWING`；
- trace 中会保存 `application_record` 和 `application_feedback` checkpoint。

### 前端构建

```bash
cd frontend
npm run build
```

预期：

- TypeScript 类型通过；
- W8 面板能编译；
- API client 和后端 schema 对齐。

## 后续可深化方向

W8 当前是本地内存版，后续可以深化：

- 接数据库保存真实长期记录；
- 给任务增加完成/延期/提醒；
- 支持多岗位对比；
- 根据历史反馈自动调整下一份简历优先级；
- 生成每周求职复盘报告；
- 接入日历提醒，但必须保留人工确认。
