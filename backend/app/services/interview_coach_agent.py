import json

from pydantic import ValidationError

from app.core.config import Settings
from app.schemas.interview import (
    InterviewPack,
    InterviewQuestion,
    KnowledgePoint,
    MockInterviewDimension,
    MockInterviewScore,
    ProjectFollowUp,
    StarAnswerDraft,
)
from app.schemas.llm import ChatMessage, LLMRequest, LLMResponse
from app.schemas.matching import MatchProfile
from app.schemas.parser import EvidenceItem, JobProfile, ResumeProfile, ResumeProject
from app.schemas.rewrite import ResumeRewriteDraft
from app.schemas.web_search import WebSearchRequest
from app.services.json_repair import JSONRepairError, repair_json_object
from app.services.llm_client import LLMClient, LLMClientError
from app.services.run_store import new_id
from app.services.tavily_client import TavilyClient


class InterviewCoachAgent:
    """Week7 evidence-locked interview preparation agent.

    The first pass is deterministic: it predicts realistic project interview questions and
    drafts evidence-locked speaking notes from parsed resume/JD evidence. Missing proof stays
    as a review warning instead of becoming a fabricated story.
    """

    def create_pack(
        self,
        resume: ResumeProfile,
        job: JobProfile,
        match: MatchProfile | None = None,
        rewrite: ResumeRewriteDraft | None = None,
    ) -> InterviewPack:
        keywords = _target_keywords(resume, job, match, rewrite)
        questions = self._questions(resume, job, match, keywords)
        followups = self._project_followups(resume, job, match)
        star_answers = self._star_answers(resume, job)
        knowledge_points = self._knowledge_points(resume, job, match, keywords)
        warnings = self._evidence_warnings(resume, job, match, star_answers)
        score = self._score(resume, job, match, followups, star_answers, knowledge_points)
        pack = InterviewPack(
            pack_id=new_id("interview"),
            company=job.company,
            title=job.title,
            target_keywords=keywords,
            predicted_questions=questions,
            project_followups=followups,
            star_answers=star_answers,
            knowledge_points=knowledge_points,
            mock_score=score,
            evidence_warnings=warnings,
            markdown="",
        )
        pack.markdown = render_interview_pack_markdown(pack)
        return pack

    async def create_pack_with_llm(
        self,
        resume: ResumeProfile,
        job: JobProfile,
        match: MatchProfile | None,
        rewrite: ResumeRewriteDraft | None,
        settings: Settings,
    ) -> tuple[InterviewPack, LLMResponse | None, list[str]]:
        pack = self.create_pack(resume, job, match, rewrite)
        if settings.llm_dry_run or not settings.llm_api_key:
            return pack, None, ["llm_interview_refinement_skipped_dry_run"]

        response: LLMResponse | None = None
        web_references, reference_issues = await _interview_reference_search(
            settings,
            resume,
            job,
            match,
        )
        try:
            response = await LLMClient(settings).chat(
                LLMRequest(
                    messages=[
                        ChatMessage(role="system", content=_interview_system_prompt()),
                        ChatMessage(
                            role="user",
                            content=json.dumps(
                                _interview_prompt_payload(
                                    resume,
                                    job,
                                    match,
                                    rewrite,
                                    pack,
                                    web_references,
                                ),
                                ensure_ascii=False,
                            ),
                        ),
                    ],
                    response_format={"type": "json_object"},
                    temperature=0.25,
                    max_tokens=2800,
                )
            )
            repaired = repair_json_object(response.content)
            pack = _apply_llm_interview_refinement(pack, repaired.data, resume, job, match)
            issues = [
                *reference_issues,
                *[f"llm_interview_refinement:{issue}" for issue in repaired.issues],
            ]
            return pack, response, issues
        except (JSONRepairError, LLMClientError, ValidationError, KeyError, ValueError) as exc:
            pack.evidence_warnings = _unique(
                [
                    *pack.evidence_warnings,
                    f"LLM 面试题增强失败，已回退到本地真实面试模板：{exc}",
                ]
            )[:8]
            pack.markdown = render_interview_pack_markdown(pack)
            return pack, response, ["llm_interview_refinement_fallback"]

    def _questions(
        self,
        resume: ResumeProfile,
        job: JobProfile,
        match: MatchProfile | None,
        keywords: list[str],
    ) -> list[InterviewQuestion]:
        questions: list[InterviewQuestion] = []
        role = job.title or "目标岗位"
        for project in resume.projects[:3]:
            evidence = project.evidence or [
                EvidenceItem(
                    field_path="projects",
                    source_text=project.description,
                    confidence=0.66,
                )
            ]
            questions.extend(
                [
                    InterviewQuestion(
                        question_id=new_id("question"),
                        category="project",
                        question=(
                            f"请结合 {project.name}，讲一次你遇到的核心技术难点："
                            "当时问题是什么，你怎么定位，最后怎么验证？"
                        ),
                        why_asked=f"{role} 面试常会追问真实项目中的问题定位和复盘能力。",
                        suggested_angle=(
                            "按背景、现象、定位路径、解决方案、验证结果讲；不要只罗列技术栈。"
                        ),
                        priority="P0",
                        evidence=evidence[:4],
                    ),
                    InterviewQuestion(
                        question_id=new_id("question"),
                        category="system_design",
                        question=(
                            f"如果让你重新设计 {project.name} 的接口、数据流或 Agent 流程，"
                            "你会改哪一处？为什么？"
                        ),
                        why_asked="这类追问会考察架构取舍、边界意识和迭代能力。",
                        suggested_angle=(
                            "先说明原设计约束，再讲可替代方案、代价、风险和如何验证改动收益。"
                        ),
                        priority="P0",
                        evidence=evidence[:4],
                    ),
                ]
            )

        for requirement in job.hard_requirements[:4]:
            evidence = _evidence_for_text(resume, requirement)
            if not evidence:
                continue
            questions.append(
                InterviewQuestion(
                    question_id=new_id("question"),
                    category="technical",
                    question=(
                        f"请结合一个真实项目，说明你在哪里用过 {requirement}，"
                        "当时解决了什么工程问题？"
                    ),
                    why_asked=(
                        f"{requirement} 是 {role} 的岗位信号，"
                        "面试官会验证使用深度而非关键词熟悉度。"
                    ),
                    suggested_angle=_angle_from_evidence(evidence, requirement),
                    priority="P0",
                    evidence=evidence[:4],
                )
            )

        for responsibility in job.responsibilities[:3]:
            evidence = _evidence_for_text(resume, responsibility)
            questions.append(
                InterviewQuestion(
                    question_id=new_id("question"),
                    category="system_design",
                    question=f"这份 JD 提到“{responsibility}”。你做过哪些相近部分？边界在哪里？",
                    why_asked="职责类问题会考察工程拆解、边界意识和交付路径。",
                    suggested_angle=(
                        "先讲相近项目中的真实模块，再说明未覆盖部分、可迁移经验和补强计划。"
                    ),
                    priority="P1",
                    evidence=evidence[:4],
                )
            )

        if match:
            for gap in match.gaps[:3]:
                questions.append(
                    InterviewQuestion(
                        question_id=new_id("question"),
                        category="gap",
                        question=(
                            f"JD 提到“{gap.requirement}”。你目前有哪些相近基础？"
                            "如果现场被追问，你会如何说明边界和补强计划？"
                        ),
                        why_asked="这是当前匹配报告中的能力缺口，需要准备真实边界和补强计划。",
                        suggested_angle=(
                            "先说明已有相近经验，再明确不会夸大；最后给出正在补齐的学习或实践计划。"
                        ),
                        priority="P0" if gap.severity == "high" else "P1",
                        evidence=[],
                    )
                )

        for keyword in keywords[:3]:
            evidence = _evidence_for_text(resume, keyword)
            if evidence:
                continue
            questions.append(
                InterviewQuestion(
                    question_id=new_id("question"),
                    category="gap",
                    question=(
                        f"如果面试官追问 {keyword}，你能用哪个项目证明？"
                        "如果不能，准备怎么诚实回答？"
                    ),
                    why_asked="关键词出现在 JD 中，但当前简历证据不足。",
                    suggested_angle="不要硬说精通；说明了解范围、可迁移经验和下一步补强计划。",
                    priority="P1",
                    evidence=[],
                )
            )
        return _dedupe_questions(questions)[:10]

    def _project_followups(
        self,
        resume: ResumeProfile,
        job: JobProfile,
        match: MatchProfile | None,
    ) -> list[ProjectFollowUp]:
        role_keywords = _unique([*job.tech_keywords, *job.hidden_keywords])
        missing = set(match.missing_keywords if match else [])
        followups: list[ProjectFollowUp] = []
        for project in resume.projects[:4]:
            evidence = project.evidence or [
                EvidenceItem(
                    field_path="projects",
                    source_text=project.description,
                    confidence=0.66,
                )
            ]
            risk_flags = [
                f"当前项目证据没有稳定覆盖 {keyword}，不要把它讲成已完成经验。"
                for keyword in role_keywords
                if keyword in missing
            ][:3]
            followups.extend(
                [
                    ProjectFollowUp(
                        project_name=project.name,
                        question=(
                            f"{project.name} 的核心架构是什么？哪些模块最能证明你适合这个岗位？"
                        ),
                        probe_focus="架构拆解、职责边界、数据流、失败处理",
                        evidence=evidence[:4],
                        risk_flags=risk_flags,
                    ),
                    ProjectFollowUp(
                        project_name=project.name,
                        question=f"{project.name} 中你最难排查的问题是什么，最后如何验证？",
                        probe_focus="问题定位、可观测性、验证指标、复盘能力",
                        evidence=evidence[:4],
                        risk_flags=risk_flags,
                    ),
                ]
            )
        return followups[:8]

    def _star_answers(
        self,
        resume: ResumeProfile,
        job: JobProfile,
    ) -> list[StarAnswerDraft]:
        answers: list[StarAnswerDraft] = []
        role = job.title or "目标岗位"
        for project in resume.projects[:3]:
            evidence = project.evidence or [
                EvidenceItem(
                    field_path="projects",
                    source_text=project.description,
                    confidence=0.66,
                )
            ]
            answers.append(
                StarAnswerDraft(
                    prompt=f"请讲一个最能支撑 {role} 的项目：{project.name}",
                    situation=f"围绕 {project.name} 项目，背景是：{project.description}",
                    task=(
                        "你的任务是把项目目标、个人职责和岗位相关能力讲清楚，尤其突出可验证产出。"
                    ),
                    action=(
                        "按模块拆解你的行动：需求理解、方案设计、核心实现、测试验证、问题复盘。"
                    ),
                    result=(
                        "结果部分只讲已有证据能支撑的产出；如果缺少量化指标，就说明可展示物、"
                        "代码、运行截图或报告。"
                    ),
                    evidence=evidence[:4],
                    risk_notes=_project_risk_notes(project, job),
                )
            )
        if resume.experiences:
            for experience in resume.experiences[:2]:
                evidence = experience.evidence or [
                    EvidenceItem(
                        field_path="experiences",
                        source_text=experience.description,
                        confidence=0.66,
                    )
                ]
                answers.append(
                    StarAnswerDraft(
                        prompt=f"请讲一下你在 {experience.title} 中的真实贡献。",
                        situation=experience.company or "一段真实经历",
                        task="说明当时目标、限制和你的责任。",
                        action=experience.description,
                        result="只总结已有事实，不补充没有证据的业务结果或指标。",
                        evidence=evidence[:4],
                        risk_notes=[],
                    )
                )
        return answers[:5]

    def _knowledge_points(
        self,
        resume: ResumeProfile,
        job: JobProfile,
        match: MatchProfile | None,
        keywords: list[str],
    ) -> list[KnowledgePoint]:
        missing = set(match.missing_keywords if match else [])
        points: list[KnowledgePoint] = []
        for topic in keywords[:10]:
            evidence = _evidence_for_text(resume, topic)
            signal = "covered" if evidence else "gap" if topic in missing else "partial"
            points.append(
                KnowledgePoint(
                    topic=topic,
                    why_matters=f"{topic} 出现在目标岗位信号中，可能被用于判断岗位匹配度。",
                    current_signal=signal,
                    review_prompt=(
                        f"准备 2 分钟讲法：{topic} 是什么、你在哪里用过、遇到什么问题、如何验证。"
                        if evidence
                        else (
                            f"先补齐 {topic} 的基础概念和一个真实练习，"
                            "不要在面试中声称已深度落地。"
                        )
                    ),
                    evidence=evidence[:3],
                )
            )
        return points

    def _evidence_warnings(
        self,
        resume: ResumeProfile,
        job: JobProfile,
        match: MatchProfile | None,
        star_answers: list[StarAnswerDraft],
    ) -> list[str]:
        warnings: list[str] = []
        if not resume.projects and not resume.experiences:
            warnings.append("当前简历缺少项目或经历证据，项目回答框架只能作为结构模板。")
        if match:
            warnings.extend(
                f"{gap.requirement}: {gap.suggested_action}"
                for gap in match.gaps
                if gap.severity in {"high", "medium"}
            )
        for answer in star_answers:
            warnings.extend(answer.risk_notes)
        if not job.hard_requirements:
            warnings.append("JD 硬性要求不足，面试题预测可能偏泛。")
        return _unique(warnings)[:8]

    def _score(
        self,
        resume: ResumeProfile,
        job: JobProfile,
        match: MatchProfile | None,
        followups: list[ProjectFollowUp],
        star_answers: list[StarAnswerDraft],
        knowledge_points: list[KnowledgePoint],
    ) -> MockInterviewScore:
        evidence_score = min(100, (len(resume.projects) * 22) + (len(resume.experiences) * 18) + 35)
        jd_score = min(100, len(job.hard_requirements) * 12 + len(job.responsibilities) * 8 + 30)
        gap_penalty = len(match.gaps) * 5 if match else 10
        match_score = max(0, (match.overall_score if match else 58) - gap_penalty)
        speaking_score = min(100, len(star_answers) * 18 + len(followups) * 4 + 28)
        knowledge_gap_count = sum(1 for point in knowledge_points if point.current_signal == "gap")
        knowledge_score = max(0, 86 - knowledge_gap_count * 9)
        overall = round(
            evidence_score * 0.28
            + jd_score * 0.18
            + match_score * 0.28
            + speaking_score * 0.16
            + knowledge_score * 0.1,
            2,
        )
        risks = []
        if match and match.gaps:
            risks.append(f"存在 {len(match.gaps)} 个匹配缺口，面试中需要诚实解释边界。")
        if knowledge_gap_count:
            risks.append(f"{knowledge_gap_count} 个技术点证据不足，需要先复习或补真实练习。")
        if not risks:
            risks.append("主要风险较低，但仍需准备项目细节、验证方式和失败复盘。")

        return MockInterviewScore(
            overall_score=overall,
            dimensions=[
                MockInterviewDimension(
                    name="证据可信度",
                    score=evidence_score,
                    feedback="项目/经历证据越具体，回答越不容易变成空泛表述。",
                ),
                MockInterviewDimension(
                    name="岗位贴合度",
                    score=match_score,
                    feedback="基于 W4 匹配分与缺口综合估算。",
                ),
                MockInterviewDimension(
                    name="表达准备度",
                    score=speaking_score,
                    feedback="项目回答框架和项目追问数量越充分，现场表达越稳定。",
                ),
                MockInterviewDimension(
                    name="技术复习度",
                    score=knowledge_score,
                    feedback="证据不足的关键词会降低该项分数。",
                ),
            ],
            strengths=_strengths(resume, job, match),
            risks=risks[:5],
            next_actions=_next_actions(match, knowledge_points),
        )


