import re
from collections.abc import Iterable
from dataclasses import dataclass

from app.schemas.matching import (
    MatchEvidence,
    MatchGap,
    MatchPriority,
    MatchProfile,
    MatchScoreBreakdown,
)
from app.schemas.parser import EvidenceItem, JobProfile, ResumeProfile

TOKEN_PATTERN = re.compile(r"[A-Za-z][A-Za-z0-9+#.\-]*|[\u4e00-\u9fff]{2,}")
STOP_WORDS = {
    "a",
    "an",
    "and",
    "are",
    "as",
    "at",
    "be",
    "build",
    "by",
    "for",
    "in",
    "of",
    "on",
    "or",
    "required",
    "requirement",
    "requirements",
    "responsibilities",
    "responsibility",
    "role",
    "the",
    "to",
    "with",
    "preferred",
    "plus",
    "nice",
    "must",
    "title",
    "company",
    "岗位",
    "职责",
    "要求",
    "优先",
    "必须",
}


@dataclass(frozen=True)
class ResumeSignal:
    field_path: str
    text: str
    tokens: set[str]
    evidence: list[EvidenceItem]


@dataclass(frozen=True)
class RequirementScore:
    score: float
    matched_items: list[str]
    missing_terms: list[str]
    evidence: list[EvidenceItem]


