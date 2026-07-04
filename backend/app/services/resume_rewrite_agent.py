import json
import re
from io import BytesIO
from pathlib import Path
from xml.sax.saxutils import escape

from pydantic import ValidationError

from app.core.config import Settings
from app.schemas.llm import ChatMessage, LLMRequest, LLMResponse
from app.schemas.matching import MatchProfile
from app.schemas.parser import EvidenceItem, JobProfile, ResumeProfile
from app.schemas.rewrite import (
    ResumeRewriteDraft,
    RewriteChange,
    TailoredResumeArtifact,
    TailoredResumeProject,
)
from app.services.json_repair import JSONRepairError, repair_json_object
from app.services.llm_client import LLMClient, LLMClientError
from app.services.run_store import new_id


class ResumeRewriteAgent:
    """Week5 evidence-locked resume rewrite agent.

    The first implementation is deterministic on purpose: it turns parsed resume evidence and
    W4 match output into reviewable rewrite suggestions without inventing unsupported experience.
    """

    def create_draft(
        self,
        resume: ResumeProfile,
        job: JobProfile,
        match: MatchProfile,
    ) -> ResumeRewriteDraft:
        target_keywords = _target_keywords(resume, match)
        changes = [
            self._summary_change(resume, job, target_keywords),
            self._skills_change(resume, target_keywords),
            *self._evidence_changes(job, match),
            *self._gap_changes(match),
        ]
        changes = [change for change in changes if change is not None][:10]
        warnings = _risk_warnings(match)
        headline = _headline(job, target_keywords)
        tailored_resume = _build_tailored_resume(
            resume,
            job,
            headline,
            target_keywords,
            changes,
            warnings,
        )
        draft = ResumeRewriteDraft(
            draft_id=new_id("draft"),
            company=job.company,
            title=job.title,
            headline=headline,
            target_keywords=target_keywords,
            changes=changes,
            risk_warnings=warnings,
            tailored_resume=tailored_resume,
            markdown="",
        )
        draft.markdown = render_rewrite_markdown(draft)
        return draft

    async def create_draft_with_llm(
        self,
        resume: ResumeProfile,
        job: JobProfile,
        match: MatchProfile,
        settings: Settings,
    ) -> tuple[ResumeRewriteDraft, LLMResponse | None, list[str]]:
        draft = self.create_draft(resume, job, match)
        if settings.llm_dry_run or not settings.llm_api_key:
            return draft, None, ["llm_resume_artifact_skipped_dry_run"]

        response: LLMResponse | None = None
        try:
            response = await LLMClient(settings).chat(
                LLMRequest(
                    messages=[
                        ChatMessage(role="system", content=_rewrite_artifact_system_prompt()),
                        ChatMessage(
                            role="user",
                            content=json.dumps(
                                {
                                    "resume_profile": resume.model_dump(mode="json"),
                                    "job_profile": job.model_dump(mode="json"),
                                    "match_profile": match.model_dump(mode="json"),
                                    "rewrite_changes": [
                                        change.model_dump(mode="json") for change in draft.changes
                                    ],
                                    "risk_warnings": draft.risk_warnings,
                                },
                                ensure_ascii=False,
                            ),
                        ),
                    ],
                    response_format={"type": "json_object"},
                    temperature=0.2,
                    max_tokens=2200,
                )
            )
            repaired = repair_json_object(response.content)
            artifact = TailoredResumeArtifact.model_validate(repaired.data)
            artifact = _sanitize_tailored_resume(artifact, draft, resume, job)
            draft.tailored_resume = artifact
            draft.markdown = render_rewrite_markdown(draft)
            issues = [f"llm_resume_artifact:{issue}" for issue in repaired.issues]
            return draft, response, issues
        except (JSONRepairError, LLMClientError, ValidationError, KeyError, ValueError) as exc:
            draft.risk_warnings = _unique(
                [
                    *draft.risk_warnings,
                    f"LLM 简历成品生成失败，已回退到证据锁定模板：{exc}",
                ]
            )[:8]
            draft.markdown = render_rewrite_markdown(draft)
            return draft, response, ["llm_resume_artifact_fallback"]

    def _summary_change(
        self,
        resume: ResumeProfile,
        job: JobProfile,
        target_keywords: list[str],
    ) -> RewriteChange | None:
        if not target_keywords:
            return None
        evidence = _evidence_for_keywords(resume.evidence, target_keywords)
        if not evidence and resume.projects:
            evidence = resume.projects[0].evidence
        keyword_phrase = ", ".join(target_keywords[:4])
        role = job.title or "目标岗位"
        revised = (
            f"具备 {keyword_phrase} 实践信号的{role}候选人，关注可追踪 Agent 工作流、"
            "后端实现与可审阅交付。"
        )
        return RewriteChange(
            change_id=new_id("change"),
            section="summary",
            original_text="",
            revised_text=revised,
            rationale=(
                "只基于已匹配关键词生成简短求职摘要，避免加入解析简历证据中不存在的经历。"
            ),
            evidence=evidence[:4],
            risk_level="medium" if evidence else "high",
        )

    def _skills_change(
        self,
        resume: ResumeProfile,
        target_keywords: list[str],
    ) -> RewriteChange | None:
        if not resume.skills:
            return None
        ordered_skills = _unique([*target_keywords, *resume.skills])
        original = ", ".join(resume.skills)
        revised = ", ".join(ordered_skills[:10])
        if original == revised:
            revised = f"{revised}（已按目标 JD 优先级排序）"
        return RewriteChange(
            change_id=new_id("change"),
            section="skills",
            original_text=original,
            revised_text=revised,
            rationale=(
                "将 JD 更关注的技能前置，同时保留原始技能集合，不新增未经证实的技能。"
            ),
            evidence=_evidence_for_keywords(resume.evidence, ordered_skills)[:5],
            risk_level="low",
        )

    def _evidence_changes(
        self,
        job: JobProfile,
        match: MatchProfile,
    ) -> list[RewriteChange]:
        changes: list[RewriteChange] = []
        role = job.title or "目标岗位"
        for mapping in match.evidence_mapping:
            if not mapping.evidence or not mapping.matched_resume_items:
                continue
            original = mapping.matched_resume_items[0]
            requirement = _clean_requirement(mapping.requirement)
            revised = _rewrite_with_requirement(original, requirement, role)
            changes.append(
                RewriteChange(
                    change_id=new_id("change"),
                    section=_section_from_evidence(mapping.evidence),
                    original_text=original,
                    revised_text=revised,
                    rationale=(
                        f"重写已有证据，让审阅者能直接看到它如何支撑 JD 信号：{requirement}。"
                    ),
                    evidence=mapping.evidence[:4],
                    risk_level="low",
                )
            )
        return _dedupe_changes(changes)[:5]

    def _gap_changes(self, match: MatchProfile) -> list[RewriteChange]:
        changes: list[RewriteChange] = []
        for gap in match.gaps:
            if gap.severity not in {"high", "medium"}:
                continue
            changes.append(
                RewriteChange(
                    change_id=new_id("change"),
                    section="evidence_needed",
                    original_text="",
                    revised_text=(
                        "在加入这类表述前需要先补充真实证据："
                        f"{gap.suggested_action}"
                    ),
                    rationale=(
                        "该缺口不会直接写入简历正文。用户必须先确认真实支撑经历，才能转成可投递表述。"
                    ),
                    evidence=[],
                    risk_level="high" if gap.severity == "high" else "medium",
                )
            )
        return changes[:3]