def render_interview_pack_markdown(pack: InterviewPack) -> str:
    lines = [
        "# CareerPilot 面试准备包",
        "",
        f"目标：{pack.company or '未知公司'} / {pack.title or '未知岗位'}",
        f"模拟准备分：{pack.mock_score.overall_score:.1f}/100",
        "",
        "## 目标关键词",
        "、".join(pack.target_keywords) if pack.target_keywords else "暂无关键词。",
        "",
        "## 面试题预测",
    ]
    for index, item in enumerate(pack.predicted_questions, start=1):
        lines.extend(
            [
                "",
                f"### {index}. [{item.priority}] {item.question}",
                f"- 为什么问：{item.why_asked}",
                f"- 建议角度：{item.suggested_angle}",
            ]
        )
        if item.evidence:
            lines.append("- 证据：")
            lines.extend(f"  - {e.field_path}: {e.source_text}" for e in item.evidence[:3])

    lines.extend(["", "## 项目追问"])
    for item in pack.project_followups:
        lines.extend(
            [
                "",
                f"- {item.project_name}: {item.question}",
                f"  - 追问重点：{item.probe_focus}",
            ]
        )
        lines.extend(f"  - 风险：{flag}" for flag in item.risk_flags)

    lines.extend(["", "## 项目回答框架"])
    for item in pack.star_answers:
        lines.extend(
            [
                "",
                f"### {item.prompt}",
                f"- 背景：{item.situation}",
                f"- 任务：{item.task}",
                f"- 行动：{item.action}",
                f"- 结果：{item.result}",
            ]
        )
        lines.extend(f"- 风险：{note}" for note in item.risk_notes)

    lines.extend(["", "## 技术复习清单"])
    for item in pack.knowledge_points:
        signal = _signal_label(item.current_signal)
        lines.append(f"- {item.topic}（{signal}）：{item.review_prompt}")

    if pack.evidence_warnings:
        lines.extend(["", "## 真实性提醒"])
        lines.extend(f"- {warning}" for warning in pack.evidence_warnings)
    return "\n".join(lines)