class MatchingAgent:
    """Week4 deterministic matching agent with evidence-first scoring."""

    def match(self, resume: ResumeProfile, job: JobProfile) -> MatchProfile:
        signals = _resume_signals(resume)
        evidence_mapping = self._map_requirements(job, signals)

        hard_items = job.hard_requirements
        nice_items = job.nice_to_have
        responsibility_items = job.responsibilities
        hard_score = _average_score(
            self._score_requirement(item, signals).score for item in hard_items
        )
        nice_score = _average_score(
            self._score_requirement(item, signals).score for item in nice_items
        )
        responsibility_score = _average_score(
            self._score_requirement(item, signals).score for item in responsibility_items
        )

        job_keywords = _unique([*job.tech_keywords, *job.hidden_keywords])
        matched_keywords, missing_keywords = _keyword_alignment(job_keywords, signals)
        keyword_score = (
            round(len(matched_keywords) / len(job_keywords) * 100, 2)
            if job_keywords
            else 100.0
        )

        breakdown = MatchScoreBreakdown(
            hard_requirements=hard_score,
            nice_to_have=nice_score,
            responsibilities=responsibility_score,
            keyword_alignment=keyword_score,
        )
        overall = round(
            breakdown.hard_requirements * 0.45
            + breakdown.nice_to_have * 0.2
            + breakdown.responsibilities * 0.2
            + breakdown.keyword_alignment * 0.15,
            2,
        )
        gaps = self._build_gaps(job, signals, missing_keywords)
        priorities = self._build_priorities(job, gaps, missing_keywords)

        return MatchProfile(
            overall_score=overall,
            score_breakdown=breakdown,
            evidence_mapping=evidence_mapping,
            gaps=gaps,
            priority_ranking=priorities,
            matched_keywords=matched_keywords,
            missing_keywords=missing_keywords,
            summary=_summary(overall, len(evidence_mapping), len(gaps)),
        )

    def _map_requirements(
        self,
        job: JobProfile,
        signals: list[ResumeSignal],
    ) -> list[MatchEvidence]:
        requirements = _unique(
            [
                *job.hard_requirements,
                *job.nice_to_have,
                *job.responsibilities,
                *job.tech_keywords,
                *job.hidden_keywords,
            ]
        )
        mapping: list[MatchEvidence] = []
        for requirement in requirements:
            score = self._score_requirement(requirement, signals)
            mapping.append(
                MatchEvidence(
                    requirement=requirement,
                    matched_resume_items=score.matched_items[:6],
                    missing_terms=score.missing_terms[:8],
                    evidence=score.evidence[:5],
                    confidence=round(score.score, 2),
                )
            )
        return mapping

    def _build_gaps(
        self,
        job: JobProfile,
        signals: list[ResumeSignal],
        missing_keywords: list[str],
    ) -> list[MatchGap]:
        gaps: list[MatchGap] = []
        for requirement in job.hard_requirements:
            score = self._score_requirement(requirement, signals)
            if score.score >= 0.72:
                continue
            severity = "high" if score.score < 0.45 else "medium"
            missing = ", ".join(score.missing_terms[:5]) or requirement
            gaps.append(
                MatchGap(
                    requirement=requirement,
                    severity=severity,
                    reason=f"Only {round(score.score * 100)}% of requirement terms are supported.",
                    suggested_action=f"Add truthful resume evidence for: {missing}.",
                )
            )

        hard_text = " ".join(job.hard_requirements).lower()
        known_gap_names = {gap.requirement.lower() for gap in gaps}
        for keyword in missing_keywords:
            if keyword.lower() not in hard_text:
                continue
            if keyword.lower() in known_gap_names:
                continue
            gaps.append(
                MatchGap(
                    requirement=f"Missing hard keyword: {keyword}",
                    severity="high",
                    reason=(
                        "The JD treats this keyword as a core requirement, but it is absent "
                        "from resume evidence."
                    ),
                    suggested_action=(
                        "If truthful, add a concrete project or experience bullet that proves "
                        f"{keyword}."
                    ),
                )
            )

        for requirement in [*job.nice_to_have, *job.responsibilities]:
            score = self._score_requirement(requirement, signals)
            if score.score < 0.5:
                gaps.append(
                    MatchGap(
                        requirement=requirement,
                        severity="low",
                        reason=(
                            f"Only {round(score.score * 100)}% of this supporting signal is "
                            "covered."
                        ),
                        suggested_action=(
                            "Consider adding concise supporting evidence if it matches real "
                            "experience."
                        ),
                    )
                )
        return gaps[:8]

    def _build_priorities(
        self,
        job: JobProfile,
        gaps: list[MatchGap],
        missing_keywords: list[str],
    ) -> list[MatchPriority]:
        hard_text = " ".join(job.hard_requirements).lower()
        priorities: list[MatchPriority] = []
        for gap in gaps:
            priority = (
                "P0" if gap.severity == "high" else "P1" if gap.severity == "medium" else "P2"
            )
            priorities.append(
                MatchPriority(
                    item=gap.requirement,
                    priority=priority,
                    reason=gap.reason,
                )
            )
        for keyword in missing_keywords:
            priorities.append(
                MatchPriority(
                    item=keyword,
                    priority="P0" if keyword.lower() in hard_text else "P1",
                    reason="Missing keyword from the current resume profile.",
                )
            )
        priority_order = {"P0": 0, "P1": 1, "P2": 2}
        deduped = []
        seen = set()
        for item in sorted(priorities, key=lambda priority: priority_order[priority.priority]):
            key = item.item.lower()
            if key in seen:
                continue
            seen.add(key)
            deduped.append(item)
        return deduped[:8]

    @staticmethod
    def _score_requirement(
        requirement: str,
        signals: list[ResumeSignal],
    ) -> RequirementScore:
        requirement_tokens = _tokens(requirement)
        if not requirement_tokens:
            return RequirementScore(1.0, [], [], [])

        matched_terms: set[str] = set()
        matched_items: list[str] = []
        evidence: list[EvidenceItem] = []
        for signal in signals:
            overlap = requirement_tokens & signal.tokens
            direct_match = _contains_phrase(requirement, signal.text)
            if not overlap and not direct_match:
                continue
            matched_terms.update(overlap)
            if direct_match:
                matched_terms.update(_tokens(signal.text) & requirement_tokens)
            matched_items.append(signal.text)
            evidence.extend(signal.evidence)

        score = len(matched_terms) / len(requirement_tokens)
        if matched_items and score < 0.34:
            score = 0.34
        missing_terms = sorted(requirement_tokens - matched_terms)
        return RequirementScore(
            score=min(1.0, round(score, 4)),
            matched_items=_unique(matched_items),
            missing_terms=missing_terms,
            evidence=_unique_evidence(evidence),
        )