def _rewrite_artifact_system_prompt() -> str:
    return (
        "You are CareerPilot ResumeRewriteAgent. Return only one JSON object matching this schema: "
        "{language:'zh-CN', company:string|null, title:string|null, headline:string, "
        "summary:string, skills:string[], projects:[{name:string, bullets:string[], "
        "evidence_paths:string[]}], experiences:string[], education:string[], "
        "evidence_notice:string, risk_notes:string[], markdown:string}. "
        "Write mostly in Chinese. Keep technical keywords such as Python, FastAPI, RAG, "
        "Function Calling, PostgreSQL in English. Do not invent employers, education, dates, "
        "metrics, awards, production scale, or skills that are not supported by the evidence. "
        "If a JD signal lacks evidence, put it in risk_notes instead of the resume body. "
        "The markdown must look like a real resume: headline, summary, skills, projects, "
        "experience, and education only. Do not include audit logs, evidence paths, risk notes, "
        "quality-gate wording, or explanations in the markdown. Use concise human language, "
        "not system language."
    )


def _build_tailored_resume(
    resume: ResumeProfile,
    job: JobProfile,
    headline: str,
    target_keywords: list[str],
    changes: list[RewriteChange],
    warnings: list[str],
) -> TailoredResumeArtifact:
    summary_change = next((change for change in changes if change.section == "summary"), None)
    skills_change = next((change for change in changes if change.section == "skills"), None)
    summary = (
        summary_change.revised_text
        if summary_change
        else _fallback_summary(job, target_keywords)
    )
    skill_text = skills_change.revised_text if skills_change else ", ".join(resume.skills)
    skills = _split_skills(skill_text)
    projects = [
        TailoredResumeProject(
            name=project.name,
            bullets=_project_bullets(project.description, project.skills, target_keywords),
            evidence_paths=[item.field_path for item in project.evidence[:4]],
        )
        for project in resume.projects[:3]
    ]
    experiences = [
        _clean_text(
            "；".join(
                item
                for item in [
                    experience.company,
                    experience.title,
                    experience.description,
                ]
                if item
            )
        )
        for experience in resume.experiences[:3]
    ]
    education = [
        _clean_text(
            "；".join(
                item
                for item in [
                    education.school,
                    education.degree,
                    education.major,
                    education.start_date,
                    education.end_date,
                ]
                if item
            )
        )
        for education in resume.education[:2]
    ]
    artifact = TailoredResumeArtifact(
        company=job.company,
        title=job.title,
        headline=headline,
        summary=summary,
        skills=skills,
        projects=projects,
        experiences=[item for item in experiences if item],
        education=[item for item in education if item],
        evidence_notice="本简历草稿仅使用已解析简历证据生成；无证据的 JD 信号保留在风险提示中。",
        risk_notes=warnings[:6],
        markdown="",
    )
    artifact.markdown = _render_tailored_resume_markdown(artifact)
    return artifact