def _interview_system_prompt() -> str:
    return (
        "You are CareerPilot InterviewCoachAgent. Return only one JSON object. "
        "Write in Chinese, but keep technical keywords like Python, FastAPI, SQL, "
        "Function Calling, PostgreSQL, RAG, AI Agent in English. Generate realistic "
        "Chinese tech internship interview prep, not keyword checklist questions. "
        "Questions should sound like real interviewers: project difficulty, debugging, "
        "tradeoffs, API/data-flow design, validation, failure handling, team boundary, "
        "and what the candidate would improve. Avoid wording like 'how do you satisfy X'. "
        "If web_reference_results are provided, use them only to improve interview style "
        "and topic realism; never treat them as candidate resume evidence. "
        "Never invent experience, metrics, employers, production scale, or unsupported skills. "
        "If evidence is missing, ask about boundary and learning plan. "
        "Do not use the word STAR in user-facing text; use project answer framework language. "
        "Schema: {predicted_questions:[{category:'technical|project|behavioral|gap|system_design',"
        "question:string,why_asked:string,suggested_angle:string,priority:'P0|P1|P2'}],"
        "project_followups:[{project_name:string,question:string,probe_focus:string,risk_flags:string[]}],"
        "answer_frameworks:[{prompt:string,situation:string,task:string,action:string,result:string,"
        "risk_notes:string[]}],knowledge_points:[{topic:string,why_matters:string,"
        "current_signal:'covered|partial|gap',review_prompt:string}]}."
    )


