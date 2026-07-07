import type {
  Application,
  EvalReport,
  InterviewPack,
  JobProfile,
  LoopRun,
  MatchReport,
  RewriteDraft,
  RewriteRisk,
  ResumeProfile
} from './types';

const asArray = <T = any>(value: unknown): T[] => (Array.isArray(value) ? (value as T[]) : []);

const textOf = (value: any): string => {
  if (!value) return '';
  if (typeof value === 'string') return value;
  const parts = [
    value.school,
    value.degree,
    value.major,
    value.company,
    value.title,
    value.name,
    value.description,
    value.source_text
  ].filter(Boolean);
  return parts.join(' · ');
};

const unique = (values: unknown[]): string[] => {
  const seen = new Set<string>();
  const output: string[] = [];
  values.forEach((value) => {
    const text = String(value ?? '').trim();
    if (!text || seen.has(text)) return;
    seen.add(text);
    output.push(text);
  });
  return output;
};

const scoreOf = (value: unknown): number => {
  const num = Number(value ?? 0);
  if (!Number.isFinite(num)) return 0;
  return Math.max(0, Math.min(100, Math.round(num)));
};

export function normalizeResumeProfile(profile: any): ResumeProfile {
  if (!profile) {
    return { education: [], skills: [], projects: [], experiences: [], keywords: [] };
  }
  const projects = asArray<any>(profile.projects).map((project) => {
    if (typeof project === 'string') return project;
    const title = project.name ? `${project.name}` : '';
    const desc = project.description ? `${project.description}` : '';
    return [title, desc].filter(Boolean).join('：');
  });
  const experiences = asArray<any>(profile.experiences).map((exp) => {
    if (typeof exp === 'string') return exp;
    return [exp.company, exp.title, exp.description].filter(Boolean).join(' · ');
  });
  return {
    education: asArray(profile.education).map(textOf).filter(Boolean),
    skills: unique(asArray(profile.skills)),
    projects: projects.filter(Boolean),
    experiences: experiences.filter(Boolean),
    keywords: unique([...(profile.keywords ?? []), ...(profile.skills ?? [])])
  };
}

export function normalizeJobProfile(profile: any): JobProfile {
  if (!profile) {
    return {
      company: '',
      title: '',
      hard_requirements: [],
      nice_to_have: [],
      responsibilities: [],
      keywords: []
    };
  }
  const hard = unique(asArray(profile.hard_requirements));
  const nice = unique(asArray(profile.nice_to_have));
  const responsibilities = unique(asArray(profile.responsibilities));
  return {
    company: profile.company ?? '',
    title: profile.title ?? '',
    hard_requirements: hard,
    nice_to_have: nice,
    responsibilities,
    keywords: unique([
      ...(profile.keywords ?? []),
      ...(profile.tech_keywords ?? []),
      ...(profile.hidden_keywords ?? []),
      ...hard.flatMap((item) => String(item).split(/[、,，/ ]+/)),
      ...nice.flatMap((item) => String(item).split(/[、,，/ ]+/))
    ])
  };
}

export function normalizeMatchReport(match: any): MatchReport {
  const score = scoreOf(match?.score ?? match?.overall_score);
  return {
    score,
    level: score >= 75 ? '强匹配' : score >= 50 ? '部分匹配' : '匹配较弱',
    evidence_mappings: asArray<any>(match?.evidence_mappings ?? match?.evidence_mapping).map((item) => ({
      requirement: item.requirement ?? '岗位要求',
      resume_evidence: asArray(item.matched_resume_items).join('；') || asArray(item.evidence).map(textOf).join('；') || '暂无直接证据',
      confidence: scoreOf(Number(item.confidence ?? 0) <= 1 ? Number(item.confidence ?? 0) * 100 : item.confidence),
      is_inferred: Boolean(item.is_inferred)
    })),
    gaps: asArray<any>(match?.gaps).map((gap) => ({
      gap_type: gap.severity === 'high' ? '真实缺失' : gap.severity === 'medium' ? '证据不足' : '表达缺失',
      description: [gap.requirement, gap.reason, gap.suggested_action].filter(Boolean).join('：')
    })),
    rewrite_priorities: asArray<any>(match?.rewrite_priorities ?? match?.priority_ranking).map((item) =>
      typeof item === 'string'
        ? item
        : [item.priority, item.item, item.reason].filter(Boolean).join(' · ')
    )
  };
}

