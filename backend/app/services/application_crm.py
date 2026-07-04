from datetime import UTC, datetime

from app.schemas.application import (
    ApplicationCreateRequest,
    ApplicationMemory,
    ApplicationRecord,
    ApplicationStatus,
    ApplicationTask,
    FeedbackCreateRequest,
    InterviewFeedback,
)
from app.schemas.interview import InterviewPack
from app.schemas.matching import MatchGap, MatchProfile
from app.schemas.parser import JobProfile, ResumeProfile
from app.schemas.rewrite import ResumeRewriteDraft
from app.services.run_store import new_id


class ApplicationStore:
    """Week8 in-memory application CRM store.

    This is intentionally simple for the Week8 slice. It gives the API and frontend a real
    application/memory surface while keeping database migration for production polish.
    """

    def __init__(self) -> None:
        self._records: dict[str, ApplicationRecord] = {}

    def save(self, record: ApplicationRecord) -> ApplicationRecord:
        record.updated_at = datetime.now(UTC)
        self._records[record.application_id] = record
        return record

    def get(self, application_id: str) -> ApplicationRecord | None:
        return self._records.get(application_id)

    def list(self, user_id: str | None = None) -> list[ApplicationRecord]:
        records = self._records.values()
        if user_id:
            records = [record for record in records if record.user_id == user_id]
        return sorted(records, key=lambda item: item.updated_at, reverse=True)

    def clear(self) -> None:
        self._records.clear()


class ApplicationCRMAgent:
    """Week8 Memory + Application CRM agent.

    The agent converts prior CareerPilot artifacts into a durable application record. It tracks
    what happened, what the user should do next, and what the system should remember next time.
    """

    def __init__(self, store: ApplicationStore) -> None:
        self.store = store

    def create_record(self, payload: ApplicationCreateRequest) -> ApplicationRecord:
        record = ApplicationRecord(
            application_id=new_id("application"),
            user_id=payload.user_id,
            company=payload.job_profile.company,
            title=payload.job_profile.title,
            job_url=payload.job_url,
            status=payload.status,
            match_score=(
                round(payload.match_profile.overall_score, 2) if payload.match_profile else None
            ),
            interview_score=(
                round(payload.interview_pack.mock_score.overall_score, 2)
                if payload.interview_pack
                else None
            ),
            resume_headline=payload.rewrite_draft.headline if payload.rewrite_draft else None,
            target_keywords=_target_keywords(
                payload.job_profile,
                payload.resume_profile,
                payload.match_profile,
                payload.rewrite_draft,
                payload.interview_pack,
            ),
            notes=payload.notes,
            source_run_ids=payload.source_run_ids,
        )
        record.memories = _create_initial_memories(
            payload.resume_profile,
            payload.job_profile,
            payload.match_profile,
            payload.interview_pack,
        )
        record.tasks = _create_next_tasks(
            payload.match_profile,
            payload.rewrite_draft,
            payload.interview_pack,
            payload.status,
        )
        return self.store.save(record)

    def add_feedback(
        self,
        record: ApplicationRecord,
        payload: FeedbackCreateRequest,
    ) -> ApplicationRecord:
        feedback = InterviewFeedback(
            feedback_id=new_id("feedback"),
            stage=payload.stage,
            feedback_text=payload.feedback_text,
            strengths=_clean_many(payload.strengths),
            concerns=_clean_many(payload.concerns),
            follow_up_tasks=_clean_many(payload.follow_up_tasks),
        )
        record.feedback.append(feedback)
        if record.status in {"SAVED", "READY_TO_APPLY", "APPLIED"}:
            record.status = "INTERVIEWING"

        record.memories.extend(_feedback_memories(feedback))
        record.tasks.extend(_feedback_tasks(feedback))
        record.memories = _dedupe_memories(record.memories)
        record.tasks = _dedupe_tasks(record.tasks)
        return self.store.save(record)

    def update_status(
        self,
        record: ApplicationRecord,
        status: ApplicationStatus,
        notes: str | None = None,
    ) -> ApplicationRecord:
        record.status = status
        if notes:
            record.notes = notes
            record.memories.append(
                ApplicationMemory(
                    memory_id=new_id("memory"),
                    category="follow_up",
                    text=f"状态更新备注：{notes}",
                    source="status_update",
                    confidence=0.8,
                )
            )
        return self.store.save(record)


def _create_initial_memories(
    resume: ResumeProfile | None,
    job: JobProfile,
    match: MatchProfile | None,
    interview: InterviewPack | None,
) -> list[ApplicationMemory]:
    memories: list[ApplicationMemory] = []
    if resume and resume.skills:
        memories.append(
            ApplicationMemory(
                memory_id=new_id("memory"),
                category="strength",
                text=f"本次投递的核心技能信号：{'、'.join(resume.skills[:8])}。",
                source="resume_profile",
                confidence=0.76,
                evidence=resume.evidence[:4],
            )
        )
    if match and match.matched_keywords:
        memories.append(
            ApplicationMemory(
                memory_id=new_id("memory"),
                category="strength",
                text=f"目标岗位已匹配关键词：{'、'.join(match.matched_keywords[:8])}。",
                source="match_profile",
                confidence=0.82,
            )
        )
    if match:
        for gap in match.gaps[:4]:
            memories.append(_gap_memory(gap))
    if interview:
        for action in interview.mock_score.next_actions[:4]:
            memories.append(
                ApplicationMemory(
                    memory_id=new_id("memory"),
                    category="follow_up",
                    text=action,
                    source="interview_pack",
                    confidence=0.74,
                )
            )
    if not job.hard_requirements:
        memories.append(
            ApplicationMemory(
                memory_id=new_id("memory"),
                category="gap",
                text="当前岗位 JD 缺少明确硬性要求，后续需要补充更完整 JD。",
                source="job_profile",
                confidence=0.72,
            )
        )
    return _dedupe_memories(memories)