def _interview_prompt_payload(
    resume: ResumeProfile,
    job: JobProfile,
    match: MatchProfile | None,
    rewrite: ResumeRewriteDraft | None,
    pack: InterviewPack,
    web_references: list[dict] | None = None,
) -> dict:
    return {
        "resume_profile": resume.model_dump(mode="json"),
        "job_profile": job.model_dump(mode="json"),
        "match_profile": match.model_dump(mode="json") if match else None,
        "rewrite_draft": rewrite.model_dump(mode="json") if rewrite else None,
        "web_reference_results": web_references or [],
        "local_pack_seed": {
            "target_keywords": pack.target_keywords,
            "predicted_questions": [
                question.model_dump(mode="json", exclude={"evidence"})
                for question in pack.predicted_questions[:8]
            ],
            "project_followups": [
                followup.model_dump(mode="json", exclude={"evidence"})
                for followup in pack.project_followups[:6]
            ],
            "answer_frameworks": [
                answer.model_dump(mode="json", exclude={"evidence"})
                for answer in pack.star_answers[:4]
            ],
            "knowledge_points": [
                point.model_dump(mode="json", exclude={"evidence"})
                for point in pack.knowledge_points[:8]
            ],
        },
    }


async def _interview_reference_search(
    settings: Settings,
    resume: ResumeProfile,
    job: JobProfile,
    match: MatchProfile | None,
) -> tuple[list[dict], list[str]]:
    if settings.tavily_dry_run or not settings.tavily_api_key:
        return [], ["tavily_reference_skipped_dry_run"]

    query = _interview_reference_query(resume, job, match)
    depth = "advanced" if settings.tavily_search_depth == "advanced" else "basic"
    try:
        response = await TavilyClient(settings).search(
            WebSearchRequest(
                query=query,
                search_depth=depth,
                max_results=max(1, min(settings.tavily_max_results, 5)),
                include_answer=True,
                include_raw_content=False,
            )
        )
    except Exception as exc:  # noqa: BLE001 - optional reference search must degrade.
        return [], [f"tavily_reference_fallback:{exc}"]

    references: list[dict] = []
    if response.answer:
        references.append({"title": "Tavily answer", "content": response.answer[:700]})
    for result in response.results[:5]:
        references.append(
            {
                "title": result.title,
                "url": str(result.url),
                "content": result.content[:700],
                "score": result.score,
            }
        )
    return references[:6], [f"tavily_reference_results:{len(response.results)}"]