const sectionContent = (value: unknown): string => {
  if (Array.isArray(value)) {
    return value
      .map((item) => {
        if (typeof item === 'string') return item;
        if (item?.name && Array.isArray(item?.bullets)) return `${item.name}\n${item.bullets.map((line: string) => `- ${line}`).join('\n')}`;
        return textOf(item);
      })
      .filter(Boolean)
      .join('\n');
  }
  return String(value ?? '');
};

export function normalizeRewriteDraft(draft: any): RewriteDraft {
  const tailored = draft?.tailored_resume ?? {};
  const changes = asArray<any>(draft?.changes);
  const risks: RewriteRisk[] = [
    ...asArray<string>(draft?.risk_warnings).map((warning) => ({
      risk_level: 'MEDIUM' as const,
      description: warning
    })),
    ...changes
      .filter((change) => ['medium', 'high'].includes(change.risk_level))
      .map((change) => ({
        risk_level: String(change.risk_level).toUpperCase() as RewriteRisk['risk_level'],
        description: `${change.section ?? '改写'}：${change.rationale ?? '需要人工确认'}`
      }))
  ];
  return {
    headline: tailored.headline ?? draft?.headline ?? '中文投递稿',
    summary: tailored.summary ?? '',
    sections: [
      { title: '个人概要', content: tailored.summary ?? '', original: '', modified: Boolean(tailored.summary) },
      { title: '技能', content: sectionContent(tailored.skills), original: '', modified: true },
      { title: '项目经历', content: sectionContent(tailored.projects), original: '', modified: true },
      { title: '实习经历', content: sectionContent(tailored.experiences), original: '', modified: true },
      { title: '教育经历', content: sectionContent(tailored.education), original: '', modified: true },
      { title: '证据说明', content: tailored.evidence_notice ?? '所有内容均基于原始简历证据。', original: '', modified: false }
    ].filter((section) => section.content),
    changes: changes.map((change) => ({
      field: change.section ?? '改写项',
      before: change.original_text ?? '',
      after: change.revised_text ?? '',
      reason: change.rationale ?? ''
    })),
    risks
  };
}

export function normalizeInterviewPack(pack: any): InterviewPack {
  const starAnswers = asArray<any>(pack?.star_answers);
  return {
    readiness_score: scoreOf(pack?.readiness_score ?? pack?.mock_score?.overall_score),
    predicted_questions: asArray<any>(pack?.predicted_questions).map((question, index) => {
      const star = starAnswers[index] ?? {};
      return {
        question: question.question ?? '',
        intent: question.why_asked ?? question.suggested_angle ?? '',
        star_suggested_answer: {
          situation: star.situation ?? '',
          task: star.task ?? '',
          action: star.action ?? '',
          result: star.result ?? ''
        }
      };
    }),
    project_followups: asArray<any>(pack?.project_followups).map((item) => ({
      project_name: item.project_name ?? '',
      question: item.question ?? '',
      reference_point: item.probe_focus ?? ''
    })),
    answer_frameworks: [
      ...starAnswers.map((item) => item.prompt).filter(Boolean),
      ...asArray<any>(pack?.knowledge_points).map((item) => item.review_prompt).filter(Boolean),
      ...asArray<string>(pack?.answer_frameworks)
    ],
    truthfulness_warnings: asArray<string>(pack?.evidence_warnings),
    needs_practice: unique([
      ...asArray<string>(pack?.mock_score?.next_actions),
      ...asArray<any>(pack?.knowledge_points)
        .filter((item) => item.current_signal !== 'covered')
        .map((item) => item.topic)
    ])
  };
}

const normalizeApplicationStatus = (status: string): Application['status'] => {
  const normalized = String(status ?? '').toLowerCase();
  if (normalized === 'ready_to_apply' || normalized === 'saved') return 'ready_to_apply';
  if (normalized === 'applied') return 'applied';
  if (normalized === 'interviewing') return 'interviewing';
  if (normalized === 'offer') return 'offer';
  return 'rejected';
};