def _create_next_tasks(
    match: MatchProfile | None,
    rewrite: ResumeRewriteDraft | None,
    interview: InterviewPack | None,
    status: ApplicationStatus,
) -> list[ApplicationTask]:
    tasks: list[ApplicationTask] = []
    if status in {"SAVED", "READY_TO_APPLY"}:
        tasks.append(
            ApplicationTask(
                task_id=new_id("task"),
                title="确认岗位信息和投递材料",
                reason="投递前需要确认 JD、简历草稿和证据链没有过期。",
                priority="P0",
                due_hint="投递前",
            )
        )
    if rewrite and rewrite.approval_status != "APPROVED":
        tasks.append(
            ApplicationTask(
                task_id=new_id("task"),
                title="审批简历改写草稿",
                reason="未审批的改写草稿不能作为正式投递材料。",
                priority="P0",
                due_hint="投递前",
            )
        )
    if match:
        for priority in match.priority_ranking[:4]:
            tasks.append(
                ApplicationTask(
                    task_id=new_id("task"),
                    title=f"补强 {priority.item}",
                    reason=priority.reason,
                    priority=priority.priority,
                    due_hint="下次修改简历前",
                )
            )
    if interview:
        for action in interview.mock_score.next_actions[:4]:
            tasks.append(
                ApplicationTask(
                    task_id=new_id("task"),
                    title=action[:80],
                    reason="来自 InterviewCoachAgent 的面试准备建议。",
                    priority="P1",
                    due_hint="面试前",
                )
            )
    return _dedupe_tasks(tasks)[:10]


def _feedback_memories(feedback: InterviewFeedback) -> list[ApplicationMemory]:
    memories = [
        ApplicationMemory(
            memory_id=new_id("memory"),
            category="feedback",
            text=f"{feedback.stage}反馈：{feedback.feedback_text}",
            source="interview_feedback",
            confidence=0.84,
        )
    ]
    memories.extend(
        ApplicationMemory(
            memory_id=new_id("memory"),
            category="strength",
            text=f"面试正向信号：{item}",
            source="interview_feedback",
            confidence=0.8,
        )
        for item in feedback.strengths
    )
    memories.extend(
        ApplicationMemory(
            memory_id=new_id("memory"),
            category="gap",
            text=f"面试暴露问题：{item}",
            source="interview_feedback",
            confidence=0.82,
        )
        for item in feedback.concerns
    )
    return memories


def _feedback_tasks(feedback: InterviewFeedback) -> list[ApplicationTask]:
    return [
        ApplicationTask(
            task_id=new_id("task"),
            title=item,
            reason=f"来自 {feedback.stage} 面试反馈。",
            priority="P0",
            due_hint="下一轮面试前",
        )
        for item in feedback.follow_up_tasks
    ]


def _gap_memory(gap: MatchGap) -> ApplicationMemory:
    return ApplicationMemory(
        memory_id=new_id("memory"),
        category="gap",
        text=f"{gap.requirement}: {gap.suggested_action}",
        source="match_gap",
        confidence=0.8 if gap.severity == "high" else 0.72,
    )


def _target_keywords(
    job: JobProfile,
    resume: ResumeProfile | None,
    match: MatchProfile | None,
    rewrite: ResumeRewriteDraft | None,
    interview: InterviewPack | None,
) -> list[str]:
    values: list[str] = []
    if rewrite:
        values.extend(rewrite.target_keywords)
    if interview:
        values.extend(interview.target_keywords)
    if match:
        values.extend(match.matched_keywords)
        values.extend(match.missing_keywords)
    values.extend(job.tech_keywords)
    values.extend(job.hidden_keywords)
    if resume:
        values.extend(resume.skills)
    return _unique(value.strip() for value in values if value and value.strip())[:14]


def _clean_many(values: list[str]) -> list[str]:
    return _unique(value.strip() for value in values if value and value.strip())


def _unique(values) -> list[str]:
    result: list[str] = []
    seen = set()
    for value in values:
        key = value.lower()
        if key in seen:
            continue
        seen.add(key)
        result.append(value)
    return result


def _dedupe_memories(memories: list[ApplicationMemory]) -> list[ApplicationMemory]:
    result: list[ApplicationMemory] = []
    seen = set()
    for memory in memories:
        key = (memory.category, memory.text.lower())
        if key in seen:
            continue
        seen.add(key)
        result.append(memory)
    return result[:20]


def _dedupe_tasks(tasks: list[ApplicationTask]) -> list[ApplicationTask]:
    result: list[ApplicationTask] = []
    seen = set()
    for task in tasks:
        key = (task.title.lower(), task.priority)
        if key in seen:
            continue
        seen.add(key)
        result.append(task)
    return result[:20]


application_store = ApplicationStore()
application_crm_agent = ApplicationCRMAgent(application_store)