def _sanitize_tailored_resume(
    artifact: TailoredResumeArtifact,
    draft: ResumeRewriteDraft,
    resume: ResumeProfile,
    job: JobProfile,
) -> TailoredResumeArtifact:
    allowed_skills = _unique([*resume.skills, *draft.target_keywords])
    allowed_skill_keys = {item.lower() for item in allowed_skills}
    artifact.company = artifact.company or job.company
    artifact.title = artifact.title or job.title
    artifact.headline = artifact.headline or draft.headline
    artifact.skills = [
        skill for skill in _unique(artifact.skills) if skill.lower() in allowed_skill_keys
    ][:14]
    if not artifact.skills:
        artifact.skills = allowed_skills[:10]
    artifact.risk_notes = _unique([*artifact.risk_notes, *draft.risk_warnings])[:8]
    artifact.evidence_notice = (
        artifact.evidence_notice
        or "本简历草稿仅使用已解析简历证据生成；无证据的 JD 信号保留在风险提示中。"
    )
    artifact.markdown = _render_tailored_resume_markdown(artifact)
    return artifact


def _render_tailored_resume_markdown(artifact: TailoredResumeArtifact) -> str:
    lines = [
        "# 定制版中文简历草稿",
        "",
        f"目标岗位：{artifact.company or '未知公司'} / {artifact.title or '未知岗位'}",
        "",
        "## 标题",
        artifact.headline,
        "",
        "## 个人概要",
        artifact.summary,
        "",
        "## 核心技能",
        "、".join(artifact.skills) if artifact.skills else "暂无可写入技能。",
    ]
    if artifact.projects:
        lines.extend(["", "## 项目经历"])
        for project in artifact.projects:
            lines.append(f"### {project.name}")
            lines.extend(f"- {bullet}" for bullet in project.bullets)
    if artifact.experiences:
        lines.extend(["", "## 实习/工作经历"])
        lines.extend(f"- {experience}" for experience in artifact.experiences)
    if artifact.education:
        lines.extend(["", "## 教育经历"])
        lines.extend(f"- {education}" for education in artifact.education)
    return "\n".join(lines)


def render_rewrite_markdown(draft: ResumeRewriteDraft) -> str:
    if draft.tailored_resume:
        return draft.tailored_resume.markdown

    return _render_rewrite_audit_markdown(draft)


def _render_rewrite_audit_markdown(draft: ResumeRewriteDraft) -> str:
    lines = [
        "# CareerPilot 中文简历改写稿",
        "",
        f"目标：{draft.company or '未知公司'} / {draft.title or '未知岗位'}",
        f"审批状态：{_approval_label(draft.approval_status)}",
        "",
        "## 投递标题",
        draft.headline,
        "",
        "## 目标关键词",
        ", ".join(draft.target_keywords) if draft.target_keywords else "暂无匹配关键词。",
        "",
        "## 改写建议",
    ]
    for index, change in enumerate(draft.changes, start=1):
        lines.extend(
            [
                "",
                f"### {index}. {_section_label(change.section)} / {_risk_label(change.risk_level)}",
                f"原文：{change.original_text or '[新增行或待补充证据]'}",
                f"改写：{change.revised_text}",
                f"原因：{change.rationale}",
            ]
        )
        if change.evidence:
            lines.append("证据：")
            lines.extend(
                f"- {item.field_path}: {item.source_text}" for item in change.evidence[:4]
            )
    if draft.risk_warnings:
        lines.extend(["", "## 风险提示"])
        lines.extend(f"- {warning}" for warning in draft.risk_warnings)
    return "\n".join(lines)


def render_rewrite_pdf_bytes(draft: ResumeRewriteDraft) -> bytes:
    """Render a Chinese-first, reviewable resume draft PDF.

    ReportLab gives us proper font embedding when installed. The fallback keeps the export
    dependency-free and uses a Type0 CJK font instead of replacing Chinese with question marks.
    """

    try:
        return _render_rewrite_pdf_reportlab(draft)
    except Exception:
        return _render_rewrite_pdf_basic(draft)


