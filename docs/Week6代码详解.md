# Week6 代码详解：Browser Tool + JobCollectorAgent

Week6 的目标是让 CareerPilot 不只依赖用户手动粘贴 JD，而是可以把公开岗位页面或岗位文本收集成可追踪证据。

这一周的核心不是“浏览器自动化越强越好”，而是建立安全边界：

- 只处理用户提供的公开岗位链接、HTML 或文本。
- 不绕过登录、验证码、付费墙或反爬限制。
- 把正文、HTML、截图状态和安全判断保存成 evidence。
- 收集到的 JD 会继续进入 Week2 Parser，供 W4/W5/W7 使用。

## 为什么 W6 要做 Job Collector？

前几周的流程是：

```text
用户粘贴简历
用户粘贴 JD
→ Parser
→ Match
→ Rewrite
```

这可以跑通核心 Agent，但真实求职时，用户往往拿到的是一个招聘页面链接，而不是结构良好的 JD 文本。

W6 的作用是把“岗位来源”也纳入证据链：

```text
公开岗位链接 / 粘贴 JD / HTML
→ 安全检查
→ 正文抽取
→ hash 留证
→ 可选截图留证
→ JD 结构化解析
```

这样后续简历改写或面试准备时，如果问“这个岗位要求从哪里来的”，系统可以追溯到原始岗位快照。

## 后端新增文件

### `backend/app/schemas/job_collector.py`

这个文件定义岗位收集的输入、输出和安全报告。

`JobCollectRequest` 是接口输入：

- `source_url` / `url`：公开岗位链接。
- `html`：用户粘贴的 HTML 片段。
- `text`：用户粘贴的岗位正文。
- `source_name`：来源名称，方便前端展示。
- `capture_screenshot`：是否尝试截图。
- `user_id`：当前用户。

`BrowserSafetyReport` 表示安全边界检查结果：

- `allowed`：是否允许收集。
- `rules`：命中的安全规则。
- `warnings`：风险提示。
- `blocked_reason`：如果被阻断，说明原因。

`JobSnapshot` 是 W6 的核心产物：

- `source_type`：来源类型，支持 `url`、`html`、`text`。
- `source_url`：公开链接。
- `source_name`：来源名称。
- `title`：尽可能提取的岗位标题。
- `text`：抽取后的正文。
- `text_hash`：正文 hash，用来证明后续解析来自这段文本。
- `html_hash`：HTML hash，如果来源是 HTML 或 URL 页面。
- `screenshot_path`：截图路径。
- `screenshot_hash`：截图 hash。
- `screenshot_status`：截图状态，可能是 `captured`、`skipped`、`unavailable`。
- `captured_at`：收集时间。
- `safety`：安全检查报告。

`JobCollectResponse` 会把 `snapshot`、Week2 解析出来的 `profile` 和 parser `metadata` 一起返回。

## 核心服务

### `backend/app/services/job_collector.py`

这里实现岗位收集逻辑。

#### 1. 输入来源分流

W6 支持三种输入：

```text
URL  → 尝试访问公开页面并抽取正文
HTML → 从 HTML 片段抽取可读文本
Text → 直接作为岗位正文
```

前端如果填写了岗位链接，会优先走 URL；否则会把粘贴的 JD 当作 text。

#### 2. 安全检查

JobCollector 会对 URL 做基本安全判断：

- 必须是 `http` 或 `https`。
- 不处理本地文件路径。
- 不处理明显的登录、验证码、后台管理页面。
- 不携带用户浏览器登录态。

这和普通爬虫不同：CareerPilot 的目标是帮用户管理求职证据，不是绕过网站限制。

#### 3. 正文抽取

对于 HTML 或 URL 页面，服务会把脚本、样式等噪声移除，只保留可读文本。

抽取后的正文会进入：

```text
StructuredParser.parse_job(...)
```

所以 W6 不是替代 Week2，而是给 Week2 提供更可靠的岗位文本来源。

#### 4. Hash 留证

W6 会计算：

- `text_hash`
- `html_hash`
- `screenshot_hash`

这些 hash 的意义是：

```text
后续所有匹配、改写、面试准备，都可以追溯到当时看到的岗位快照。
```

如果将来接数据库或对象存储，hash 可以用来做去重、版本管理和证据锁定。