def _interview_reference_query(
    resume: ResumeProfile,
    job: JobProfile,
    match: MatchProfile | None,
) -> str:
    role = job.title or "AI Agent 实习"
    company = job.company or ""
    keywords = _unique(
        [
            *job.hard_requirements,
            *job.nice_to_have,
            *job.tech_keywords,
            *(match.missing_keywords if match else []),
            *resume.keywords,
        ]
    )[:8]
    return " ".join(
        [
            company,
            role,
            "中文 技术面试 项目追问 真实面试题",
            *keywords,
        ]
    ).strip()


def _apply_llm_interview_refinement(
    pack: InterviewPack,
    data: dict,
    resume: ResumeProfile,
    job: JobProfile,
    match: MatchProfile | None,
) -> InterviewPack:
    questions = _llm_questions(data.get("predicted_questions"), resume)
    followups = _llm_followups(data.get("project_followups"), resume, job)
    answer_frameworks = _llm_answer_frameworks(
        data.get("answer_frameworks") or data.get("star_answers"),
        resume,
        job,
    )
    knowledge_points = _llm_knowledge_points(data.get("knowledge_points"), resume)

    if questions:
        pack.predicted_questions = _dedupe_questions(questions)[:10]
    if followups:
        pack.project_followups = followups[:8]
    if answer_frameworks:
        pack.star_answers = answer_frameworks[:5]
    if knowledge_points:
        pack.knowledge_points = knowledge_points[:10]

    pack.evidence_warnings = InterviewCoachAgent()._evidence_warnings(
        resume,
        job,
        match,
        pack.star_answers,
    )
    pack.mock_score = InterviewCoachAgent()._score(
        resume,
        job,
        match,
        pack.project_followups,
        pack.star_answers,
        pack.knowledge_points,
    )
    pack.markdown = render_interview_pack_markdown(pack)
    return pack


