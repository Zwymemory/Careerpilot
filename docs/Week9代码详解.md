# Week9 代码详解：Eval Harness + QualityGate

Week9 的目标不是继续生成新的求职材料，而是回答一个更工程化的问题：

```text
CareerPilot 生成的内容到底能不能信？
```

前面几周已经完成：

```text
W2 简历/JD 结构化解析
W3 LoopEngine
W4 匹配评分与缺口分析
W5 简历改写与审批
W6 岗位收集
W7 面试准备
W8 投递 CRM 与长期记忆
```

但如果没有评测体系，项目只能证明“能生成”，不能证明“生成得可靠”。

所以 Week9 新增：

- Eval Harness；
- rule-based grader；
- LLM-as-judge dry-run 接口；
- QualityGate；
- HTML report；
- run trace checkpoint。

## W9 的产品意义

CareerPilot 的底线是：

```text
帮用户把真实能力表达清楚，而不是制造虚假竞争力。
```

Eval Harness 的作用就是把这条底线落成代码。

它会检查：

- 简历解析有没有结构化出技能、项目和证据；
- JD 解析有没有提取公司、岗位、要求和关键词；
- 匹配报告有没有 evidence mapping；
- 高风险缺口有没有进入优先级；
- 简历改写有没有无证据新增内容；
- 面试准备有没有项目追问、STAR 草稿和真实性提醒；
- 投递 CRM 有没有记忆、任务和来源 run；
- 用户指定关键词有没有被覆盖；
- QualityGate 是否应该通过、警告或阻断。

## W9 不做什么？

W9 不会替代人工判断。

它只做：

```text
发现风险
量化质量
阻断明显不可信内容
生成可审阅报告
```

不做：

```text
自动批准简历
自动投递岗位
自动伪造经历
自动忽略高风险内容
```

## 后端新增文件

### `backend/app/schemas/eval.py`

这个文件定义评测体系的数据结构。

### `EvalRunRequest`

前端调用 `/api/evals` 时提交这个 request。

核心字段：

- `case_name`：评测 case 名称。
- `judge_mode`：评测模式。
- `min_score`：最低通过分。
- `expected_keywords`：用户期望覆盖的关键词。
- `required_sections`：用户期望改写稿覆盖的章节。
- `resume_profile`：W2 简历解析结果。
- `job_profile`：W2/W6 JD 解析结果。
- `match_profile`：W4 匹配报告。
- `rewrite_draft`：W5 改写草稿。
- `interview_pack`：W7 面试准备包。
- `application_record`：W8 投递 CRM 记录。

也就是说，W9 可以评估完整链路，也可以评估局部产物。

### `EvalRuleResult`

每条规则的评测结果。

字段包括：

- `rule_id`：规则 ID。
- `category`：规则所属模块。
- `name`：规则名称。
- `status`：`passed`、`warning`、`failed`。
- `severity`：`info`、`warning`、`critical`。
- `score`：规则分数。
- `message`：人类可读说明。
- `evidence`：触发规则的证据或风险片段。

### `QualityGateResult`

QualityGate 是最终门禁结果。

它包含：

- `decision`：`PASS`、`WARN`、`BLOCK`。
- `passed`：是否允许继续。
- `score`：整体分。
- `blocking_reasons`：阻断原因。
- `warnings`：警告项。
- `release_notes`：放行说明。

### `EvalReport`

一次完整评测报告。

包含：

- `report_id`；
- `case_name`；
- `judge_mode`；
- `evaluated_artifacts`；
- `overall_score`；
- `gate`；
- `rule_results`；
- `summary`；
- `html_report`；
- `created_at`。

## 核心服务

### `backend/app/services/eval_harness.py`

这里有两个核心类：

```python
EvalReportStore
EvalHarness
```

### `EvalReportStore`

当前使用内存存储：

- `save(report)`
- `get(report_id)`
- `list(user_id)`
- `clear()`

生产化时可以迁移到数据库表。

### `EvalHarness.evaluate(...)`

这是 W9 的核心入口。

它的流程是：

```text
读取 EvalRunRequest
→ 判断输入了哪些 W2-W8 产物
→ 对每类产物执行规则评测
→ 计算整体分
→ 运行 QualityGate
→ 渲染 HTML 报告
→ 保存 EvalReport
```