def _render_rewrite_pdf_reportlab(draft: ResumeRewriteDraft) -> bytes:
    from reportlab.lib import colors
    from reportlab.lib.enums import TA_CENTER
    from reportlab.lib.pagesizes import A4
    from reportlab.lib.styles import ParagraphStyle
    from reportlab.lib.units import mm
    from reportlab.pdfbase import pdfmetrics
    from reportlab.pdfbase.cidfonts import UnicodeCIDFont
    from reportlab.pdfbase.ttfonts import TTFont
    from reportlab.platypus import (
        KeepTogether,
        SimpleDocTemplate,
        Spacer,
        Table,
        TableStyle,
    )

    buffer = BytesIO()
    font_name = _register_reportlab_font(pdfmetrics, TTFont, UnicodeCIDFont)
    page_width, _ = A4
    usable_width = page_width - 34 * mm

    styles = {
        "title": ParagraphStyle(
            "CareerPilotTitle",
            fontName=font_name,
            fontSize=22,
            leading=27,
            textColor=colors.HexColor("#102332"),
            spaceAfter=6,
            wordWrap="CJK",
        ),
        "subtitle": ParagraphStyle(
            "CareerPilotSubtitle",
            fontName=font_name,
            fontSize=10,
            leading=15,
            textColor=colors.HexColor("#5b6f7b"),
            wordWrap="CJK",
        ),
        "section": ParagraphStyle(
            "CareerPilotSection",
            fontName=font_name,
            fontSize=13,
            leading=18,
            textColor=colors.HexColor("#0f6d7c"),
            spaceBefore=12,
            spaceAfter=7,
            wordWrap="CJK",
        ),
        "normal": ParagraphStyle(
            "CareerPilotNormal",
            fontName=font_name,
            fontSize=9.8,
            leading=15.4,
            textColor=colors.HexColor("#263846"),
            wordWrap="CJK",
        ),
        "small": ParagraphStyle(
            "CareerPilotSmall",
            fontName=font_name,
            fontSize=8.6,
            leading=12.8,
            textColor=colors.HexColor("#667985"),
            wordWrap="CJK",
        ),
        "center": ParagraphStyle(
            "CareerPilotCenter",
            fontName=font_name,
            fontSize=9,
            leading=13,
            alignment=TA_CENTER,
            textColor=colors.HexColor("#315163"),
            wordWrap="CJK",
        ),
    }

    document = SimpleDocTemplate(
        buffer,
        pagesize=A4,
        leftMargin=17 * mm,
        rightMargin=17 * mm,
        topMargin=16 * mm,
        bottomMargin=16 * mm,
        title="CareerPilot 中文简历改写稿",
        author="CareerPilot",
    )

    story = []
    story.append(
        Table(
            [
                [
                    _rl_paragraph(
                        "CareerPilot 中文简历改写稿",
                        styles["title"],
                    ),
                    _rl_paragraph(
                        f"审批状态\n{_approval_label(draft.approval_status)}",
                        styles["center"],
                    ),
                ]
            ],
            colWidths=[usable_width - 38 * mm, 38 * mm],
            style=TableStyle(
                [
                    ("BACKGROUND", (0, 0), (-1, -1), colors.HexColor("#edf8f7")),
                    ("BOX", (0, 0), (-1, -1), 0.8, colors.HexColor("#c7e3df")),
                    ("INNERGRID", (0, 0), (-1, -1), 0.3, colors.HexColor("#dbecea")),
                    ("LEFTPADDING", (0, 0), (-1, -1), 13),
                    ("RIGHTPADDING", (0, 0), (-1, -1), 13),
                    ("TOPPADDING", (0, 0), (-1, -1), 12),
                    ("BOTTOMPADDING", (0, 0), (-1, -1), 12),
                    ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
                ]
            ),
        )
    )
    story.append(Spacer(1, 10))
    story.append(_rl_paragraph(_target_line(draft), styles["subtitle"]))
    story.append(_rl_paragraph(draft.headline, styles["subtitle"]))
    if draft.tailored_resume:
        _append_tailored_resume_story(draft.tailored_resume, story, styles)
        document.build(story)
        return buffer.getvalue()

    story.append(_rl_section("目标关键词", styles))
    story.append(_rl_paragraph(_keyword_line(draft), styles["normal"]))
    summary = _first_change(draft, "summary")
    if summary:
        story.append(_rl_section("个人概要", styles))
        story.append(_change_table(summary, styles, Table, TableStyle, colors, usable_width))

    skills = _first_change(draft, "skills")
    if skills:
        story.append(_rl_section("核心技能", styles))
        story.append(_change_table(skills, styles, Table, TableStyle, colors, usable_width))

    evidence_changes = [
        change for change in draft.changes if change.section in {"project", "experience"}
    ]
    if evidence_changes:
        story.append(_rl_section("项目与经历改写", styles))
        for index, change in enumerate(evidence_changes, start=1):
            heading = (
                f"{index}. {_section_label(change.section)} / "
                f"{_risk_label(change.risk_level)}"
            )
            story.append(
                KeepTogether(
                    [
                        _rl_paragraph(heading, styles["subtitle"]),
                        _change_table(change, styles, Table, TableStyle, colors, usable_width),
                        Spacer(1, 6),
                    ]
                )
            )

    evidence_needed = [change for change in draft.changes if change.section == "evidence_needed"]
    if evidence_needed or draft.risk_warnings:
        story.append(_rl_section("待补充证据与风险提示", styles))
        for change in evidence_needed:
            story.append(_change_table(change, styles, Table, TableStyle, colors, usable_width))
            story.append(Spacer(1, 5))
        for warning in draft.risk_warnings[:8]:
            story.append(_rl_paragraph(f"· {warning}", styles["small"]))

    document.build(story)
    return buffer.getvalue()