def _resume_signals(profile: ResumeProfile) -> list[ResumeSignal]:
    signals: list[ResumeSignal] = []

    def add(field_path: str, text: str | None, evidence: list[EvidenceItem] | None = None) -> None:
        if not text:
            return
        token_set = _tokens(text)
        if not token_set:
            return
        source = text.strip()[:1000]
        signal_evidence = evidence or [
            EvidenceItem(field_path=field_path, source_text=source, confidence=0.66)
        ]
        signals.append(
            ResumeSignal(
                field_path=field_path,
                text=source,
                tokens=token_set,
                evidence=signal_evidence,
            )
        )

    for skill in profile.skills:
        matching_evidence = [
            item
            for item in profile.evidence
            if skill.lower() in item.source_text.lower() or item.field_path == "skills"
        ][:2]
        add("skills", skill, matching_evidence)
    for keyword in profile.keywords:
        add("keywords", keyword)
    for project in profile.projects:
        add("projects.name", project.name, project.evidence)
        add("projects.description", project.description, project.evidence)
        for skill in project.skills:
            add("projects.skills", skill, project.evidence)
    for experience in profile.experiences:
        add("experiences.title", experience.title, experience.evidence)
        add("experiences.company", experience.company, experience.evidence)
        add("experiences.description", experience.description, experience.evidence)
    for education in profile.education:
        add("education.school", education.school, education.evidence)
        add("education.degree", education.degree, education.evidence)
        add("education.major", education.major, education.evidence)
    return signals


def _keyword_alignment(
    keywords: list[str],
    signals: list[ResumeSignal],
) -> tuple[list[str], list[str]]:
    matched: list[str] = []
    missing: list[str] = []
    for keyword in keywords:
        keyword_tokens = _tokens(keyword)
        is_matched = any(
            (bool(keyword_tokens) and keyword_tokens <= signal.tokens)
            or _contains_phrase(signal.text, keyword)
            for signal in signals
        )
        if is_matched:
            matched.append(keyword)
        else:
            missing.append(keyword)
    return _unique(matched), _unique(missing)


def _tokens(text: str) -> set[str]:
    return {
        token
        for token in (_normalize(match.group(0)) for match in TOKEN_PATTERN.finditer(text))
        if token and token not in STOP_WORDS and len(token) > 1
    }


def _normalize(text: str) -> str:
    return text.strip().lower().replace("node.js", "node").replace("react.js", "react")


def _contains_phrase(haystack: str, needle: str) -> bool:
    normalized_haystack = _normalize(haystack)
    normalized_needle = _normalize(needle)
    return bool(normalized_needle) and (
        normalized_needle in normalized_haystack or normalized_haystack in normalized_needle
    )


def _average_score(scores: Iterable[float]) -> float:
    values = list(scores)
    if not values:
        return 100.0
    return round(sum(values) / len(values) * 100, 2)


def _unique(items: list[str]) -> list[str]:
    result = []
    seen = set()
    for item in items:
        normalized = item.strip()
        key = normalized.lower()
        if not normalized or key in seen:
            continue
        seen.add(key)
        result.append(normalized)
    return result


def _unique_evidence(items: list[EvidenceItem]) -> list[EvidenceItem]:
    result = []
    seen = set()
    for item in items:
        key = (item.field_path, item.source_text)
        if key in seen:
            continue
        seen.add(key)
        result.append(item)
    return result


def _summary(score: float, mapping_count: int, gap_count: int) -> str:
    if score >= 80:
        fit = "strong"
    elif score >= 60:
        fit = "promising"
    elif score >= 40:
        fit = "partial"
    else:
        fit = "weak"
    return (
        f"{fit.capitalize()} match: {score:.2f}/100 with {mapping_count} evidence mappings "
        f"and {gap_count} prioritized gap(s)."
    )