## 规则评测怎么做？

### 1. 简历解析规则

`_grade_resume(...)` 检查：

- 是否解析出技能；
- 是否解析出项目；
- 是否存在证据链；
- 是否有待确认字段。

例如：

```text
parser.resume.skills
parser.resume.projects
parser.resume.evidence
parser.resume.confirmation
```

如果简历没有技能，会被视为 critical failure。

### 2. JD 解析规则

`_grade_job(...)` 检查：

- 是否识别公司或岗位名；
- 是否解析硬性要求和职责；
- 是否解析技术关键词。

这对应 W2/W6 的质量。

如果 JD 没有要求，后续匹配和改写都会失真。

### 3. 匹配报告规则

`_grade_match(...)` 检查：

- 匹配分是否存在；
- 是否有 evidence mapping；
- 高风险缺口是否进入 P0 优先级。

其中最重要的是：

```text
match.evidence.mapping
```

如果没有 evidence mapping，说明匹配分缺少可解释性。

### 4. 简历改写规则

`_grade_rewrite(...)` 是 W9 最关键的一组规则。

它检查：

```text
每条正式改写是否都有证据
是否存在高风险改写
是否过度堆砌关键词
是否有可审阅 Markdown
```

核心规则：

```text
rewrite.evidence.lock
```

逻辑：

```python
unsupported = [
    change
    for change in draft.changes
    if change.section != "evidence_needed" and not change.evidence
]
```

也就是说：

- `summary`、`skills`、`project`、`experience` 改写必须有证据；
- 没有证据的内容只能进入 `evidence_needed`；
- 如果无证据内容被写进正式改写，会触发 critical failure；
- QualityGate 会 `BLOCK`。

这直接对应项目底线：

```text
不能新增无证据经历。
```

### 5. 面试准备规则

`_grade_interview(...)` 检查：

- 预测题数量；
- 项目追问；
- STAR 草稿；
- evidence warnings。

面试准备不是背答案，而是训练用户讲清楚真实项目。

所以 W9 会保留真实性提醒。

### 6. 投递 CRM 规则

`_grade_application(...)` 检查：

- 是否有公司或岗位；
- 是否有长期记忆；
- 是否有下一步任务；
- 是否关联 source run。

这样 W8 不是一个孤立的记录面板，而是能被评测、复盘和追踪的求职 CRM。

### 7. 用户期望关键词

`_grade_expected_keywords(...)` 检查用户指定的关键词是否出现在各类产物中。

例如用户关心：

```text
Python
FastAPI
Function Calling
AI Agent
```

W9 会检查这些关键词是否被覆盖。

### 8. 必需章节

`_grade_required_sections(...)` 检查改写稿是否覆盖指定章节。

当前前端默认检查：

```text
summary
skills
project
```

## LLM-as-judge 当前怎么做？

当前实现的是：

```text
llm_as_judge_dry_run
```

它不会真正调用大模型。

原因：

1. 评测必须可重复；
2. 测试不能依赖外部模型；
3. 当前阶段先把接口和报告结构打通；
4. 后续可以把真实 judge 模型接进同一个 schema。

对应方法：

```python
_dry_run_judge(...)
```

它会基于已有规则结果做一个 deterministic judge summary：

- 有 critical failure：失败；
- 警告过多：warning；
- 否则：passed。

后续接真实 LLM-as-judge 时，只需要新增：

```text
judge prompt
structured output schema
成本记录
judge result rule
```

## QualityGate 怎么判定？

核心逻辑在 `_quality_gate(...)`。

规则：

```text
如果存在 critical failed：
  BLOCK
如果 overall_score < min_score - 10：
  BLOCK
如果存在 warning 或 overall_score < min_score：
  WARN
否则：
  PASS
```

因此：

- `PASS`：质量稳定，可进入人工审批或导出；
- `WARN`：可以继续，但建议先处理警告；
- `BLOCK`：不能作为正式投递材料。

## HTML Report

`render_eval_html(report)` 会生成一个完整 HTML 报告。

内容包括：

- case 名称；
- overall score；
- QualityGate decision；
- 阻断原因；
- 警告项；
- 规则明细表。

对应接口：

```text
GET /api/evals/{report_id}/report.html
```