def _llm_questions(value, resume: ResumeProfile) -> list[InterviewQuestion]:
    if not isinstance(value, list):
        return []
    questions: list[InterviewQuestion] = []
    allowed_categories = {"technical", "project", "behavioral", "gap", "system_design"}
    for item in value:
        if not isinstance(item, dict) or not item.get("question"):
            continue
        question_text = str(item["question"]).strip()
        category = item.get("category") if item.get("category") in allowed_categories else "project"
        priority = item.get("priority") if item.get("priority") in {"P0", "P1", "P2"} else "P1"
        payload = {
            "question_id": new_id("question"),
            "category": category,
            "question": question_text,
            "why_asked": str(
                item.get("why_asked") or "真实面试会通过这个问题验证项目深度和岗位匹配。"
            ),
            "suggested_angle": str(
                item.get("suggested_angle")
                or "结合真实项目讲问题背景、个人行动、验证方式和边界。"
            ),
            "priority": priority,
            "evidence": _evidence_for_text(
                resume,
                " ".join([question_text, str(item.get("suggested_angle") or "")]),
            )[:4],
        }
        questions.append(InterviewQuestion.model_validate(payload))
    return questions


def _llm_followups(value, resume: ResumeProfile, job: JobProfile) -> list[ProjectFollowUp]:
    if not isinstance(value, list):
        return []
    project_names = [project.name for project in resume.projects] or [job.title or "目标岗位"]
    followups: list[ProjectFollowUp] = []
    for index, item in enumerate(value):
        if not isinstance(item, dict) or not item.get("question"):
            continue
        project_name = str(item.get("project_name") or project_names[index % len(project_names)])
        question = str(item["question"]).strip()
        evidence = _project_evidence(resume, project_name) or _evidence_for_text(resume, question)
        followups.append(
            ProjectFollowUp(
                project_name=project_name,
                question=question,
                probe_focus=str(
                    item.get("probe_focus") or "项目背景、技术取舍、问题定位、验证方式"
                ),
                evidence=evidence[:4],
                risk_flags=[
                    str(flag)
                    for flag in item.get("risk_flags", [])
                    if isinstance(flag, str) and flag.strip()
                ][:3],
            )
        )
    return followups