def _append_tailored_resume_story(artifact: TailoredResumeArtifact, story, styles) -> None:
    from reportlab.platypus import Spacer

    story.append(_rl_section("个人概要", styles))
    story.append(_rl_paragraph(artifact.summary, styles["normal"]))
    story.append(_rl_section("核心技能", styles))
    story.append(_rl_paragraph("、".join(artifact.skills) or "暂无可写入技能。", styles["normal"]))

    if artifact.projects:
        story.append(_rl_section("项目经历", styles))
        for project in artifact.projects:
            story.append(_rl_paragraph(project.name, styles["subtitle"]))
            for bullet in project.bullets:
                story.append(_rl_paragraph(f"· {bullet}", styles["normal"]))
            story.append(Spacer(1, 5))

    if artifact.experiences:
        story.append(_rl_section("实习/工作经历", styles))
        for experience in artifact.experiences:
            story.append(_rl_paragraph(f"· {experience}", styles["normal"]))

    if artifact.education:
        story.append(_rl_section("教育经历", styles))
        for education in artifact.education:
            story.append(_rl_paragraph(f"· {education}", styles["normal"]))


def _register_reportlab_font(pdfmetrics, TTFont, UnicodeCIDFont) -> str:
    font_name = "CareerPilotCN"
    if font_name in pdfmetrics.getRegisteredFontNames():
        return font_name

    font_candidates = [
        Path("/System/Library/Fonts/Supplemental/Arial Unicode.ttf"),
        Path("/Library/Fonts/Arial Unicode.ttf"),
        Path("/usr/share/fonts/opentype/noto/NotoSansCJKsc-Regular.otf"),
        Path("/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc"),
        Path("/usr/share/fonts/truetype/noto/NotoSansCJK-Regular.ttc"),
        Path(__file__).resolve().parents[2] / "assets" / "fonts" / "NotoSansCJKsc-Regular.otf",
    ]
    for font_path in font_candidates:
        if not font_path.exists():
            continue
        try:
            pdfmetrics.registerFont(TTFont(font_name, str(font_path)))
            return font_name
        except Exception:
            continue

    pdfmetrics.registerFont(UnicodeCIDFont("STSong-Light"))
    return "STSong-Light"


def _change_table(change, styles, table_cls, table_style_cls, colors, width):
    rows = []
    if change.original_text:
        rows.append(
            [
                _rl_paragraph("原文", styles["small"]),
                _rl_paragraph(change.original_text, styles["small"]),
            ]
        )
    rows.append(
        [
            _rl_paragraph("改写", styles["small"]),
            _rl_paragraph(change.revised_text, styles["normal"]),
        ]
    )
    rows.append(
        [
            _rl_paragraph("原因", styles["small"]),
            _rl_paragraph(change.rationale, styles["small"]),
        ]
    )
    if change.evidence:
        evidence = "\n".join(
            f"{item.field_path}: {item.source_text}" for item in change.evidence[:4]
        )
        rows.append(
            [
                _rl_paragraph("证据", styles["small"]),
                _rl_paragraph(evidence, styles["small"]),
            ]
        )

    return table_cls(
        rows,
        colWidths=[20 * 2.83465, width - 20 * 2.83465],
        style=table_style_cls(
            [
                ("BACKGROUND", (0, 0), (-1, -1), colors.HexColor("#fbfefe")),
                ("BOX", (0, 0), (-1, -1), 0.55, colors.HexColor("#d7e8e6")),
                ("INNERGRID", (0, 0), (-1, -1), 0.35, colors.HexColor("#e6f0ef")),
                ("BACKGROUND", (0, 0), (0, -1), colors.HexColor("#edf7f6")),
                ("TEXTCOLOR", (0, 0), (0, -1), colors.HexColor("#0f6d7c")),
                ("LEFTPADDING", (0, 0), (-1, -1), 9),
                ("RIGHTPADDING", (0, 0), (-1, -1), 9),
                ("TOPPADDING", (0, 0), (-1, -1), 7),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 7),
                ("VALIGN", (0, 0), (-1, -1), "TOP"),
            ]
        ),
    )


def _rl_paragraph(text: str, style) -> object:
    from reportlab.platypus import Paragraph

    return Paragraph(escape(text).replace("\n", "<br/>"), style)