#### 5. 截图留证

如果请求里 `capture_screenshot = true`，服务会尝试截图。

当前实现遵循保守策略：

- 如果环境不可用，不让流程失败。
- 截图失败会变成 `screenshot_status = unavailable`。
- 文本证据仍然可以继续进入解析流程。

## API 路由

### `backend/app/api/routes/job_collector.py`

接口：

```http
POST /api/job-collector
```

流程：

1. 创建 `AgentRun`。
2. 设置 state 为 `RUNNING`。
3. 增加 `JobCollectorAgent` 的 `job_collect` step。
4. 调用 JobCollector 生成 `JobSnapshot`。
5. 完成 `job_collect` step。
6. 保存 checkpoint：`job_snapshot`。
7. 增加 `ParserAgent` 的 `parse_collected_job` step。
8. 把收集到的正文交给 Week2 JD parser。
9. 保存 checkpoint：`collected_job_profile`。
10. 设置 run state 为 `COMPLETED`。

这意味着 W6 的产物不是一个孤立页面，而是一次完整可追踪 Agent run。

## 前端新增内容

### `frontend/src/types.ts`

新增：

- `BrowserSafetyReport`
- `JobSnapshot`
- `JobCollectResponse`

这些类型让前端能展示：

- 来源类型
- 正文 hash
- HTML hash
- 截图状态
- 安全规则
- 抽取文本预览

### `frontend/src/api/client.ts`

新增：

```ts
collectJob({
  url,
  html,
  text,
  source_name,
  capture_screenshot
})
```

对应请求：

```http
POST /api/job-collector
```

### `frontend/src/App.tsx`

新增状态：

```ts
jobUrl
jobCollectResult
```

新增操作：

- `handleCollectJob()`
- `handleAnalyzeIntake()` 中集成岗位链接收集

用户流程中，“准备投递材料”面板支持两种方式：

1. 粘贴 JD 文本；
2. 输入公开岗位链接并点击“收集岗位”。

如果收集成功，前端会：

- 更新 JD 文本框为抽取后的正文；
- 写入 `jobResult`；
- 清空旧的 `matchResult`、`rewriteResult`、`interviewResult`；
- 切换 Active Trace 到本次 W6 run。

## 前端展示内容怎么读

W6 的“岗位收集证据”卡片主要有四类信息。

### 来源

说明这次岗位来自：

- 公开链接；
- HTML 片段；
- 粘贴文本。

### 正文 Hash

`text_hash` 是岗位正文的指纹。

它不是给普通用户看的主要内容，而是证明：

```text
后续匹配和改写确实基于这份 JD。
```

### 截图状态

常见状态：

- `已截图`：截图保存成功。
- `未请求`：用户没有要求截图。
- `不可用`：当前环境没有成功截图，但文本收集仍然完成。

### 安全边界

卡片会展示安全规则或 warnings。

这能让面试官看到项目不是简单“爬页面”，而是有工具边界意识。

## W6 与项目主题的关系

CareerPilot 的主题不是普通简历生成器，而是：

```text
可追踪、可审批、证据锁定的求职 Agent 工作流。
```

W6 让“岗位信息”也成为可追踪证据，而不是用户随口输入的一段文字。

简历里可以这样描述 W6：

```text
实现 JobCollectorAgent，支持公开岗位链接/HTML/文本的安全收集、正文抽取、hash 留证与截图状态记录，并将岗位快照接入结构化 JD Parser，形成可追踪的岗位证据链。
```

## 验证方式

### 后端测试

```bash
cd backend
.venv/bin/pytest backend/tests/test_job_collector.py
```

预期：

- URL/text/html 输入都能生成 snapshot。
- 安全规则能阻断不允许的来源。
- 收集结果能进入 JD parser。

### 全量验证

```bash
backend/.venv/bin/ruff check backend/app backend/tests
backend/.venv/bin/pytest backend/tests
cd frontend && npm run build
```

## 后续可深化方向

W6 当前是 Week 范围内的第一版。

后续可以深化：

- 增加更多招聘网站正文抽取 adapter；
- 把截图和 HTML 存入对象存储；
- 增加 robots / rate limit 提示；
- 增加岗位版本 diff；
- 接入数据库，保存多次收集历史。
