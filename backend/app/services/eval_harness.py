from html import escape

from app.schemas.application import ApplicationRecord
from app.schemas.eval import (
    EvalArtifactType,
    EvalGateDecision,
    EvalReport,
    EvalReportSummary,
    EvalRuleResult,
    EvalRunRequest,
    QualityGateResult,
)
from app.schemas.interview import InterviewPack
from app.schemas.matching import MatchProfile
from app.schemas.parser import JobProfile, ResumeProfile
from app.schemas.rewrite import ResumeRewriteDraft
from app.services.run_store import new_id


class EvalReportStore:
    """Week9 in-memory report store.

    Production storage can later move to SQL tables together with run traces.
    """

    def __init__(self) -> None:
        self._reports: dict[str, EvalReport] = {}

    def save(self, report: EvalReport) -> EvalReport:
        self._reports[report.report_id] = report
        return report

    def get(self, report_id: str) -> EvalReport | None:
        return self._reports.get(report_id)

    def list(self, user_id: str | None = None) -> list[EvalReportSummary]:
        reports = self._reports.values()
        if user_id:
            reports = [report for report in reports if report.user_id == user_id]
        return [
            EvalReportSummary(
                report_id=report.report_id,
                case_name=report.case_name,
                judge_mode=report.judge_mode,
                overall_score=report.overall_score,
                decision=report.gate.decision,
                evaluated_artifacts=report.evaluated_artifacts,
                created_at=report.created_at,
            )
            for report in sorted(reports, key=lambda item: item.created_at, reverse=True)
        ]

    def clear(self) -> None:
        self._reports.clear()