def _llm_answer_frameworks(
    value,
    resume: ResumeProfile,
    job: JobProfile,
) -> list[StarAnswerDraft]:
    if not isinstance(value, list):
        return []
    frameworks: list[StarAnswerDraft] = []
    for item in value:
        if not isinstance(item, dict):
            continue
        prompt = str(item.get("prompt") or f"请讲一个最能支撑 {job.title or '目标岗位'} 的项目。")
        evidence = _evidence_for_text(resume, prompt)
        frameworks.append(
            StarAnswerDraft(
                prompt=prompt.replace("STAR", "项目回答框架"),
                situation=str(item.get("situation") or "说明项目背景、目标用户和当时约束。"),
                task=str(item.get("task") or "说明你的具体职责、要解决的问题和成功标准。"),
                action=str(item.get("action") or "按技术方案、关键实现、调试过程和验证方式展开。"),
                result=str(item.get("result") or "只总结已有证据支持的产出和可展示材料。"),
                evidence=evidence[:4],
                risk_notes=[
                    str(note)
                    for note in item.get("risk_notes", [])
                    if isinstance(note, str) and note.strip()
                ][:4],
            )
        )
    return frameworks


def _llm_knowledge_points(value, resume: ResumeProfile) -> list[KnowledgePoint]:
    if not isinstance(value, list):
        return []
    points: list[KnowledgePoint] = []
    allowed_signals = {"covered", "partial", "gap"}
    for item in value:
        if not isinstance(item, dict) or not item.get("topic"):
            continue
        topic = str(item["topic"]).strip()
        evidence = _evidence_for_text(resume, topic)
        signal = item.get("current_signal")
        if signal not in allowed_signals:
            signal = "covered" if evidence else "partial"
        points.append(
            KnowledgePoint(
                topic=topic,
                why_matters=str(item.get("why_matters") or f"{topic} 是目标岗位的高频追问信号。"),
                current_signal=signal,
                review_prompt=str(
                    item.get("review_prompt")
                    or f"准备讲清 {topic} 在项目中的使用位置、问题和验证方式。"
                ),
                evidence=evidence[:3],
            )
        )
    return points


def _target_keywords(
    resume: ResumeProfile,
    job: JobProfile,
    match: MatchProfile | None,
    rewrite: ResumeRewriteDraft | None,
) -> list[str]:
    values: list[str] = []
    if rewrite:
        values.extend(rewrite.target_keywords)
    if match:
        values.extend(match.matched_keywords)
        values.extend(match.missing_keywords)
        values.extend(priority.item for priority in match.priority_ranking)
    values.extend(job.tech_keywords)
    values.extend(job.hidden_keywords)
    values.extend(resume.skills)
    return _unique(_clean_keyword(value) for value in values if _clean_keyword(value))[:14]