def _rl_section(text: str, styles) -> object:
    return _rl_paragraph(text, styles["section"])


def _render_rewrite_pdf_basic(draft: ResumeRewriteDraft) -> bytes:
    page_width = 595.28
    page_height = 841.89
    margin = 42.0
    pages: list[list[str]] = []
    commands: list[str] = []
    y = 0.0

    def start_page() -> None:
        nonlocal commands, y
        commands = []
        pages.append(commands)
        y = page_height - 44
        draw_rect(0, page_height - 96, page_width, 96, (0.92, 0.98, 0.97))
        draw_rect(0, page_height - 98, page_width, 2, (0.20, 0.67, 0.62))

    def ensure_space(height: float) -> None:
        if y - height < 42:
            start_page()

    def draw_rect(
        x: float,
        rect_y: float,
        width: float,
        height: float,
        rgb: tuple[float, float, float],
    ) -> None:
        commands.append(
            f"{rgb[0]:.3f} {rgb[1]:.3f} {rgb[2]:.3f} rg "
            f"{x:.2f} {rect_y:.2f} {width:.2f} {height:.2f} re f"
        )

    def draw_text(
        x: float,
        text_y: float,
        text: str,
        size: float = 10,
        rgb: tuple[float, float, float] = (0.10, 0.18, 0.24),
    ) -> None:
        encoded = text.encode("utf-16-be").hex().upper()
        commands.append(
            "BT "
            f"/F1 {size:.2f} Tf "
            f"{rgb[0]:.3f} {rgb[1]:.3f} {rgb[2]:.3f} rg "
            f"{x:.2f} {text_y:.2f} Td <{encoded}> Tj ET"
        )

    def draw_wrapped(
        text: str,
        x: float,
        width_units: int,
        size: float = 10,
        leading: float = 15,
        rgb: tuple[float, float, float] = (0.18, 0.27, 0.34),
    ) -> None:
        nonlocal y
        for paragraph in text.splitlines() or [""]:
            for line in _wrap_pdf_text(paragraph, width_units):
                ensure_space(leading + 2)
                draw_text(x, y, line, size=size, rgb=rgb)
                y -= leading
            y -= 2

    start_page()
    draw_text(margin, y, "CareerPilot 中文简历改写稿", size=22, rgb=(0.06, 0.14, 0.20))
    draw_text(page_width - 158, y, f"审批状态：{_approval_label(draft.approval_status)}", size=10)
    y -= 28
    draw_wrapped(_target_line(draft), margin, 78, size=10, leading=14, rgb=(0.27, 0.39, 0.46))
    y -= 8

    for title, body in _pdf_resume_blocks(draft):
        ensure_space(46)
        draw_rect(margin, y - 21, 4, 20, (0.20, 0.67, 0.62))
        draw_text(margin + 12, y - 16, title, size=12.5, rgb=(0.05, 0.42, 0.48))
        y -= 34
        draw_wrapped(body, margin + 12, 78, size=9.6, leading=14)
        y -= 8

    return _build_type0_pdf(pages, page_width, page_height)


def _target_line(draft: ResumeRewriteDraft) -> str:
    return f"目标岗位：{draft.company or '未知公司'} / {draft.title or '未知岗位'}"


def _keyword_line(draft: ResumeRewriteDraft) -> str:
    return "、".join(draft.target_keywords) if draft.target_keywords else "暂无匹配关键词"


def _first_change(draft: ResumeRewriteDraft, section: str) -> RewriteChange | None:
    return next((change for change in draft.changes if change.section == section), None)


def _pdf_resume_blocks(draft: ResumeRewriteDraft) -> list[tuple[str, str]]:
    if draft.tailored_resume:
        artifact = draft.tailored_resume
        blocks = [
            ("投递标题", artifact.headline),
            ("个人概要", artifact.summary),
            ("核心技能", "、".join(artifact.skills) if artifact.skills else "暂无可写入技能。"),
        ]
        if artifact.projects:
            blocks.append(
                (
                    "项目经历",
                    "\n\n".join(
                        f"{project.name}\n"
                        + "\n".join(f"· {bullet}" for bullet in project.bullets)
                        for project in artifact.projects
                    ),
                )
            )
        if artifact.experiences:
            blocks.append(
                ("实习/工作经历", "\n".join(f"· {item}" for item in artifact.experiences))
            )
        if artifact.education:
            blocks.append(("教育经历", "\n".join(f"· {item}" for item in artifact.education)))
        return blocks

    blocks = [
        ("目标关键词", _keyword_line(draft)),
        ("投递标题", draft.headline),
    ]

    summary = _first_change(draft, "summary")
    if summary:
        blocks.append(("个人概要", _format_change_block(summary)))

    skills = _first_change(draft, "skills")
    if skills:
        blocks.append(("核心技能", _format_change_block(skills)))

    evidence_changes = [
        change for change in draft.changes if change.section in {"project", "experience"}
    ]
    if evidence_changes:
        body = "\n\n".join(
            f"{index}. {_section_label(change.section)} / {_risk_label(change.risk_level)}\n"
            f"{_format_change_block(change)}"
            for index, change in enumerate(evidence_changes, start=1)
        )
        blocks.append(("项目与经历改写", body))

    evidence_needed = [change for change in draft.changes if change.section == "evidence_needed"]
    if evidence_needed:
        body = "\n\n".join(_format_change_block(change) for change in evidence_needed)
        blocks.append(("待补充证据", body))

    if draft.risk_warnings:
        warnings = "\n".join(f"· {warning}" for warning in draft.risk_warnings[:8])
        blocks.append(("风险提示", warnings))

    return blocks