class EvalHarness:
    """Week9 rule-based evaluation harness with a deterministic LLM-judge placeholder."""

    def evaluate(self, payload: EvalRunRequest) -> EvalReport:
        results: list[EvalRuleResult] = []
        artifacts: list[EvalArtifactType] = []

        if payload.resume_profile:
            artifacts.append("parser")
            results.extend(self._grade_resume(payload.resume_profile))
        if payload.job_profile:
            if "parser" not in artifacts:
                artifacts.append("parser")
            results.extend(self._grade_job(payload.job_profile))
        if payload.match_profile:
            artifacts.append("matching")
            results.extend(self._grade_match(payload.match_profile))
        if payload.rewrite_draft:
            artifacts.append("rewrite")
            results.extend(self._grade_rewrite(payload.rewrite_draft))
        if payload.interview_pack:
            artifacts.append("interview")
            results.extend(self._grade_interview(payload.interview_pack))
        if payload.application_record:
            artifacts.append("application")
            results.extend(self._grade_application(payload.application_record))

        results.extend(self._grade_expected_keywords(payload))
        results.extend(self._grade_required_sections(payload))

        if not results:
            results.append(
                self._rule(
                    "eval.no_artifacts",
                    "judge",
                    "至少提供一个待评估产物",
                    "failed",
                    "critical",
                    0,
                    "没有收到 W2-W8 的任何产物，无法执行质量评测。",
                )
            )

        if payload.judge_mode == "llm_as_judge_dry_run":
            artifacts.append("judge")
            results.append(self._dry_run_judge(results))

        overall_score = round(sum(result.score for result in results) / len(results), 2)
        gate = self._quality_gate(results, overall_score, payload.min_score)
        summary = self._summary(artifacts, gate, overall_score, results)
        report = EvalReport(
            report_id=new_id("eval"),
            user_id=payload.user_id,
            case_name=payload.case_name,
            judge_mode=payload.judge_mode,
            evaluated_artifacts=_unique(artifacts),
            overall_score=overall_score,
            gate=gate,
            rule_results=results,
            summary=summary,
            html_report="",
        )
        report.html_report = render_eval_html(report)
        return eval_report_store.save(report)

    def _grade_resume(self, resume: ResumeProfile) -> list[EvalRuleResult]:
        results = [
            self._rule(
                "parser.resume.skills",
                "parser",
                "简历技能覆盖",
                "passed" if resume.skills else "failed",
                "critical" if not resume.skills else "info",
                100 if resume.skills else 20,
                f"解析出 {len(resume.skills)} 个技能。",
                resume.skills[:8],
            ),
            self._rule(
                "parser.resume.projects",
                "parser",
                "项目经历覆盖",
                "passed" if resume.projects else "warning",
                "warning",
                100 if resume.projects else 55,
                f"解析出 {len(resume.projects)} 个项目经历。",
                [project.name for project in resume.projects[:4]],
            ),
            self._rule(
                "parser.resume.evidence",
                "parser",
                "简历证据链",
                "passed" if self._evidence_count(resume) >= 2 else "warning",
                "warning",
                min(100, 55 + self._evidence_count(resume) * 15),
                f"简历证据项数量：{self._evidence_count(resume)}。",
            ),
        ]
        if resume.needs_confirmation:
            results.append(
                self._rule(
                    "parser.resume.confirmation",
                    "parser",
                    "待确认字段",
                    "warning",
                    "warning",
                    max(50, 100 - len(resume.needs_confirmation) * 10),
                    "简历解析存在需要人工确认的字段。",
                    resume.needs_confirmation[:6],
                )
            )
        return results

    def _grade_job(self, job: JobProfile) -> list[EvalRuleResult]:
        has_identity = bool(job.company or job.title)
        requirement_count = len(job.hard_requirements) + len(job.responsibilities)
        return [
            self._rule(
                "parser.job.identity",
                "parser",
                "JD 基本信息",
                "passed" if has_identity else "warning",
                "warning",
                100 if has_identity else 60,
                f"公司：{job.company or '未识别'}；岗位：{job.title or '未识别'}。",
            ),
            self._rule(
                "parser.job.requirements",
                "parser",
                "JD 要求覆盖",
                "passed" if requirement_count >= 3 else "warning",
                "warning",
                min(100, 45 + requirement_count * 12),
                f"硬性要求和职责共 {requirement_count} 条。",
                (job.hard_requirements + job.responsibilities)[:8],
            ),
            self._rule(
                "parser.job.keywords",
                "parser",
                "JD 技术关键词",
                "passed" if job.tech_keywords else "warning",
                "warning",
                100 if job.tech_keywords else 55,
                f"解析出 {len(job.tech_keywords)} 个技术关键词。",
                job.tech_keywords[:8],
            ),
        ]

    def _grade_match(self, match: MatchProfile) -> list[EvalRuleResult]:
        high_gaps = [gap for gap in match.gaps if gap.severity == "high"]
        p0_items = {item.item.lower() for item in match.priority_ranking if item.priority == "P0"}
        uncovered_high = [
            gap.requirement
            for gap in high_gaps
            if not any(gap.requirement.lower() in item for item in p0_items)
        ]
        return [
            self._rule(
                "match.score.range",
                "matching",
                "匹配分范围",
                "passed",
                "info",
                match.overall_score,
                f"当前匹配分：{match.overall_score:.2f}/100。",
            ),
            self._rule(
                "match.evidence.mapping",
                "matching",
                "证据映射",
                "passed" if match.evidence_mapping else "failed",
                "critical" if not match.evidence_mapping else "info",
                100 if match.evidence_mapping else 25,
                f"证据映射数量：{len(match.evidence_mapping)}。",
            ),
            self._rule(
                "match.gap.priority",
                "matching",
                "高优先级缺口",
                "passed" if not uncovered_high else "warning",
                "warning",
                100 if not uncovered_high else 62,
                "高风险缺口需要进入 P0 改写或补强优先级。",
                uncovered_high[:6],
            ),
        ]

    def _grade_rewrite(self, draft: ResumeRewriteDraft) -> list[EvalRuleResult]:
        unsupported = [
            change
            for change in draft.changes
            if change.section != "evidence_needed" and not change.evidence
        ]
        high_risk = [change for change in draft.changes if change.risk_level == "high"]
        keyword_count = len(draft.target_keywords)
        return [
            self._rule(
                "rewrite.evidence.lock",
                "rewrite",
                "证据锁定改写",
                "passed" if not unsupported else "failed",
                "critical",
                100 if not unsupported else max(0, 100 - len(unsupported) * 35),
                "每条正式改写都必须有证据；缺证据内容只能进入 evidence_needed。",
                [change.revised_text for change in unsupported[:5]],
            ),
            self._rule(
                "rewrite.risk",
                "rewrite",
                "风险改写控制",
                "passed" if not high_risk else "warning",
                "warning",
                100 if not high_risk else max(40, 100 - len(high_risk) * 20),
                f"高风险改写数量：{len(high_risk)}。",
                [change.section for change in high_risk],
            ),
            self._rule(
                "rewrite.keyword.stuffing",
                "rewrite",
                "关键词堆砌检查",
                "passed" if keyword_count <= 12 else "warning",
                "warning",
                100 if keyword_count <= 12 else 65,
                f"目标关键词数量：{keyword_count}。",
                draft.target_keywords[:12],
            ),
            self._rule(
                "rewrite.markdown",
                "rewrite",
                "导出内容结构",
                "passed" if len(draft.markdown.strip()) >= 80 else "warning",
                "warning",
                100 if len(draft.markdown.strip()) >= 80 else 58,
                "改写草稿需要包含可审阅 Markdown。",
            ),
        ]

    def _grade_interview(self, pack: InterviewPack) -> list[EvalRuleResult]:
        warning_count = len(pack.evidence_warnings)
        return [
            self._rule(
                "interview.questions",
                "interview",
                "预测题覆盖",
                "passed" if len(pack.predicted_questions) >= 4 else "warning",
                "warning",
                min(100, 45 + len(pack.predicted_questions) * 12),
                f"预测题数量：{len(pack.predicted_questions)}。",
            ),
            self._rule(
                "interview.project.followups",
                "interview",
                "项目追问覆盖",
                "passed" if pack.project_followups else "warning",
                "warning",
                100 if pack.project_followups else 55,
                f"项目追问数量：{len(pack.project_followups)}。",
            ),
            self._rule(
                "interview.star",
                "interview",
                "STAR 草稿",
                "passed" if pack.star_answers else "warning",
                "warning",
                100 if pack.star_answers else 55,
                f"STAR 草稿数量：{len(pack.star_answers)}。",
            ),
            self._rule(
                "interview.evidence.warnings",
                "interview",
                "面试真实性提醒",
                "passed" if warning_count <= 3 else "warning",
                "warning",
                max(45, 100 - warning_count * 12),
                f"证据提醒数量：{warning_count}。",
                pack.evidence_warnings[:6],
            ),
        ]

    def _grade_application(self, record: ApplicationRecord) -> list[EvalRuleResult]:
        open_tasks = [task for task in record.tasks if task.status == "OPEN"]
        return [
            self._rule(
                "application.identity",
                "application",
                "投递目标",
                "passed" if record.company or record.title else "warning",
                "warning",
                100 if record.company or record.title else 60,
                f"公司：{record.company or '未记录'}；岗位：{record.title or '未记录'}。",
            ),
            self._rule(
                "application.memory",
                "application",
                "长期记忆",
                "passed" if record.memories else "warning",
                "warning",
                min(100, 45 + len(record.memories) * 9),
                f"记忆数量：{len(record.memories)}。",
            ),
            self._rule(
                "application.tasks",
                "application",
                "下一步任务",
                "passed" if open_tasks else "warning",
                "warning",
                min(100, 50 + len(open_tasks) * 16),
                f"打开任务数量：{len(open_tasks)}。",
            ),
            self._rule(
                "application.trace",
                "application",
                "来源 Run 关联",
                "passed" if record.source_run_ids else "warning",
                "warning",
                100 if record.source_run_ids else 55,
                f"关联 run 数量：{len(record.source_run_ids)}。",
                record.source_run_ids[:6],
            ),
        ]

    def _grade_expected_keywords(self, payload: EvalRunRequest) -> list[EvalRuleResult]:
        if not payload.expected_keywords:
            return []

        surface = " ".join(
            [
                " ".join(payload.resume_profile.skills) if payload.resume_profile else "",
                " ".join(payload.job_profile.tech_keywords) if payload.job_profile else "",
                " ".join(payload.match_profile.matched_keywords) if payload.match_profile else "",
                " ".join(payload.rewrite_draft.target_keywords) if payload.rewrite_draft else "",
                " ".join(payload.interview_pack.target_keywords) if payload.interview_pack else "",
                (
                    " ".join(payload.application_record.target_keywords)
                    if payload.application_record
                    else ""
                ),
            ]
        ).lower()
        missed = [
            keyword
            for keyword in payload.expected_keywords
            if keyword.lower() not in surface
        ]
        return [
            self._rule(
                "eval.expected_keywords",
                "judge",
                "期望关键词覆盖",
                "passed" if not missed else "warning",
                "warning",
                100 if not missed else max(45, 100 - len(missed) * 12),
                "检查用户指定关键词是否出现在评测产物中。",
                missed,
            )
        ]

    def _grade_required_sections(self, payload: EvalRunRequest) -> list[EvalRuleResult]:
        if not payload.required_sections or not payload.rewrite_draft:
            return []
        sections = {change.section for change in payload.rewrite_draft.changes}
        missed = [
            section
            for section in payload.required_sections
            if section not in sections and section not in payload.rewrite_draft.markdown
        ]
        return [
            self._rule(
                "eval.required_sections",
                "judge",
                "必需章节覆盖",
                "passed" if not missed else "warning",
                "warning",
                100 if not missed else max(50, 100 - len(missed) * 15),
                "检查改写草稿是否覆盖用户指定章节。",
                missed,
            )
        ]

    def _dry_run_judge(self, results: list[EvalRuleResult]) -> EvalRuleResult:
        failed = [result for result in results if result.status == "failed"]
        warnings = [result for result in results if result.status == "warning"]
        if failed:
            status = "failed"
            severity = "critical"
            score = 45
            message = "LLM-as-judge dry-run 判定：存在阻断级失败，不能进入正式导出。"
        elif len(warnings) >= 4:
            status = "warning"
            severity = "warning"
            score = 72
            message = "LLM-as-judge dry-run 判定：质量可用但仍需人工复核。"
        else:
            status = "passed"
            severity = "info"
            score = 92
            message = "LLM-as-judge dry-run 判定：规则评测结果稳定，可进入人工确认。"
        return self._rule(
            "judge.llm_dry_run",
            "judge",
            "LLM-as-judge dry-run",
            status,
            severity,
            score,
            message,
        )

    def _quality_gate(
        self,
        results: list[EvalRuleResult],
        overall_score: float,
        min_score: float,
    ) -> QualityGateResult:
        blocking = [
            result.message
            for result in results
            if result.status == "failed" and result.severity == "critical"
        ]
        warnings = [result.message for result in results if result.status == "warning"]
        if blocking or overall_score < max(0, min_score - 10):
            decision: EvalGateDecision = "BLOCK"
        elif warnings or overall_score < min_score:
            decision = "WARN"
        else:
            decision = "PASS"

        release_notes = [
            "规则评测完成，报告已保存。",
            "正式投递材料仍需人工确认真实性。",
        ]
        if decision == "BLOCK":
            release_notes.append("QualityGate 已阻断正式导出或投递使用。")
        elif decision == "WARN":
            release_notes.append("QualityGate 允许继续，但建议先处理警告项。")
        else:
            release_notes.append("QualityGate 通过，可进入人工审批或导出流程。")

        return QualityGateResult(
            decision=decision,
            passed=decision != "BLOCK",
            score=overall_score,
            blocking_reasons=blocking,
            warnings=warnings,
            release_notes=release_notes,
        )

    @staticmethod
    def _summary(
        artifacts: list[EvalArtifactType],
        gate: QualityGateResult,
        score: float,
        results: list[EvalRuleResult],
    ) -> str:
        failed = sum(1 for result in results if result.status == "failed")
        warnings = sum(1 for result in results if result.status == "warning")
        return (
            f"评测 {len(_unique(artifacts))} 类产物，整体分 {score:.2f}/100，"
            f"QualityGate={gate.decision}，失败 {failed} 项，警告 {warnings} 项。"
        )

    @staticmethod
    def _evidence_count(resume: ResumeProfile) -> int:
        return (
            len(resume.evidence)
            + sum(len(project.evidence) for project in resume.projects)
            + sum(len(item.evidence) for item in resume.education)
            + sum(len(item.evidence) for item in resume.experiences)
        )

    @staticmethod
    def _rule(
        rule_id: str,
        category: EvalArtifactType,
        name: str,
        status: str,
        severity: str,
        score: float,
        message: str,
        evidence: list[str] | None = None,
    ) -> EvalRuleResult:
        return EvalRuleResult(
            rule_id=rule_id,
            category=category,
            name=name,
            status=status,
            severity=severity,
            score=round(max(0, min(100, score)), 2),
            message=message,
            evidence=evidence or [],
        )


