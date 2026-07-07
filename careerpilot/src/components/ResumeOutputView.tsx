import React, { useState } from 'react';
import {
  MatchReport,
  RewriteDraft,
  InterviewPack,
  LoopRun
} from '../types';
import {
  FileText,
  AlertTriangle,
  CheckCircle2,
  Download,
  Zap,
  Bookmark,
  ChevronRight,
  BookOpen,
  UserCheck,
  ShieldAlert,
  Printer,
  Loader2,
  RefreshCw
} from 'lucide-react';

interface ResumeOutputViewProps {
  matchReport: MatchReport | null;
  rewriteDraft: RewriteDraft | null;
  interviewPack: InterviewPack | null;
  onApproveDraft?: () => void;
  draftApproved?: boolean;
  activeRun: LoopRun | null;
}

export default function ResumeOutputView({
  matchReport,
  rewriteDraft,
  interviewPack,
  onApproveDraft,
  draftApproved,
  activeRun
}: ResumeOutputViewProps) {
  const [activeTab, setActiveTab] = useState<'match' | 'rewrite' | 'interview'>('match');

  // Auto switch tab when activeRun changes state or a step becomes RUNNING
  React.useEffect(() => {
    if (!activeRun) return;
    const runningStep = activeRun.steps.find(s => s.status === 'RUNNING');
    if (runningStep) {
      if (runningStep.step_id === 'step_2' || runningStep.step_id === 'step_3') {
        setActiveTab('match');
      } else if (runningStep.step_id === 'step_4') {
        setActiveTab('rewrite');
      } else if (runningStep.step_id === 'step_5') {
        setActiveTab('interview');
      }
    } else if (activeRun.state === 'WAITING_APPROVAL') {
      setActiveTab('rewrite');
    }
  }, [activeRun]);

  const getStepStatus = (tab: 'match' | 'rewrite' | 'interview') => {
    if (tab === 'match' && matchReport) return 'COMPLETED';
    if (tab === 'rewrite' && rewriteDraft) return 'COMPLETED';
    if (tab === 'interview' && interviewPack) return 'COMPLETED';

    if (!activeRun) {
      return 'IDLE';
    }

    // If activeRun exists, let's check steps:
    if (tab === 'match') {
      const s2 = activeRun.steps.find(s => s.step_id === 'step_2');
      const s3 = activeRun.steps.find(s => s.step_id === 'step_3');
      if (s2?.status === 'RUNNING' || s3?.status === 'RUNNING') return 'RUNNING';
      if (s2?.status === 'COMPLETED' && s3?.status === 'COMPLETED') return 'COMPLETED';
      return 'PENDING';
    }
    if (tab === 'rewrite') {
      const s4 = activeRun.steps.find(s => s.step_id === 'step_4');
      if (s4?.status === 'RUNNING') return 'RUNNING';
      if (s4?.status === 'COMPLETED') return 'COMPLETED';
      if (activeRun.state === 'WAITING_APPROVAL') return 'COMPLETED';
      return 'PENDING';
    }
    if (tab === 'interview') {
      const s5 = activeRun.steps.find(s => s.step_id === 'step_5');
      if (s5?.status === 'RUNNING') return 'RUNNING';
      if (s5?.status === 'COMPLETED') return 'COMPLETED';
      return 'PENDING';
    }
    return 'PENDING';
  };

  const renderTabHeader = (tab: 'match' | 'rewrite' | 'interview', label: string, emoji: string) => {
    const status = getStepStatus(tab);
    let badge = null;
    if (status === 'COMPLETED') {
      badge = <span className="ml-1.5 text-[10px] bg-emerald-500/10 text-emerald-600 border border-emerald-500/20 px-1.5 py-0.5 rounded-full font-bold">已就绪</span>;
    } else if (status === 'RUNNING') {
      badge = (
        <span className="ml-1.5 text-[10px] bg-indigo-500/10 text-indigo-600 border border-indigo-500/20 px-1.5 py-0.5 rounded-full font-bold flex items-center gap-1">
          <Loader2 className="w-2.5 h-2.5 animate-spin" /> 生成中
        </span>
      );
    } else {
      badge = <span className="ml-1.5 text-[10px] bg-slate-100 text-slate-500 border border-slate-200 px-1.5 py-0.5 rounded-full font-medium">等待中</span>;
    }

    return (
      <button
        onClick={() => setActiveTab(tab)}
        className={`px-4 py-2.5 text-xs md:text-sm font-bold rounded-lg transition-all flex items-center ${
          activeTab === tab
            ? 'bg-indigo-500/10 text-indigo-600 shadow-sm border border-indigo-500/25'
            : 'text-slate-500 hover:text-slate-700'
        }`}
      >
        <span>{emoji} {label}</span>
        {badge}
      </button>
    );
  };

  const renderLoadingState = (tab: 'match' | 'rewrite' | 'interview') => {
    const status = getStepStatus(tab);
    
    let title = "";
    let description = "";
    let icon = null;

    if (tab === 'match') {
      title = "正在全方位审计岗位契合度与真实证据链...";
      description = "分析大模型求职应用中对 FastAPI、RAG 以及 PostgreSQL 调优的真实匹配度，过滤所有不实与夸大陈述。";
      icon = <RefreshCw className="w-10 h-10 text-indigo-650 animate-spin" />;
    } else if (tab === 'rewrite') {
      title = "正在改写证据，进行岗位故事抛光与合规审查...";
      description = "设计低、中、高三重技术修饰评估级别，保证在绝不虚构的前提下最大化凸显实战技术优势。";
      icon = <Zap className="w-10 h-10 text-amber-500 animate-pulse" />;
    } else {
      title = "正在精细打磨真实大厂面试高频预测与通关包...";
      description = "预测面试官可能针对你的项目进行的最难、最容易露馅的问题，并配以极致量化的 STAR 陈述话术。";
      icon = <BookOpen className="w-10 h-10 text-indigo-500 animate-bounce" />;
    }

    if (status === 'PENDING' || status === 'IDLE') {
      return (
        <div className="flex flex-col items-center justify-center py-16 px-4 text-center bg-white/30 border border-dashed border-slate-300 rounded-2xl">
          <div className="p-4 bg-slate-100 rounded-full mb-4 animate-bounce shadow-sm">
            <Bookmark className="w-8 h-8 text-slate-500" />
          </div>
          <h4 className="font-bold text-slate-700 text-sm mb-1">等待工作流激活该模块</h4>
          <p className="text-xs text-slate-500 max-w-md leading-relaxed">
            此步骤处于队列等待中。点击上方的启动按钮，CareerPilot 会自动在后台流式流转到该流程并为您呈现结果。
          </p>
        </div>
      );
    }

    return (
      <div className="bg-white/40 border border-slate-200 rounded-2xl p-8 flex flex-col items-center justify-center text-center space-y-6 shadow-inner">
        <div className="p-4 bg-white border border-slate-150 rounded-full shadow-md">
          {icon}
        </div>
        
        <div className="space-y-1.5 max-w-lg">
          <h4 className="font-extrabold text-slate-800 text-sm md:text-base flex items-center justify-center gap-2">
            {title}
          </h4>
          <p className="text-xs text-slate-500 leading-relaxed">
            {description}
          </p>
        </div>

        {/* Dynamic Progress Bar */}
        <div className="w-full max-w-md bg-slate-100 rounded-full h-2.5 overflow-hidden relative border border-slate-200">
          <div className="bg-gradient-to-r from-indigo-500 via-indigo-600 to-emerald-500 h-full animate-progress rounded-full w-full" />
        </div>

        <div className="flex items-center gap-2 text-[10px] font-mono text-slate-500">
          <Loader2 className="w-3.5 h-3.5 animate-spin text-indigo-600" />
          <span>正在流式注入 Gemini 3.5-flash 大模型算力中... 预计需要几秒钟</span>
        </div>
      </div>
    );
  };

  if (!matchReport && !rewriteDraft && !interviewPack && !activeRun) {
    return null;
  }

  return (
    <div className="bg-white/45 backdrop-blur-xl border border-white/70 shadow-xl rounded-2xl p-6 md:p-8 space-y-6 text-slate-800">
      
      {/* Navigation tabs */}
      <div className="flex border-b border-slate-200 pb-3 justify-between items-center max-sm:flex-col gap-4">
        <div className="flex bg-white/65 p-1 rounded-xl gap-1 border border-slate-200 shadow-sm">
          {renderTabHeader('match', '岗位匹配与证据审计', '📊')}
          {renderTabHeader('rewrite', '证据改写 & 导出 (回路)', '✍️')}
          {renderTabHeader('interview', '真实场景面试通关包', '🎯')}
        </div>

        {/* Action icons */}
        {activeTab === 'rewrite' && rewriteDraft && (
          <div className="flex items-center gap-2">
            <a
              href="/api/rewrite-drafts/active/export.md"
              download
              className="px-3 py-1.5 bg-white hover:bg-slate-50 text-slate-700 font-medium rounded-lg text-xs transition-colors inline-flex items-center gap-1.5 border border-slate-200 shadow-sm"
            >
              <Download className="w-3.5 h-3.5 text-indigo-600" /> 导出 MD
            </a>
            <a
              href="/api/rewrite-drafts/active/export.pdf"
              target="_blank"
              rel="noreferrer"
              className="px-3 py-1.5 bg-indigo-50 hover:bg-indigo-100 text-indigo-600 font-medium rounded-lg text-xs transition-colors inline-flex items-center gap-1.5 border border-indigo-200 shadow-sm"
            >
              <Printer className="w-3.5 h-3.5 text-indigo-600" /> 打印 / PDF
            </a>
          </div>
        )}
      </div>

      {/* MATCH REPORT TAB */}
      {activeTab === 'match' && (
        matchReport ? (
          <div className="space-y-6 animate-fade-in">
            {/* Main Score & stats */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 items-center bg-white/40 border border-slate-200 p-6 rounded-2xl shadow-sm">
              <div className="text-center md:border-r border-slate-200 pr-4">
                <span className="text-xs text-slate-500 block uppercase font-bold tracking-wider">岗位契合度</span>
                <span className="text-5xl font-extrabold text-indigo-600 block my-1 font-sans">{matchReport.score}%</span>
                <span className="text-xs bg-indigo-50 text-indigo-600 border border-indigo-200 font-bold px-2.5 py-0.5 rounded-full inline-block">
                  {matchReport.level}
                </span>
              </div>

              <div className="col-span-2 space-y-3">
                <h4 className="font-bold text-sm text-slate-800">匹配分析概要</h4>
                <p className="text-xs text-slate-600 leading-relaxed">
                  依据“证据锁定”算法：你的简历真实支撑了岗位的核心开发环境与大模型交互。但是，在特定的关系型数据库高级索引以及两阶段 React 架构上存在着证据断层，建议在改写中予以技术故事补充。
                </p>
              </div>
            </div>

            {/* Evidence mappings */}
            <div>
              <h4 className="font-bold text-sm text-slate-800 mb-3 flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-600" /> 岗位指标 - 简历原文双向追溯表
              </h4>
              <div className="overflow-x-auto border border-slate-200 rounded-xl bg-white/30 shadow-sm">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-slate-50 border-b border-slate-200 text-[11px] text-slate-600 font-bold uppercase tracking-wider">
                      <th className="p-3">岗位核心招聘指标</th>
                      <th className="p-3">简历锁定之真实证据</th>
                      <th className="p-3 text-center">置信度</th>
                      <th className="p-3 text-center">属性</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-150 text-xs">
                    {matchReport.evidence_mappings.map((ev, i) => (
                      <tr key={i} className="hover:bg-white/50 transition-colors">
                        <td className="p-3 font-bold text-slate-800 w-1/3">{ev.requirement}</td>
                        <td className="p-3 text-slate-600 italic">{ev.resume_evidence}</td>
                        <td className="p-3 text-center">
                          <span className={`font-mono font-bold ${ev.confidence > 80 ? 'text-emerald-600' : 'text-amber-600'}`}>
                            {ev.confidence}%
                          </span>
                        </td>
                        <td className="p-3 text-center">
                          <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${ev.is_inferred ? 'bg-amber-50 text-amber-600 border border-amber-200' : 'bg-emerald-50 text-emerald-600 border border-emerald-200'}`}>
                            {ev.is_inferred ? '合理推论' : '原文锁定'}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Gaps checklist */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <h4 className="font-bold text-sm text-slate-800 mb-3 flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 text-amber-600" /> 能力缺口与证据深度检测
                </h4>
                <div className="space-y-2.5">
                  {matchReport.gaps.map((gp, i) => (
                    <div key={i} className="p-3 rounded-xl border border-slate-250 bg-white/40 hover:border-slate-300 transition-all space-y-1.5 shadow-sm">
                      <div className="flex items-center justify-between">
                        <span className="font-bold text-xs text-slate-800">{gp.gap_type}</span>
                        <span className={`text-[10px] px-2 py-0.5 rounded font-bold border ${
                          gp.gap_type === '真实缺失' ? 'bg-rose-50 text-rose-600 border-rose-200' :
                          gp.gap_type === '表达缺失' ? 'bg-indigo-50 text-indigo-600 border-indigo-200' : 'bg-amber-50 text-amber-600 border-amber-200'
                        }`}>
                          {gp.gap_type}
                        </span>
                      </div>
                      <p className="text-xs text-slate-600 leading-relaxed">{gp.description}</p>
                    </div>
                  ))}
                </div>
              </div>

              {/* Rewrite priorities */}
              <div>
                <h4 className="font-bold text-sm text-slate-800 mb-3 flex items-center gap-2">
                  <Zap className="w-4 h-4 text-indigo-600" /> 补强与改写高优先方向
                </h4>
                <ul className="space-y-2 text-xs text-slate-600">
                  {matchReport.rewrite_priorities.map((item, i) => (
                    <li key={i} className="flex gap-2.5 items-start bg-white/40 p-3 rounded-xl border border-slate-200 shadow-sm">
                      <span className="flex-shrink-0 w-5 h-5 rounded-full bg-indigo-50 text-indigo-600 flex items-center justify-center font-bold font-mono text-[10px] border border-indigo-200 shadow-sm">
                        {i + 1}
                      </span>
                      <span className="leading-relaxed text-slate-600">{item}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </div>
        ) : renderLoadingState('match')
      )}

      {/* REWRITE DRAFT TAB */}
      {activeTab === 'rewrite' && (
        rewriteDraft ? (
          <div className="space-y-6 animate-fade-in">
            {/* Headline and info header */}
            <div className="p-4 bg-indigo-500/5 text-indigo-750 rounded-xl text-xs flex items-center justify-between border border-indigo-500/20">
              <div className="flex items-center gap-2">
                <UserCheck className="w-4 h-4 text-indigo-600" />
                <span>
                  <strong>中文求职投递稿已完成改写。</strong> 经历已经由“岗位叙事表达抛光”，不捏造任何背景。
                </span>
              </div>
              
              {onApproveDraft && (
                <button
                  onClick={onApproveDraft}
                  disabled={draftApproved}
                  className={`px-3 py-1 rounded-md text-xs font-bold shadow-md transition-all ${
                    draftApproved
                      ? 'bg-emerald-50 text-emerald-600 border border-emerald-200'
                      : 'bg-indigo-600 hover:bg-indigo-700 text-white'
                  }`}
                >
                  {draftApproved ? '✓ 已经批准该简历' : '批准无捏造/通过'}
                </button>
              )}
            </div>

            <div className="border border-slate-200 rounded-2xl p-6 bg-white/40 shadow-inner">
              <div className="text-center pb-4 mb-4 border-b border-slate-200">
                <h3 className="font-extrabold text-xl text-slate-900">{rewriteDraft.headline.split('|')[0] || '简历稿'}</h3>
                <p className="text-xs text-slate-500 mt-1 font-mono font-medium">{rewriteDraft.headline}</p>
              </div>

              <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 italic text-xs text-slate-600 leading-relaxed mb-6 shadow-sm">
                <strong className="text-slate-800 block not-italic font-bold mb-1">个人特写/摘要描述:</strong>
                {rewriteDraft.summary}
              </div>

              <div className="space-y-5">
                {rewriteDraft.sections.map((sec, i) => (
                  <div key={i} className="space-y-2">
                    <h4 className="font-bold text-xs uppercase tracking-wider text-slate-500">{sec.title}</h4>
                    <div className="bg-white border border-slate-200 rounded-xl p-4 text-xs text-slate-700 leading-relaxed font-sans whitespace-pre-line shadow-sm">
                      {sec.content}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Changes log */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <h4 className="font-bold text-sm text-slate-800 mb-3">🛠️ 改写痕迹审计日志 (Trace Commit)</h4>
                <div className="space-y-3 text-xs">
                  {rewriteDraft.changes.map((ch, i) => (
                    <div key={i} className="p-3 bg-white/40 border border-slate-200 rounded-xl space-y-2 shadow-sm">
                      <div className="flex justify-between items-center text-[10px] font-bold">
                        <span className="text-slate-500">板块: {ch.field}</span>
                        <span className="text-indigo-600 bg-indigo-50 border border-indigo-200 px-2 py-0.5 rounded">改写理由</span>
                      </div>
                      <div className="grid grid-cols-2 gap-2 text-[10.5px]">
                        <div className="bg-rose-50/50 p-2 rounded border border-rose-100 text-slate-500">
                          <span className="block font-bold mb-0.5 text-rose-600">原文:</span>
                          {ch.before}
                        </div>
                        <div className="bg-indigo-50 p-2 rounded border border-indigo-100 text-slate-700">
                          <span className="block font-bold mb-0.5 text-indigo-600">改写后:</span>
                          {ch.after}
                        </div>
                      </div>
                      <p className="text-[10px] text-slate-500 italic pt-1 border-t border-slate-100">{ch.reason}</p>
                    </div>
                  ))}
                </div>
              </div>

              {/* Rewrite risks */}
              <div>
                <h4 className="font-bold text-sm text-slate-800 mb-3 flex items-center gap-2">
                  <ShieldAlert className="w-4 h-4 text-rose-600" /> 高低修饰风险审核闸口 (Risk Gate)
                </h4>
                <div className="space-y-2.5 text-xs">
                  {rewriteDraft.risks.map((risk, i) => (
                    <div
                      key={i}
                      className={`p-3.5 rounded-xl border flex gap-3 shadow-sm ${
                        risk.risk_level === 'HIGH' ? 'bg-rose-50 border-rose-200 text-rose-700' :
                        risk.risk_level === 'MEDIUM' ? 'bg-amber-50 border-amber-200 text-amber-700' :
                        'bg-white border-slate-200 text-slate-750'
                      }`}
                    >
                      <AlertTriangle className={`w-4.5 h-4.5 flex-shrink-0 mt-0.5 ${
                        risk.risk_level === 'HIGH' ? 'text-rose-600' :
                        risk.risk_level === 'MEDIUM' ? 'text-amber-600' : 'text-slate-500'
                      }`} />
                      <div>
                        <div className="font-bold text-xs flex items-center gap-1.5">
                          修饰级别: {risk.risk_level}
                        </div>
                        <p className="text-[11px] text-slate-600 mt-1 leading-relaxed">{risk.description}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        ) : renderLoadingState('rewrite')
      )}

      {/* INTERVIEW COACH TAB */}
      {activeTab === 'interview' && (
        interviewPack ? (
          <div className="space-y-6 animate-fade-in">
            {/* Score Header */}
            <div className="p-4 bg-emerald-50 text-emerald-700 rounded-2xl border border-emerald-200 flex flex-col md:flex-row items-center gap-4 justify-between shadow-sm">
              <div className="flex items-center gap-3">
                <div className="p-2.5 bg-emerald-100 text-emerald-700 rounded-xl font-bold font-mono text-xl border border-emerald-300 shadow-sm">
                  {interviewPack.readiness_score}%
                </div>
                <div>
                  <h4 className="font-bold text-sm text-slate-800">大厂面试就绪度评估</h4>
                  <p className="text-xs text-emerald-600">你的硬核 RAG 经历能够完美招架主流考点，细节需精细润色。</p>
                </div>
              </div>
              
              <div className="flex items-center gap-2 text-[10.5px] font-bold bg-emerald-50 border border-emerald-200 px-3 py-1 rounded-lg text-emerald-700 shadow-sm">
                <BookOpen className="w-3.5 h-3.5 text-emerald-600" /> STAR 结构化讲法推荐
              </div>
            </div>

            {/* Predicted questions */}
            <div>
              <h4 className="font-bold text-sm text-slate-800 mb-3 flex items-center gap-2">
                <Zap className="w-4 h-4 text-amber-600" /> 大厂技术面试深度预测问答
              </h4>
              
              <div className="space-y-4">
                {interviewPack.predicted_questions.map((pq, i) => (
                  <div key={i} className="border border-slate-200 rounded-xl p-4 bg-white/40 hover:border-slate-300 transition-all space-y-3 shadow-sm">
                    <div>
                      <span className="text-[10px] uppercase font-bold text-indigo-600 tracking-wider">预测考题 {i + 1}</span>
                      <h5 className="font-bold text-slate-800 text-sm mt-0.5 leading-relaxed">{pq.question}</h5>
                      <p className="text-[10.5px] text-slate-500 italic mt-1">考官意图: {pq.intent}</p>
                    </div>

                    {/* STAR Answer suggestion */}
                    <div className="bg-slate-50 rounded-lg p-3 border border-slate-250/80 space-y-2 shadow-inner">
                      <span className="text-[10px] font-bold text-slate-650 bg-white px-1.5 py-0.5 border border-slate-200 rounded">STAR 模型标准陈述套路</span>
                      
                      <div className="grid grid-cols-1 md:grid-cols-4 gap-3 text-[11px] pt-1">
                        <div className="border-r border-slate-200 pr-2">
                          <strong className="text-slate-500 block uppercase text-[9px] tracking-wider mb-0.5">S · 背景 (Situation)</strong>
                          <span className="text-slate-600">{pq.star_suggested_answer.situation}</span>
                        </div>
                        <div className="border-r border-slate-200 pr-2">
                          <strong className="text-slate-500 block uppercase text-[9px] tracking-wider mb-0.5">T · 目标 (Task)</strong>
                          <span className="text-slate-600">{pq.star_suggested_answer.task}</span>
                        </div>
                        <div className="border-r border-slate-200 pr-2">
                          <strong className="text-slate-500 block uppercase text-[9px] tracking-wider mb-0.5">A · 行动 (Action)</strong>
                          <span className="text-slate-600">{pq.star_suggested_answer.action}</span>
                        </div>
                        <div>
                          <strong className="text-slate-500 block uppercase text-[9px] tracking-wider mb-0.5">R · 成果 (Result)</strong>
                          <span className="text-slate-600">{pq.star_suggested_answer.result}</span>
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Project Followups */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <h4 className="font-bold text-sm text-slate-800 mb-3 flex items-center gap-2">
                  <Bookmark className="w-4 h-4 text-indigo-600" /> 原文项目细节深度追问防露馅
                </h4>
                <div className="space-y-3 text-xs">
                  {interviewPack.project_followups.map((pf, i) => (
                    <div key={i} className="p-3 border border-slate-200 bg-white/40 hover:border-slate-300 transition-all rounded-xl space-y-1.5 shadow-sm">
                      <span className="font-bold text-[10px] text-indigo-600 bg-indigo-50 border border-indigo-200 px-2 py-0.5 rounded shadow-sm inline-block">
                        项目: {pf.project_name}
                      </span>
                      <h5 className="font-bold text-slate-800 leading-relaxed text-xs">{pf.question}</h5>
                      <p className="text-[10.5px] text-slate-500">{pf.reference_point}</p>
                    </div>
                  ))}
                </div>
              </div>

              {/* Warnings and Frameworks */}
              <div className="space-y-4">
                <div>
                  <h4 className="font-bold text-sm text-slate-850 mb-2">💡 面试必背高级话术框架</h4>
                  <ul className="space-y-2 text-xs text-slate-600 leading-relaxed">
                    {interviewPack.answer_frameworks.map((fram, i) => (
                      <li key={i} className="flex gap-2 items-start">
                        <ChevronRight className="w-3.5 h-3.5 text-indigo-600 mt-0.5 flex-shrink-0" />
                        <span>{fram}</span>
                      </li>
                    ))}
                  </ul>
                </div>

                <div>
                  <h4 className="font-bold text-sm text-rose-600 mb-2">⚠️ 防踩坑诚信审计警告</h4>
                  <ul className="space-y-2 text-xs text-rose-700/80 leading-relaxed">
                    {interviewPack.truthfulness_warnings.map((warn, i) => (
                      <li key={i} className="flex gap-2 items-start bg-rose-50 p-2.5 rounded-lg border border-rose-200 shadow-sm">
                        <AlertTriangle className="w-4 h-4 text-rose-600 mt-0.5 flex-shrink-0" />
                        <span>{warn}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            </div>
          </div>
        ) : renderLoadingState('interview')
      )}

    </div>
  );
}