前端会提供“打开 HTML 报告”的入口。

## API 路由

新增文件：

```text
backend/app/api/routes/evals.py
```

### 创建评测

```text
POST /api/evals
```

流程：

```text
create run
→ set RUNNING / eval_harness
→ add EvalHarnessAgent step
→ eval_harness.evaluate(payload)
→ complete step
→ save eval_report checkpoint
→ set COMPLETED
```

返回：

```text
EvalRunResponse
```

### 查看报告列表

```text
GET /api/evals?user_id=local-user
```

返回简版报告列表。

### 查看单个报告

```text
GET /api/evals/{report_id}
```

### 导出 HTML 报告

```text
GET /api/evals/{report_id}/report.html
```

## 前端新增内容

### 类型

`frontend/src/types.ts` 新增：

- `EvalArtifactType`
- `EvalRuleResult`
- `QualityGateResult`
- `EvalReport`
- `EvalReportSummary`
- `EvalRunResponse`

### API

`frontend/src/api/client.ts` 新增：

- `listEvalReports(...)`
- `createEvalReport(...)`
- `evalReportHtmlUrl(...)`

### 主界面

`frontend/src/App.tsx` 新增第六步：

```text
质量评测与 QualityGate
```

用户可以设置：

- 评测名称；
- 最低通过分；
- 期望关键词。

点击：

```text
运行质量评测
```

前端会把当前已有的 W2-W8 产物打包提交。

### `EvalSummary`

新增展示组件：

- overall score；
- QualityGate 决策；
- 已评估产物；
- passed / warning / failed 数量；
- 关键规则结果；
- release notes；
- 最近评测历史。

### 开发者视图

新增：

```text
Week9 EvalHarnessAgent
```

用于查看 W9 的 run trace 和 checkpoint。

## 测试

新增：

```text
backend/tests/test_eval_harness.py
```

覆盖两个关键场景。

### 正常评测

`test_eval_harness_endpoint_generates_quality_report`

验证：

- `/api/evals` 返回 201；
- overall score 达到阈值；
- QualityGate 不阻断；
- 生成 HTML report；
- run state 为 `COMPLETED`；
- step agent 是 `EvalHarnessAgent`；
- checkpoint 名为 `eval_report`；
- HTML 导出接口可访问。

### 风险改写阻断

`test_quality_gate_blocks_unsupported_rewrite`

构造一个无证据改写：

```text
主导百万级 AI Agent 平台并显著提升线上转化率。
```

但不给任何 evidence。

预期：

```text
QualityGate = BLOCK
passed = false
命中 rewrite.evidence.lock
```

这证明 W9 能守住“不能编造经历”的底线。

## W9 和项目主题的关系

W9 让 CareerPilot 更像一个真正的 AI Agent 工程项目。

因为一个成熟 Agent 不能只会：

```text
生成答案
```

还必须能：

```text
评估答案
解释答案
阻断风险答案
生成可复盘报告
留下运行轨迹
```

这就是 Eval Harness 的价值。

## 可以写进简历的表达

```text
设计并实现 CareerPilot Eval Harness，支持对简历解析、JD 解析、岗位匹配、证据锁定改写、面试准备和投递 CRM 进行规则化评测；构建 QualityGate 机制阻断无证据改写和高风险内容，生成 HTML 质量报告，并将评测过程写入 run trace/checkpoint，提升 Agent 输出的可解释性、可复盘性和投递安全性。
```

更技术化版本：

```text
实现 AI Agent 评测链路：定义 EvalCase / EvalRuleResult / QualityGate schema，构建 rule-based grader 与 LLM-as-judge dry-run 接口，对 parser、matching、rewrite、interview、CRM 多阶段产物进行质量评分、风险阻断和 HTML report 导出；评测过程接入 FastAPI run trace 与 checkpoint，支持端到端可观测。
```

## 后续可深化方向

W9 当前已经完成基础闭环。

可以继续深化：

- 引入真实 LLM-as-judge；
- 将 eval case 保存为 JSONL；
- 增加 golden dataset；
- 对不同 prompt 版本做 regression test；
- 增加 Precision / Recall / NDCG 等检索类指标；
- 给每次简历导出绑定一份 QualityGate 报告；
- 把 BLOCK 状态真正接到 PDF 导出前置门禁。