def render_eval_html(report: EvalReport) -> str:
    rows = "\n".join(
        f"""
        <tr class="{escape(result.status)}">
          <td>{escape(result.category)}</td>
          <td>{escape(result.name)}</td>
          <td>{escape(result.status)}</td>
          <td>{escape(result.severity)}</td>
          <td>{result.score:.2f}</td>
          <td>{escape(result.message)}</td>
        </tr>
        """
        for result in report.rule_results
    )
    blocking = "".join(f"<li>{escape(item)}</li>" for item in report.gate.blocking_reasons)
    warnings = "".join(f"<li>{escape(item)}</li>" for item in report.gate.warnings[:12])
    return f"""<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>{escape(report.case_name)} - CareerPilot Eval Report</title>
  <style>
    body {{
      margin: 0;
      color: #122332;
      background: linear-gradient(135deg, #f7fbff 0%, #e8f7ef 48%, #e7f1ff 100%);
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", sans-serif;
    }}
    main {{ max-width: 1120px; margin: 0 auto; padding: 48px 28px; }}
    .hero, section {{
      border: 1px solid rgba(255, 255, 255, 0.72);
      border-radius: 18px;
      background: rgba(255, 255, 255, 0.66);
      box-shadow: 0 24px 80px rgba(46, 74, 91, 0.13);
      backdrop-filter: blur(18px);
      padding: 28px;
      margin-bottom: 20px;
    }}
    .eyebrow {{
      color: #6c8290;
      font-size: 13px;
      text-transform: uppercase;
      letter-spacing: 0.08em;
    }}
    h1 {{ margin: 8px 0 10px; font-size: 42px; }}
    .score {{ font-size: 60px; font-weight: 800; }}
    .decision {{
      display: inline-flex;
      padding: 8px 14px;
      border-radius: 999px;
      background: #e8f4ec;
      color: #12633a;
      font-weight: 800;
    }}
    .decision.BLOCK {{ background: #fff0ec; color: #a03520; }}
    .decision.WARN {{ background: #fff5dc; color: #875000; }}
    table {{ width: 100%; border-collapse: collapse; overflow: hidden; border-radius: 14px; }}
    th, td {{
      padding: 13px 14px;
      border-bottom: 1px solid rgba(91, 117, 133, 0.15);
      text-align: left;
      vertical-align: top;
    }}
    th {{ color: #5a7080; font-size: 13px; }}
    tr.failed td {{ background: rgba(255, 108, 73, 0.08); }}
    tr.warning td {{ background: rgba(255, 193, 92, 0.08); }}
    ul {{ margin: 10px 0 0; padding-left: 22px; }}
  </style>
</head>
<body>
  <main>
    <div class="hero">
      <p class="eyebrow">CareerPilot Week9 Eval Harness</p>
      <h1>{escape(report.case_name)}</h1>
      <p>{escape(report.summary)}</p>
      <div class="score">{report.overall_score:.2f}</div>
      <span class="decision {escape(report.gate.decision)}">{escape(report.gate.decision)}</span>
    </div>
    <section>
      <h2>QualityGate</h2>
      <p>通过状态：{escape("通过" if report.gate.passed else "阻断")}</p>
      <h3>阻断原因</h3>
      <ul>{blocking or "<li>无</li>"}</ul>
      <h3>警告</h3>
      <ul>{warnings or "<li>无</li>"}</ul>
    </section>
    <section>
      <h2>规则明细</h2>
      <table>
        <thead>
          <tr>
            <th>类别</th>
            <th>规则</th>
            <th>状态</th>
            <th>级别</th>
            <th>分数</th>
            <th>说明</th>
          </tr>
        </thead>
        <tbody>{rows}</tbody>
      </table>
    </section>
  </main>
</body>
</html>"""


def _unique(values: list[EvalArtifactType]) -> list[EvalArtifactType]:
    seen: set[EvalArtifactType] = set()
    result: list[EvalArtifactType] = []
    for value in values:
        if value not in seen:
            result.append(value)
            seen.add(value)
    return result


eval_report_store = EvalReportStore()
eval_harness = EvalHarness()
