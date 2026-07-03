import re
import textwrap

from app.schemas.matching import MatchProfile
from app.schemas.parser import EvidenceItem, JobProfile, ResumeProfile
from app.schemas.rewrite import ResumeRewriteDraft, RewriteChange
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
        draft = ResumeRewriteDraft(
            draft_id=new_id("draft"),
            company=job.company,
            title=job.title,
            headline=headline,
            target_keywords=target_keywords,
            changes=changes,
            risk_warnings=warnings,
            markdown="",
        )
        draft.markdown = render_rewrite_markdown(draft)
        return draft

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
        role = job.title or "target role"
        revised = (
            f"Evidence-backed {role} candidate with hands-on signals in {keyword_phrase}. "
            "Focused on traceable Agent workflows, backend implementation, and reviewable output."
        )
        return RewriteChange(
            change_id=new_id("change"),
            section="summary",
            original_text="",
            revised_text=revised,
            rationale=(
                "Create a short target summary from matched keywords only; this avoids adding "
                "claims that are absent from parsed resume evidence."
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
            revised = f"{revised} — ordered for the target JD."
        return RewriteChange(
            change_id=new_id("change"),
            section="skills",
            original_text=original,
            revised_text=revised,
            rationale=(
                "Move JD-aligned skills to the front while preserving the original skill set."
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
        role = job.title or "target role"
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
                        f"Rephrase existing evidence so the reviewer can see why it supports "
                        f"the JD signal: {requirement}."
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
                        "Evidence needed before adding this claim: "
                        f"{gap.suggested_action}"
                    ),
                    rationale=(
                        "This gap is intentionally not written as a resume bullet. The user must "
                        "confirm real supporting experience before it can become resume text."
                    ),
                    evidence=[],
                    risk_level="high" if gap.severity == "high" else "medium",
                )
            )
        return changes[:3]


def render_rewrite_markdown(draft: ResumeRewriteDraft) -> str:
    lines = [
        "# CareerPilot Tailored Resume Draft",
        "",
        f"Target: {draft.company or 'Unknown company'} / {draft.title or 'Unknown role'}",
        f"Status: {draft.approval_status}",
        "",
        "## Headline",
        draft.headline,
        "",
        "## Target Keywords",
        ", ".join(draft.target_keywords) if draft.target_keywords else "No matched keyword yet.",
        "",
        "## Proposed Changes",
    ]
    for index, change in enumerate(draft.changes, start=1):
        lines.extend(
            [
                "",
                f"### {index}. {change.section} / {change.risk_level} risk",
                f"Original: {change.original_text or '[new line or evidence placeholder]'}",
                f"Revised: {change.revised_text}",
                f"Why: {change.rationale}",
            ]
        )
        if change.evidence:
            lines.append("Evidence:")
            lines.extend(
                f"- {item.field_path}: {item.source_text}" for item in change.evidence[:4]
            )
    if draft.risk_warnings:
        lines.extend(["", "## Risk Warnings"])
        lines.extend(f"- {warning}" for warning in draft.risk_warnings)
    return "\n".join(lines)


def render_rewrite_pdf_bytes(draft: ResumeRewriteDraft) -> bytes:
    """Create a small dependency-free PDF preview.

    It is intentionally simple until the production PDF renderer is introduced.
    """

    text = _ascii_pdf_text(draft.markdown)
    lines = []
    for raw_line in text.splitlines():
        wrapped = textwrap.wrap(raw_line, width=88) or [""]
        lines.extend(wrapped)
    lines = lines[:44]

    content_lines = ["BT", "/F1 10 Tf", "54 760 Td", "14 TL"]
    for line in lines:
        content_lines.append(f"({_pdf_escape(line)}) Tj")
        content_lines.append("T*")
    content_lines.append("ET")
    stream = "\n".join(content_lines).encode("latin-1")

    objects = [
        b"<< /Type /Catalog /Pages 2 0 R >>",
        b"<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
        (
            b"<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] "
            b"/Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>"
        ),
        b"<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
        (
            b"<< /Length "
            + str(len(stream)).encode("ascii")
            + b" >>\nstream\n"
            + stream
            + b"\nendstream"
        ),
    ]

    chunks = [b"%PDF-1.4\n%\xe2\xe3\xcf\xd3\n"]
    offsets = []
    for index, obj in enumerate(objects, start=1):
        offsets.append(sum(len(chunk) for chunk in chunks))
        chunks.append(f"{index} 0 obj\n".encode("ascii"))
        chunks.append(obj)
        chunks.append(b"\nendobj\n")
    xref_at = sum(len(chunk) for chunk in chunks)
    chunks.append(f"xref\n0 {len(objects) + 1}\n".encode("ascii"))
    chunks.append(b"0000000000 65535 f \n")
    for offset in offsets:
        chunks.append(f"{offset:010d} 00000 n \n".encode("ascii"))
    chunks.append(
        (
            f"trailer\n<< /Size {len(objects) + 1} /Root 1 0 R >>\n"
            f"startxref\n{xref_at}\n%%EOF\n"
        ).encode("ascii")
    )
    return b"".join(chunks)


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
        return f"{cleaned}."
    return f"{cleaned}; positioned for {role} by foregrounding {requirement}."


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
        f"Do not add {keyword} unless the user can provide real evidence."
        for keyword in match.missing_keywords[:6]
    ]
    warnings.extend(
        f"{gap.requirement}: {gap.reason}" for gap in match.gaps if gap.severity == "high"
    )
    return _unique(warnings)[:8]


def _headline(job: JobProfile, keywords: list[str]) -> str:
    role = job.title or "Target role"
    keyword_phrase = " · ".join(keywords[:3]) if keywords else "Evidence locked"
    return f"{role} | {keyword_phrase}"


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