export function normalizeApplications(payload: any): Application[] {
  return asArray<any>(payload).map((item) => {
    const record = item.record ?? item;
    return {
      id: record.id ?? record.application_id ?? '',
      company: record.company ?? '',
      title: record.title ?? '',
      resume_run_id: record.resume_run_id ?? '',
      match_run_id: record.match_run_id ?? '',
      interview_pack_run_id: record.interview_pack_run_id ?? '',
      status: normalizeApplicationStatus(record.status),
      notes: record.notes ?? '',
      memory: asArray<any>(record.memories)[0]?.text,
      created_at: record.created_at ?? new Date().toISOString()
    };
  });
}

export function normalizeCostSummary(payload: any): { runCount: number; totalTokens: number; totalCost: number } {
  return {
    runCount: Number(payload?.tracked_runs ?? payload?.run_count ?? 0),
    totalTokens: Number(payload?.total_tokens_consumed ?? payload?.total_tokens ?? 0),
    totalCost: Number(payload?.total_cost_cny ?? payload?.estimated_cost_cny ?? 0)
  };
}

const normalizeLoopState = (state: string): LoopRun['state'] => {
  const normalized = String(state ?? '').toUpperCase();
  if (normalized === 'PLANNING' || normalized === 'APPROVED') return 'RUNNING';
  if (normalized === 'REJECTED') return 'FAILED';
  if (['CREATED', 'RUNNING', 'WAITING_APPROVAL', 'COMPLETED', 'FAILED'].includes(normalized)) {
    return normalized as LoopRun['state'];
  }
  return 'CREATED';
};

const normalizeStepStatus = (status: string): 'PENDING' | 'RUNNING' | 'COMPLETED' | 'FAILED' => {
  const normalized = String(status ?? '').toUpperCase();
  if (normalized === 'SUCCEEDED' || normalized === 'SKIPPED') return 'COMPLETED';
  if (normalized === 'ERROR') return 'FAILED';
  if (['PENDING', 'RUNNING', 'COMPLETED', 'FAILED'].includes(normalized)) return normalized as any;
  return 'PENDING';
};

export function normalizeLoopRun(payload: any): LoopRun {
  const run = payload?.run ?? payload ?? {};
  return {
    run_id: run.run_id ?? '',
    goal: run.goal ?? '',
    state: normalizeLoopState(run.state),
    steps: asArray<any>(run.steps).map((step) => ({
      step_id: step.step_id ?? '',
      name: step.name ?? '',
      status: normalizeStepStatus(step.status),
      started_at: step.started_at,
      completed_at: step.completed_at,
      output_summary: step.output_summary ?? step.input_summary
    })),
    events: asArray<any>(run.events).map((event) => ({
      timestamp: event.timestamp ?? event.created_at ?? new Date().toISOString(),
      level: event.level ?? (event.event_type === 'ERROR' ? 'error' : 'info'),
      message: event.message ?? event.event_type ?? ''
    })),
    cost_summary: {
      token_count: Number(run.cost_summary?.token_count ?? payload?.total_tokens ?? run.total_tokens ?? 0),
      cost_cny: Number(run.cost_summary?.cost_cny ?? payload?.total_cost_cny ?? run.total_cost_cny ?? 0),
      latency_ms: Number(run.cost_summary?.latency_ms ?? 0)
    },
    user_id: run.user_id ?? 'local-user'
  };
}

const normalizeEvalGate = (gate: string): EvalReport['gate'] => {
  const normalized = String(gate ?? '').toUpperCase();
  if (normalized === 'BLOCK' || normalized === 'FAIL') return 'FAIL';
  if (normalized === 'WARN') return 'WARN';
  return 'PASS';
};

export function normalizeEvalReport(report: any): EvalReport {
  const items = asArray<any>(report?.items ?? report?.rule_results).map((item) => {
    const status = String(item.status ?? '').toLowerCase();
    return {
      check_name: item.check_name ?? item.name ?? item.rule_id ?? '',
      status: status === 'failed' ? 'FAIL' as const : status === 'warning' ? 'WARN' as const : 'PASS' as const,
      description: item.description ?? item.message ?? ''
    };
  });
  return {
    report_id: report?.report_id ?? '',
    score: scoreOf(report?.score ?? report?.overall_score),
    gate: normalizeEvalGate(report?.gate?.decision ?? report?.gate),
    passed: items.filter((item) => item.status === 'PASS').length,
    warnings: items.filter((item) => item.status === 'WARN').length,
    failures: items.filter((item) => item.status === 'FAIL').length,
    items
  };
}