def _format_change_block(change: RewriteChange) -> str:
    lines = []
    if change.original_text:
        lines.append(f"原文：{change.original_text}")
    lines.append(f"改写：{change.revised_text}")
    lines.append(f"原因：{change.rationale}")
    if change.evidence:
        evidence = "；".join(
            f"{item.field_path}: {item.source_text}" for item in change.evidence[:4]
        )
        lines.append(f"证据：{evidence}")
    return "\n".join(lines)


def _wrap_pdf_text(text: str, max_units: int) -> list[str]:
    if not text:
        return [""]

    wrapped: list[str] = []
    current = ""
    current_units = 0
    for char in text:
        char_units = 2 if _is_wide_char(char) else 1
        if current and current_units + char_units > max_units:
            wrapped.append(current.rstrip())
            current = ""
            current_units = 0
        current += char
        current_units += char_units
    if current:
        wrapped.append(current.rstrip())
    return wrapped or [""]


def _is_wide_char(char: str) -> bool:
    return "\u2e80" <= char <= "\uffff"


def _build_type0_pdf(pages: list[list[str]], page_width: float, page_height: float) -> bytes:
    objects: list[bytes] = []

    def add_object(payload: bytes) -> int:
        objects.append(payload)
        return len(objects)

    font_descendant_num = add_object(
        b"<< /Type /Font /Subtype /CIDFontType0 /BaseFont /STSong-Light "
        b"/CIDSystemInfo << /Registry (Adobe) /Ordering (GB1) /Supplement 2 >> "
        b"/DW 1000 >>"
    )
    font_num = add_object(
        (
            f"<< /Type /Font /Subtype /Type0 /BaseFont /STSong-Light "
            f"/Encoding /UniGB-UCS2-H /DescendantFonts [{font_descendant_num} 0 R] >>"
        ).encode("ascii")
    )

    page_nums: list[int] = []
    for commands in pages:
        stream = "\n".join(commands).encode("ascii")
        content_num = add_object(
            b"<< /Length "
            + str(len(stream)).encode("ascii")
            + b" >>\nstream\n"
            + stream
            + b"\nendstream"
        )
        page_num = add_object(
            (
                f"<< /Type /Page /Parent {{pages}} 0 R /MediaBox [0 0 {page_width:.2f} "
                f"{page_height:.2f}] /Resources << /Font << /F1 {font_num} 0 R >> >> "
                f"/Contents {content_num} 0 R >>"
            ).encode("ascii")
        )
        page_nums.append(page_num)

    kids = " ".join(f"{page_num} 0 R" for page_num in page_nums)
    pages_num = add_object(
        f"<< /Type /Pages /Kids [{kids}] /Count {len(page_nums)} >>".encode("ascii")
    )
    catalog_num = add_object(f"<< /Type /Catalog /Pages {pages_num} 0 R >>".encode("ascii"))

    objects = [
        payload.replace(b"{pages}", str(pages_num).encode("ascii")) for payload in objects
    ]

    chunks = [b"%PDF-1.4\n%\xe2\xe3\xcf\xd3\n"]
    offsets = []
    for index, payload in enumerate(objects, start=1):
        offsets.append(sum(len(chunk) for chunk in chunks))
        chunks.append(f"{index} 0 obj\n".encode("ascii"))
        chunks.append(payload)
        chunks.append(b"\nendobj\n")

    xref_at = sum(len(chunk) for chunk in chunks)
    chunks.append(f"xref\n0 {len(objects) + 1}\n".encode("ascii"))
    chunks.append(b"0000000000 65535 f \n")
    for offset in offsets:
        chunks.append(f"{offset:010d} 00000 n \n".encode("ascii"))
    chunks.append(
        (
            f"trailer\n<< /Size {len(objects) + 1} /Root {catalog_num} 0 R >>\n"
            f"startxref\n{xref_at}\n%%EOF\n"
        ).encode("ascii")
    )
    return b"".join(chunks)


def _fallback_summary(job: JobProfile, target_keywords: list[str]) -> str:
    role = job.title or "目标岗位"
    keyword_text = "、".join(target_keywords[:5]) if target_keywords else "已解析简历证据"
    return f"面向{role}的候选人，具备{keyword_text}等真实项目或技能信号。"


