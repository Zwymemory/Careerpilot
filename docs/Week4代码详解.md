# Week4 代码详解：MatchAgent

Week4 的目标是把 Week2 得到的 `ResumeProfile` 和 `JobProfile` 放到同一个可解释匹配器里，输出四类结果：

- 岗位匹配评分
- evidence mapping，也就是每条岗位要求由哪些简历证据支撑
- gap analysis，也就是缺口和缺口严重程度
- priority ranking，也就是下一步改简历时应该先处理什么

这周没有让 LLM 直接给匹配分。当前实现选择了 deterministic heuristic，也就是可复现的规则评分。原因是 CareerPilot 的核心规则是 evidence-locked：分数必须能追踪到具体字段，不能只得到一句“模型认为你 80 分”。

## 后端新增文件

### `backend/app/schemas/matching.py`

这里定义 W4 的输入和输出结构。

`MatchRequest` 是接口输入：

- `resume_profile`: Week2 简历解析后的结构化对象。
- `job_profile`: Week2 JD 解析后的结构化对象。
- `user_id`: 当前用户，默认是 `local-user`。

`MatchResponse` 是接口输出：

- `run_id`: 这次匹配对应的可追踪运行 ID。
- `match`: 真正的匹配结果。

`MatchProfile` 是 `match` 的主体：

- `overall_score`: 总分，0 到 100。
- `score_breakdown`: 分项分数。
- `evidence_mapping`: 岗位要求和简历证据之间的映射。
- `gaps`: 缺口列表。
- `priority_ranking`: 后续修改优先级。
- `matched_keywords`: JD 关键词中已经被简历覆盖的词。
- `missing_keywords`: JD 关键词中没有被简历覆盖的词。
- `summary`: 一句话总结。

`score_breakdown` 目前包含四项：

- `hard_requirements`: 硬性要求覆盖程度，权重最高。
- `nice_to_have`: 加分项覆盖程度。
- `responsibilities`: 职责匹配程度。
- `keyword_alignment`: 技术关键词和隐藏关键词覆盖程度。

总分计算公式：

```text
overall =
  hard_requirements * 0.45
  + nice_to_have * 0.20
  + responsibilities * 0.20
  + keyword_alignment * 0.15
```

### `backend/app/services/matching_agent.py`

这是 W4 的核心逻辑。

第一步：把简历转成 `ResumeSignal`。

`ResumeSignal` 可以理解成“简历里可被匹配的一条证据”。例如：

- `skills` 里的 `Python`
- `projects.description` 里的项目描述
- `experiences.description` 里的实习经历
- `education.major` 里的专业

每条 `ResumeSignal` 都包含：

- `field_path`: 来自简历哪个字段。
- `text`: 原始文本。
- `tokens`: 用于匹配的关键词集合。
- `evidence`: 能展示给用户的证据对象。

第二步：把 JD 要求也拆成 token。

例如：

```text
Required: Python, FastAPI, SQL
```

会得到：

```text
python, fastapi, sql
```

`Required` 这类标签词会被过滤掉，因为它不是能力要求本身。

第三步：计算每条要求的覆盖率。

如果简历包含 `Python` 和 `FastAPI`，但没有 `SQL`，那么这条硬性要求大约覆盖了 `2/3`。同时系统会记录：

- 已匹配到哪些简历项
- 缺少哪些 term
- 对应 evidence 是什么

第四步：生成 gap。

硬性要求低于 72% 会进入 `gaps`：

- 低于 45% 是 `high`
- 45% 到 72% 是 `medium`

加分项和职责低于 50% 会进入低优先级 gap。

第五步：生成 priority ranking。

优先级含义：

- `P0`: 必须优先处理，通常是硬性要求缺失。
- `P1`: 重要但不一定阻塞，例如技术关键词缺失。
- `P2`: 可以锦上添花，例如加分项或支持性职责。

注意：这里的建议仍然遵守安全规则，只建议“如果真实经历支持，就补充证据”，不会建议编造经历。

