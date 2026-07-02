# Week2 代码详解：Resume / JD 结构化解析

## 本周目标

Week2 落地 CareerPilot 的 ResumeParserAgent 和 JobIntelAgent 最小闭环：

- 简历文本结构化解析；
- JD 文本结构化解析；
- Pydantic structured output；
- JSON repair；
- schema validation；
- 每次解析写入 run trace。

真实 LLM API key 不是本阶段阻塞项。当前默认 `LLM_DRY_RUN=true`，解析服务使用保守启发式 parser，后续配置 DeepSeek/OpenAI key 后可切换到 LLM structured output。

## 核心文件

```text
backend/app/schemas/parser.py
backend/app/services/json_repair.py
backend/app/services/structured_parser.py
backend/app/api/routes/parsers.py
backend/tests/test_parser.py
```

## 设计说明

`parser.py` 定义简历和 JD 的结构化输出。

ResumeProfile 包含：

- education；
- skills；
- projects；
- experiences；
- keywords；
- evidence；
- inferred_fields；
- needs_confirmation。

JobProfile 包含：

- company；
- title；
- hard_requirements；
- nice_to_have；
- responsibilities；
- tech_keywords；
- hidden_keywords；
- company_context；
- evidence；
- inferred_fields；
- needs_confirmation。

这样可以满足 Agent.md 的底线：事实字段、推断字段、待确认字段必须分开，不能把猜测当成事实。

## JSON Repair

`json_repair.py` 处理 LLM 常见输出问题：

- Markdown fenced JSON；
- JSON 前后解释文字；
- 尾逗号；
- Python dict 风格单引号。

repair 后仍然必须经过 Pydantic validation。repair 只能修格式，不能绕过 schema。

## Parser Service

`StructuredParserService` 提供：

```text
parse_resume(text)
parse_job(text)
```

如果配置了真实 LLM key：

```text
LLM structured output
→ JSON repair
→ Pydantic validation
→ profile
```

如果 LLM 输出无法通过 repair/validation：

```text
fallback heuristic parser
→ metadata.issues 记录失败原因
```

如果是默认 dry-run：

```text
heuristic parser
→ 本地可演示
→ 不产生真实模型费用
```

## API

### Parse Resume

```bash
curl -X POST http://localhost:8000/api/parsers/resume \
  -H "Content-Type: application/json" \
  -d '{
    "user_id": "local-user",
    "source_name": "resume.md",
    "text": "Education: Example University\nSkills: Python, FastAPI, React\nProject: CareerPilot..."
  }'
```

### Parse Job

```bash
curl -X POST http://localhost:8000/api/parsers/job \
  -H "Content-Type: application/json" \
  -d '{
    "user_id": "local-user",
    "text": "Company: Example AI\nTitle: AI Agent Backend Intern\nRequired: Python, FastAPI, SQL"
  }'
```

两个接口都会创建 run trace：

- `parse_resume` 使用 `ResumeParserAgent`；
- `parse_job` 使用 `JobIntelAgent`；
- run 最终进入 `COMPLETED`；
- step output_summary 记录解析摘要。

## 验证流程

```bash
cd backend
.venv/bin/python -m pytest
```

当前覆盖：

- JSON repair 能处理 fenced JSON 和尾逗号；
- resume parser 返回 skills/profile/run trace；
- job parser 返回 requirements/profile/run trace；
- Week1 run store 测试仍通过。

## 面试讲法

我没有直接把 LLM 输出传给业务层，而是设计了三层保护：

1. Prompt 要求 structured output；
2. JSON repair 只修复格式问题；
3. Pydantic schema validation 决定结果能否进入系统。

如果 LLM 输出不可信，系统会回退到保守 heuristic parser，并把问题记录到 metadata.issues。这样既能支持真实模型，也能保证本地 dry-run 演示稳定。

同时，parser endpoint 不只是返回 JSON，它还会写入 run trace。也就是说 ResumeParserAgent / JobIntelAgent 的每次执行都有 run、step、event，符合生产级 Agent workflow 的可观测性要求。

## 常见追问

Q：为什么不用正则直接解析所有内容？

A：正则只适合保底和 dry-run。真实场景简历/JD 格式不稳定，所以主路径应该是 LLM structured output，再用 schema validation 控制质量。

Q：JSON repair 会不会掩盖模型错误？

A：不会。repair 只处理格式问题，例如 code fence 和尾逗号。字段是否符合业务结构仍由 Pydantic validation 决定。

Q：为什么现在 dry-run 不调用 LLM？

A：为了本地开发和演示零成本、可重复。等 API key 配好后，服务会自动走真实 LLM structured output。

Q：如何防止 parser 编造内容？

A：schema 中保留 evidence、inferred_fields、needs_confirmation；Agent 规则要求事实、推断、待确认分离。当前 heuristic parser 也只抽文本中明确出现的内容。