def _evidence_for_text(resume: ResumeProfile, text: str) -> list[EvidenceItem]:
    tokens = _tokens(text)
    evidence: list[EvidenceItem] = []
    for item in resume.evidence:
        if tokens & _tokens(item.source_text):
            evidence.append(item)
    for project in resume.projects:
        project_blob = " ".join([project.name, project.description, *project.skills])
        if tokens & _tokens(project_blob):
            evidence.extend(project.evidence)
    for experience in resume.experiences:
        experience_blob = " ".join(
            [experience.company or "", experience.title, experience.description]
        )
        if tokens & _tokens(experience_blob):
            evidence.extend(experience.evidence)
    return _unique_evidence(evidence)


def _project_evidence(resume: ResumeProfile, project_name: str) -> list[EvidenceItem]:
    for project in resume.projects:
        if project.name.lower() == project_name.lower():
            return project.evidence or [
                EvidenceItem(
                    field_path="projects",
                    source_text=project.description,
                    confidence=0.66,
                )
            ]
    return []


def _angle_from_evidence(evidence: list[EvidenceItem], requirement: str) -> str:
    if evidence:
        return (
            f"先引用真实证据“{evidence[0].source_text[:80]}”，再说明它和 {requirement} 的关系。"
        )
    return "当前证据不足，建议诚实说明已有相近基础，并给出补强计划。"


def _project_risk_notes(project: ResumeProject, job: JobProfile) -> list[str]:
    project_tokens = _tokens(" ".join([project.name, project.description, *project.skills]))
    notes = []
    for keyword in job.tech_keywords[:8]:
        if _tokens(keyword) and not (_tokens(keyword) & project_tokens):
            notes.append(f"{project.name} 当前证据未覆盖 {keyword}，不要主动声称深度使用。")
    return notes[:4]


def _strengths(resume: ResumeProfile, job: JobProfile, match: MatchProfile | None) -> list[str]:
    strengths = []
    if resume.projects:
        strengths.append(f"有 {len(resume.projects)} 个项目可用于项目讲法和技术追问。")
    if match and match.matched_keywords:
        strengths.append(f"已匹配关键词：{'、'.join(match.matched_keywords[:6])}。")
    elif job.tech_keywords:
        strengths.append(f"JD 技术关键词清晰：{'、'.join(job.tech_keywords[:6])}。")
    if resume.skills:
        strengths.append(f"简历中已有技能信号：{'、'.join(resume.skills[:6])}。")
    return strengths[:4] or ["已有结构化材料，可继续补充项目证据。"]


def _next_actions(match: MatchProfile | None, knowledge_points: list[KnowledgePoint]) -> list[str]:
    actions = []
    if match:
        actions.extend(
            f"补强 {priority.item}：{priority.reason}"
            for priority in match.priority_ranking
            if priority.priority in {"P0", "P1"}
        )
    actions.extend(
        f"复习 {point.topic}：{point.review_prompt}"
        for point in knowledge_points
        if point.current_signal == "gap"
    )
    if not actions:
        actions.append("准备 2 分钟项目讲法、1 分钟自我介绍和 3 个反问问题。")
    return _unique(actions)[:6]


def _signal_label(signal: str) -> str:
    labels = {"covered": "已有证据", "partial": "部分相关", "gap": "需要补强"}
    return labels.get(signal, signal)


def _clean_keyword(value: str) -> str:
    return value.replace("硬性关键词缺失：", "").strip(" ：:,.，。")


def _tokens(text: str) -> set[str]:
    import re

    return {
        token.lower()
        for token in re.findall(r"[A-Za-z][A-Za-z0-9+#.\-]*|[\u4e00-\u9fff]{2,}", text)
        if token.strip()
    }


def _unique(items) -> list[str]:
    result = []
    seen = set()
    for item in items:
        if not item:
            continue
        key = item.lower() if isinstance(item, str) else str(item).lower()
        if key in seen:
            continue
        seen.add(key)
        result.append(item)
    return result


def _unique_evidence(items: list[EvidenceItem]) -> list[EvidenceItem]:
    result: list[EvidenceItem] = []
    seen = set()
    for item in items:
        key = (item.field_path, item.source_text)
        if key in seen:
            continue
        seen.add(key)
        result.append(item)
    return result


def _dedupe_questions(items: list[InterviewQuestion]) -> list[InterviewQuestion]:
    result = []
    seen = set()
    for item in items:
        key = item.question.lower()
        if key in seen:
            continue
        seen.add(key)
        result.append(item)
    return result