def _split_skills(text: str) -> list[str]:
    normalized = text.replace("（已按目标 JD 优先级排序）", "")
    return _unique([item.strip() for item in re.split(r"[,，、]", normalized) if item.strip()])


def _project_bullets(description: str | None, skills: list[str], keywords: list[str]) -> list[str]:
    bullets: list[str] = []
    if description:
        bullets.append(_clean_text(description))
    matched_skills = _unique([skill for skill in skills if skill in keywords])
    if matched_skills:
        bullets.append(f"涉及技术：{'、'.join(matched_skills[:8])}。")
    elif skills:
        bullets.append(f"涉及技术：{'、'.join(skills[:8])}。")
    return bullets or ["项目描述待补充，但不会自动编造未提供的经历。"]


def _clean_text(text: str) -> str:
    return re.sub(r"\s+", " ", text).strip(" ;；")


def _target_keywords(resume: ResumeProfile, match: MatchProfile) -> list[str]:
    resume_terms = {item.lower() for item in [*resume.skills, *resume.keywords]}
    matched = [keyword for keyword in match.matched_keywords if keyword.lower() in resume_terms]
    return _unique([*matched, *resume.skills])[:8]


def _evidence_for_keywords(evidence: list[EvidenceItem], keywords: list[str]) -> list[EvidenceItem]:
    selected: list[EvidenceItem] = []
    for item in evidence:
        source = item.source_text.lower()
        if any(keyword.lower() in source for keyword in keywords):
            selected.append(item)
    return _unique_evidence(selected)


def _rewrite_with_requirement(original: str, requirement: str, role: str) -> str:
    cleaned = original.strip().rstrip(".")
    requirement = requirement.strip().rstrip(".")
    if not requirement:
        return f"{cleaned}。"
    return f"基于“{cleaned}”，突出“{requirement}”这一 JD 信号，用于匹配{role}。"


def _section_from_evidence(evidence: list[EvidenceItem]) -> str:
    first_path = evidence[0].field_path if evidence else ""
    if "project" in first_path:
        return "project"
    if "experience" in first_path:
        return "experience"
    if "skill" in first_path:
        return "skills"
    return "summary"


def _risk_warnings(match: MatchProfile) -> list[str]:
    warnings = [
        f"不要加入“{keyword}”，除非用户能提供真实项目或经历证据。"
        for keyword in match.missing_keywords[:6]
    ]
    warnings.extend(
        f"{gap.requirement}: {gap.reason}" for gap in match.gaps if gap.severity == "high"
    )
    return _unique(warnings)[:8]


def _headline(job: JobProfile, keywords: list[str]) -> str:
    role = job.title or "目标岗位"
    keyword_phrase = " · ".join(keywords[:3]) if keywords else "证据锁定"
    return f"{role} | {keyword_phrase}"


def _approval_label(status: str) -> str:
    labels = {
        "WAITING_APPROVAL": "等待审批",
        "APPROVED": "已审批",
        "REJECTED": "已拒绝",
    }
    return labels.get(status, status)


def _risk_label(risk_level: str) -> str:
    labels = {
        "low": "低风险",
        "medium": "中风险",
        "high": "高风险",
    }
    return labels.get(risk_level, risk_level)


def _section_label(section: str) -> str:
    labels = {
        "summary": "个人概要",
        "skills": "技能",
        "project": "项目经历",
        "experience": "工作经历",
        "evidence_needed": "需要补充证据",
    }
    return labels.get(section, section)


def _clean_requirement(requirement: str) -> str:
    return re.sub(
        r"^(required|preferred|nice to have|plus|职责|要求)\s*[:：-]?\s*",
        "",
        requirement,
        flags=re.I,
    )


def _dedupe_changes(changes: list[RewriteChange]) -> list[RewriteChange]:
    deduped: list[RewriteChange] = []
    seen: set[str] = set()
    for change in changes:
        key = f"{change.section}:{change.original_text}:{change.revised_text}".lower()
        if key in seen:
            continue
        seen.add(key)
        deduped.append(change)
    return deduped


def _unique(items: list[str]) -> list[str]:
    seen: set[str] = set()
    result: list[str] = []
    for item in items:
        normalized = item.strip()
        key = normalized.lower()
        if not normalized or key in seen:
            continue
        seen.add(key)
        result.append(normalized)
    return result


def _unique_evidence(items: list[EvidenceItem]) -> list[EvidenceItem]:
    seen: set[tuple[str, str]] = set()
    result: list[EvidenceItem] = []
    for item in items:
        key = (item.field_path, item.source_text)
        if key in seen:
            continue
        seen.add(key)
        result.append(item)
    return result


def _ascii_pdf_text(text: str) -> str:
    return text.encode("latin-1", errors="replace").decode("latin-1")


def _pdf_escape(text: str) -> str:
    return text.replace("\\", "\\\\").replace("(", "\\(").replace(")", "\\)")