### `backend/app/api/routes/matches.py`

这个文件提供接口：

```http
POST /api/matches
```

接口流程：

1. 创建一个 `AgentRun`。
2. 设置 run state 为 `RUNNING`。
3. 增加一个 `MatchAgent` step。
4. 调用 `MatchingAgent().match(...)`。
5. 完成 step。
6. 把匹配结果保存为 checkpoint：`match_profile`。
7. 设置 run state 为 `COMPLETED`。
8. 返回 `run_id` 和 `match`。

这意味着 W4 不是普通函数调用，而是一次可以在前端 Trace 中看到的 Agent 运行。

## 前端新增内容

### `frontend/src/types.ts`

新增了匹配结果的 TypeScript 类型：

- `MatchEvidence`
- `MatchGap`
- `MatchPriority`
- `MatchScoreBreakdown`
- `MatchProfile`
- `MatchResponse`

这些类型和后端 Pydantic schema 对齐，避免前端把字段拼错。

### `frontend/src/api/client.ts`

新增：

```ts
createMatch({
  resume_profile,
  job_profile
})
```

它会请求：

```http
POST /api/matches
```

### `frontend/src/App.tsx`

新增 `matchResult` 状态和 `handleRunMatch()`。

交互顺序是：

1. 用户先点 `Parse resume`。
2. 用户再点 `Parse JD`。
3. 两个 profile 都有以后，`Run match` 按钮可用。
4. 点击后调用后端 MatchAgent。
5. 下方 Active Trace 切到这次 `match` run。
6. W4 面板展示匹配分数、关键词、top gaps 和 priorities。

## API 返回 JSON 怎么看

示例结构：

```json
{
  "run_id": "run_xxx",
  "match": {
    "overall_score": 65.33,
    "score_breakdown": {
      "hard_requirements": 66.67,
      "nice_to_have": 50,
      "responsibilities": 40,
      "keyword_alignment": 50
    },
    "evidence_mapping": [],
    "gaps": [],
    "priority_ranking": [],
    "matched_keywords": ["Python", "FastAPI", "React"],
    "missing_keywords": ["SQL", "TypeScript", "communication"],
    "summary": "Promising match..."
  }
}
```

字段含义：

- `run_id`: 这次匹配运行的唯一 ID。可以用它去 Run Trace 里看 step、event、checkpoint。
- `overall_score`: 总体匹配度，不是录取概率，只是简历证据对 JD 的覆盖度。
- `score_breakdown.hard_requirements`: 硬性要求覆盖分。
- `score_breakdown.nice_to_have`: 加分项覆盖分。
- `score_breakdown.responsibilities`: 岗位职责覆盖分。
- `score_breakdown.keyword_alignment`: JD 关键词覆盖分。
- `evidence_mapping`: 每条 JD 要求对应了哪些简历证据。
- `gaps`: 当前简历没有充分覆盖的点。
- `priority_ranking`: 后续修改简历时的处理顺序。
- `matched_keywords`: 已覆盖关键词。
- `missing_keywords`: 未覆盖关键词。
- `summary`: 一句话解释这次匹配。

## 验证方式

后端测试：

```bash
cd backend
pytest
```

前端构建：

```bash
cd frontend
npm run build
```

页面验证：

1. 打开前端。
2. 点击 `Parse resume`。
3. 点击 `Parse JD`。
4. 点击 W4 区域的 `Run match`。
5. 预期看到：
   - 分数圆形核心出现具体分数。
   - 分项分数出现。
   - `SQL`、`TypeScript` 等缺失关键词被标为 missing。
   - Active Trace 出现 `MatchAgent` 的 `match` step。

## 下一步：Week5

Week5 会进入 `ResumeRewriteAgent + Approval`。它会使用 W4 的 `gaps` 和 `priority_ranking` 来生成简历改写建议，但仍然需要人工审批，不能自动把内容写成最终版本。
