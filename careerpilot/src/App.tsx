import React, { useState, useEffect, useRef } from 'react';
import {
  Sparkles,
  Plus,
  ArrowUp,
  Cpu,
  Coins,
  Play,
  Volume2,
  Settings,
  HelpCircle,
  FileText,
  Bookmark,
  ChevronRight,
  Terminal,
  Activity,
  AlertTriangle,
  Loader2,
  RefreshCw,
  FileUp,
  AlertCircle
} from 'lucide-react';

import MusicPlayer from './components/MusicPlayer';
import ProviderBalanceModal from './components/ProviderBalanceModal';
import DemoVideoModal from './components/DemoVideoModal';
import ResumeOutputView from './components/ResumeOutputView';
import QualityGateReport from './components/QualityGateReport';
import CrmTracker from './components/CrmTracker';
import PhysicsFloatingRails from './components/PhysicsFloatingRails';
import InteractiveBackground from './components/InteractiveBackground';
import {
  normalizeApplications,
  normalizeCostSummary,
  normalizeEvalReport,
  normalizeInterviewPack,
  normalizeJobProfile,
  normalizeLoopRun,
  normalizeMatchReport,
  normalizeResumeProfile,
  normalizeRewriteDraft
} from './apiCompat';

import {
  ResumeProfile,
  JobProfile,
  MatchReport,
  RewriteDraft,
  InterviewPack,
  Application,
  EvalReport,
  LoopRun,
  LoopStep,
  LoopEvent
} from './types';

export default function App() {
  // Input fields (preloaded for immediate clickable playability)
  const [resumeText, setResumeText] = useState(`# 真实个人经历与材料 (张三)

【教育背景】
南京大学 - 软件工程本科 (2023 - 2027)

【核心技能】
- 掌握 Python 与 TypeScript，理解常用数据结构与算法
- 熟悉使用 FastAPI 编写高性能 RESTful 业务接口
- 了解 PostgreSQL 数据库的基本维护与 SQL 常用检索
- 了解 Prompt 工程与 RAG (检索增强生成) 应用基本概念

【核心项目】
1. 智能简历解析助手 (2024.03 - 2024.06)
- 独立使用 Python 和 FastAPI 搭建的个人求职简历检索助手。
- 完成大模型调用框架的对接，通过 Prompt 进行部分字段提取。
- 使用 Redis 做查询结果缓存，让接口的高频复查延迟降低了 40%。
- 运用 React 写了简易的可视化展示页面。

【实习与社团】
南京极客工作室 - 后端开发实习生 (2024.09 - 至今)
- 负责内部工具后端的多项业务模块开发。
- 维护 PostgreSQL 常规业务表，协助进行部分慢查询 API 的解耦和升级。`);

  const [jobText, setJobText] = useState(`公司名称：星河智能科技
岗位名称：AI Agent 全栈开发实习生
岗位地点：苏州/远程

【岗位职责】
1. 负责求职 Agent 平台后端核心业务模块设计与 Express/FastAPI API 开发；
2. 负责编写结构化、高稳定性的 Prompt 交互逻辑，确保大模型输出稳定的 JSON；
3. 协同前端团队进行全栈功能联调，参与部分核心组件的体验优化。

【任职要求】
1. 熟练掌握 Python 或 Node.js 开发，熟悉 FastAPI、Express 等后端主流框架；
2. 熟悉 RAG (检索增强生成) 核心流程，或有 LLM 大模型接口调用开发经验优先；
3. 熟悉关系型数据库（如 PostgreSQL/MySQL）并有实际性能调优经验者优先；
4. 熟悉 React/Vite 前端开发者加分。`);

  // Server data / Generation results
  const [resumeProfile, setResumeProfile] = useState<ResumeProfile | null>(null);
  const [jobProfile, setJobProfile] = useState<JobProfile | null>(null);
  const [matchReport, setMatchReport] = useState<MatchReport | null>(null);
  const [rewriteDraft, setRewriteDraft] = useState<RewriteDraft | null>(null);
  const [interviewPack, setInterviewPack] = useState<InterviewPack | null>(null);
  const [applications, setApplications] = useState<Application[]>([]);
  const [evalReport, setEvalReport] = useState<EvalReport | null>(null);
  const [loopRuns, setLoopRuns] = useState<LoopRun[]>([]);
  const [rawResumeProfile, setRawResumeProfile] = useState<any>(null);
  const [rawJobProfile, setRawJobProfile] = useState<any>(null);
  const [rawMatchProfile, setRawMatchProfile] = useState<any>(null);
  const [rawRewriteDraft, setRawRewriteDraft] = useState<any>(null);
  const [rawInterviewPack, setRawInterviewPack] = useState<any>(null);

  // Active loop run details
  const [activeRun, setActiveRun] = useState<LoopRun | null>(null);
  const [isLoopLoading, setIsLoopLoading] = useState(false);
  const [isActionLoading, setIsActionLoading] = useState(false);
  const [approvalNote, setApprovalNote] = useState('我已仔细核对改写后的专业技能与 RAG 项目，无任何凭空捏造经历，改写符合真实情况。批准该版本投递简历。');
  const [draftApproved, setDraftApproved] = useState(false);

  // Top header stats (corresponding to Mockup 2 metrics)
  const [runCount, setRunCount] = useState(0);
  const [runStatus, setRunStatus] = useState('空闲');
  const [totalTokens, setTotalTokens] = useState(0);
  const [totalCost, setTotalCost] = useState(0);

  // Floating controls modals
  const [isBalanceOpen, setIsBalanceOpen] = useState(false);
  const [isDemoOpen, setIsDemoOpen] = useState(false);

  // File Upload states
  const [isUploading, setIsUploading] = useState<{ resume: boolean; job: boolean }>({ resume: false, job: false });
  const [uploadError, setUploadError] = useState<{ resume: string | null; job: string | null }>({ resume: null, job: null });
  const [isDragging, setIsDragging] = useState<{ resume: boolean; job: boolean }>({ resume: false, job: false });

  const consoleRef = useRef<HTMLDivElement | null>(null);

  // Set isLandingFinished to always true so we boot straight into the console
  const isLandingFinished = true;

  // File Upload processor using FileReader and server OCR extraction
  const handleFileUpload = async (file: File, type: 'resume' | 'job') => {
    setUploadError(prev => ({ ...prev, [type]: null }));
    const nameLower = file.name.toLowerCase();
    
    // 1. Handle plain text / markdown / txt files directly on client side
    if (nameLower.endsWith('.md') || nameLower.endsWith('.txt')) {
      const reader = new FileReader();
      reader.onload = (e) => {
        const text = e.target?.result as string;
        if (type === 'resume') {
          setResumeText(text);
        } else {
          setJobText(text);
        }
      };
      reader.onerror = () => {
        setUploadError(prev => ({ ...prev, [type]: '读取文件失败，请重试。' }));
      };
      reader.readAsText(file);
      return;
    }

    // 2. Handle PDF, JPG, PNG, JPEG via backend OCR extraction
    const allowedExtensions = ['.pdf', '.jpg', '.jpeg', '.png'];
    const isAllowed = allowedExtensions.some(ext => nameLower.endsWith(ext));
    if (!isAllowed) {
      setUploadError(prev => ({ ...prev, [type]: '不支持的文件格式。请上传 PDF, Markdown, TXT 或 JPG/PNG 图片。' }));
      return;
    }

    setIsUploading(prev => ({ ...prev, [type]: true }));

    const reader = new FileReader();
    reader.onload = async (e) => {
      const base64Data = e.target?.result as string;
      try {
        const res = await fetch('/api/extract-text', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            fileBase64: base64Data,
            mimeType: file.type || (nameLower.endsWith('.pdf') ? 'application/pdf' : 'image/jpeg'),
            fileName: file.name
          })
        });

        if (!res.ok) {
          const errData = await res.json();
          throw new Error(errData.error || errData.detail || '解析失败');
        }

        const data = await res.json();
        if (type === 'resume') {
          setResumeText(data.text);
        } else {
          setJobText(data.text);
        }
      } catch (err: any) {
        console.error('File extraction error:', err);
        setUploadError(prev => ({ ...prev, [type]: `文件内容提取失败: ${err.message || '网络或大模型服务忙，请重试。'}` }));
      } finally {
        setIsUploading(prev => ({ ...prev, [type]: false }));
      }
    };

    reader.onerror = () => {
      setUploadError(prev => ({ ...prev, [type]: '读取文件失败，请重试。' }));
      setIsUploading(prev => ({ ...prev, [type]: false }));
    };

    reader.readAsDataURL(file);
  };

  const handleDragOver = (e: React.DragEvent, type: 'resume' | 'job') => {
    e.preventDefault();
    setIsDragging(prev => ({ ...prev, [type]: true }));
  };

  const handleDragLeave = (e: React.DragEvent, type: 'resume' | 'job') => {
    e.preventDefault();
    setIsDragging(prev => ({ ...prev, [type]: false }));
  };

  const handleDrop = (e: React.DragEvent, type: 'resume' | 'job') => {
    e.preventDefault();
    setIsDragging(prev => ({ ...prev, [type]: false }));
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      handleFileUpload(e.dataTransfer.files[0], type);
    }
  };

  // Fetch initial DB entries
  const initFetch = async () => {
    try {
      // Applications
      const appRes = await fetch('/api/applications');
      if (appRes.ok) {
        const apps = await appRes.json();
        setApplications(normalizeApplications(apps));
      }

      // Cost summary
      const costRes = await fetch('/api/production/cost-summary');
      if (costRes.ok) {
        const costData = await costRes.json();
        const summary = normalizeCostSummary(costData);
        setRunCount(summary.runCount);
        setTotalTokens(summary.totalTokens);
        setTotalCost(summary.totalCost);
      }
    } catch (e) {
      console.warn('Initial server state fetch failed', e);
    }
  };

  useEffect(() => {
    initFetch();
  }, []);

  // Poll current active run details if executing to sync frontend UI gracefully
  useEffect(() => {
    let timer: NodeJS.Timeout;
    if (activeRun && (activeRun.state === 'RUNNING' || activeRun.state === 'CREATED')) {
      setRunStatus('运行中');
      timer = setInterval(async () => {
        try {
          const res = await fetch(`/api/loop-runs/${activeRun.run_id}`);
          if (res.ok) {
            const data = normalizeLoopRun(await res.json());
            setActiveRun(data);
            
            // Sync dashboard summary stats as numbers grow!
            setTotalTokens((prev) => Math.max(prev, data.cost_summary.token_count));
            setTotalCost((prev) => Math.max(prev, data.cost_summary.cost_cny));

            if (data.state === 'COMPLETED' || data.state === 'FAILED') {
              setRunStatus('空闲');
              // Auto-sync other products if available
              fetchOutputsAfterRunComplete();
            } else if (data.state === 'WAITING_APPROVAL') {
              setRunStatus('等待审批');
            }
          }
        } catch (e) {
          console.error(e);
        }
      }, 1500);
    } else if (activeRun?.state === 'WAITING_APPROVAL') {
      setRunStatus('等待审批');
    } else {
      setRunStatus('空闲');
    }

    return () => clearInterval(timer);
  }, [activeRun]);

  // Scrolling terminal logs to bottom automatically without moving the page scroll position
  useEffect(() => {
    if (consoleRef.current) {
      consoleRef.current.scrollTop = consoleRef.current.scrollHeight;
    }
  }, [activeRun?.events]);

  const fetchOutputsAfterRunComplete = async () => {
    // Call matching and rewriting outputs drectly once background thread passes those step limits
    try {
      // Resume Parser
      const parseRes = await fetch('/api/parsers/resume', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: resumeText })
      });
      const parsedResume = await parseRes.json();
      setRawResumeProfile(parsedResume.profile);
      setResumeProfile(normalizeResumeProfile(parsedResume.profile));

      // JD Parser
      const parseJobRes = await fetch('/api/parsers/job', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: jobText })
      });
      const parsedJob = await parseJobRes.json();
      setRawJobProfile(parsedJob.profile);
      setJobProfile(normalizeJobProfile(parsedJob.profile));

      // Match Report
      const matchRes = await fetch('/api/matches', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ resume_profile: parsedResume.profile, job_profile: parsedJob.profile })
      });
      const matchData = await matchRes.json();
      setRawMatchProfile(matchData.match);
      setMatchReport(normalizeMatchReport(matchData.match));

      // Rewrite Draft
      const rewriteRes = await fetch('/api/rewrite-drafts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          resume_profile: parsedResume.profile,
          job_profile: parsedJob.profile,
          match_profile: matchData.match
        })
      });
      const rewriteData = await rewriteRes.json();
      setRawRewriteDraft(rewriteData.draft);
      setRewriteDraft(normalizeRewriteDraft(rewriteData.draft));

      // Interview Pack
      const packRes = await fetch('/api/interview-packs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          resume_profile: parsedResume.profile,
          job_profile: parsedJob.profile,
          match_profile: matchData.match,
          rewrite_draft: rewriteData.draft
        })
      });
      const packData = await packRes.json();
      setRawInterviewPack(packData.pack);
      setInterviewPack(normalizeInterviewPack(packData.pack));

      // Sync overall CRM records too
      initFetch();
    } catch (e) {
      console.error('Error auto loading agent outputs', e);
    }
  };

  // MAIN RUN TRIGGER
  const handleStartWorkflow = async () => {
    setIsLoopLoading(true);
    setDraftApproved(false);
    try {
      const res = await fetch('/api/loop-runs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          user_id: 'local-user',
          goal: '解析输入材料，评估对齐证据链，改写中文简历，并生成定制面试包。',
          resume_text: resumeText,
          job_text: jobText
        })
      });

      if (res.ok) {
        const runData = normalizeLoopRun(await res.json());
        setActiveRun(runData);
        setRunCount((prev) => prev + 1);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setIsLoopLoading(false);
    }
  };

  // Human in the Loop approval checkpoint
  const handleApproveCheckpoint = async () => {
    if (!activeRun) return;
    setIsActionLoading(true);
    try {
      const res = await fetch(`/api/loop-runs/${activeRun.run_id}/approve`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          note: approvalNote,
          notes: approvalNote
        })
      });
      if (res.ok) {
        const updated = normalizeLoopRun(await res.json());
        setActiveRun(updated);
        setDraftApproved(true);
        // Force sync rewrite draft on local front-end representation
        if (rewriteDraft) {
          setRewriteDraft({ ...rewriteDraft });
        }
      }
    } catch (e) {
      console.error(e);
    } finally {
      setIsActionLoading(false);
    }
  };

  // QualityGate Manual Eval
  const handleTriggerEval = async () => {
    setIsActionLoading(true);
    try {
      const res = await fetch('/api/evals', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          case_name: 'CareerPilot Google frontend quality gate',
          resume_profile: rawResumeProfile,
          job_profile: rawJobProfile,
          match_profile: rawMatchProfile,
          rewrite_draft: rawRewriteDraft,
          interview_pack: rawInterviewPack
        })
      });
      if (res.ok) {
        const data = await res.json();
        setEvalReport(normalizeEvalReport(data.report));
      }
    } catch (e) {
      console.error(e);
    } finally {
      setIsActionLoading(false);
    }
  };

  const handleUpdateApplicationStatus = async (id: string, status: string, notes?: string, memory?: string) => {
    try {
      const res = await fetch(`/api/applications/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status, notes, memory })
      });
      if (res.ok) {
        initFetch();
      }
    } catch (e) {
      console.error(e);
    }
  };

  const handleAddApplication = async (company: string, title: string, notes?: string) => {
    try {
      const res = await fetch('/api/applications', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ company, title, notes })
      });
      if (res.ok) {
        initFetch();
      }
    } catch (e) {
      console.error(e);
    }
  };

  return (
    <div className="min-h-screen relative text-slate-800 flex flex-col items-center p-4 md:p-8 pb-20 overflow-x-hidden selection:bg-amber-500/30 selection:text-slate-950">
      
      {/* CANVAS DYNAMIC BACKGROUND */}
      <InteractiveBackground />
      
      {/* WORKSPACE CONTENT WRAPPER */}
      <div className="w-full max-w-7xl flex flex-col items-center relative z-10">

        {/* FLOATING TOP BAR WIDGET (Music & Job Materials Center - Mockup 3 Style) */}
        <div className="w-full max-w-7xl flex flex-col md:flex-row justify-between items-center gap-4 mb-8 z-10">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-white/70 text-slate-800 rounded-2xl shadow-md border border-white/80 backdrop-blur-md">
              <Cpu className="w-6 h-6 text-indigo-600 animate-pulse" />
            </div>
            <div>
              <h1 className="text-xl font-black text-slate-900 tracking-tight">CareerPilot</h1>
              <p className="text-[10px] text-slate-500 font-bold uppercase tracking-widest font-mono">多智能体求职协作平台</p>
            </div>
          </div>

          {/* Ambient music workplace controller */}
          <MusicPlayer />
        </div>

        {/* METRICS HEADER CARDS (Mockup 2 Style Horizontal Stats Layout) */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 w-full max-w-7xl mb-8 z-10">
          <div className="bg-white/40 backdrop-blur-xl border border-white/60 p-5 rounded-2xl shadow-md hover:shadow-lg hover:bg-white/50 hover:border-white/80 transition-all">
            <span className="text-slate-500 text-xs font-bold uppercase tracking-wider block">运行次数</span>
            <span className="text-3xl font-black text-slate-900 block mt-1.5 font-mono">{runCount}</span>
          </div>
          <div className="bg-white/40 backdrop-blur-xl border border-white/60 p-5 rounded-2xl shadow-md hover:shadow-lg hover:bg-white/50 hover:border-white/80 transition-all">
            <span className="text-slate-500 text-xs font-bold uppercase tracking-wider block">引擎状态</span>
            <span className={`text-2xl font-black block mt-2 font-sans ${runStatus === '运行中' ? 'text-indigo-600 animate-pulse' : runStatus === '等待审批' ? 'text-amber-600 font-extrabold' : 'text-slate-700'}`}>
              {runStatus}
            </span>
          </div>
          <div className="bg-white/40 backdrop-blur-xl border border-white/60 p-5 rounded-2xl shadow-md hover:shadow-lg hover:bg-white/50 hover:border-white/80 transition-all">
            <span className="text-slate-500 text-xs font-bold uppercase tracking-wider block">Token</span>
            <span className="text-3xl font-black text-slate-900 block mt-1.5 font-mono">{totalTokens.toLocaleString()}</span>
          </div>
          <div className="bg-white/40 backdrop-blur-xl border border-white/60 p-5 rounded-2xl shadow-md hover:shadow-lg hover:bg-white/50 hover:border-white/80 transition-all">
            <span className="text-slate-500 text-xs font-bold uppercase tracking-wider block">成本 CNY</span>
            <span className="text-2xl font-black text-slate-900 block mt-2 font-mono">¥ {totalCost.toFixed(6)}</span>
          </div>
        </div>

        {/* CORE WORKFLOW SCHEMATIC CONTAINER (Mockup 2 Style Core Card) */}
        <div className="bg-white/45 backdrop-blur-xl border border-white/70 shadow-xl rounded-3xl p-6 md:p-8 w-full max-w-7xl mb-8 z-10 space-y-6 text-slate-805">
          <div className="flex justify-between items-start max-md:flex-col gap-4">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <span className="bg-amber-500/10 text-amber-700 border border-amber-500/20 text-[10px] px-2.5 py-0.5 rounded-full font-extrabold">求职 Agent</span>
                <h2 className="text-xl md:text-2xl font-extrabold text-slate-900 tracking-tight">从岗位 JD 到定制简历</h2>
              </div>
              <p className="text-xs text-slate-600 leading-relaxed max-w-4xl">
                这个项目不负责“编造简历”。它负责把你的真实经历拆成证据，再把这些证据翻译成目标岗位能看懂的表达；缺少证据的地方只会进入风险清单。
                最终产物是：<strong>匹配报告</strong>、<strong>能力缺口</strong>、<strong>改写建议</strong>、<strong>审批记录</strong>和<strong>可导出的中文 PDF</strong>。
              </p>
            </div>
          </div>

          {/* 7 step flow elements (Layout identical to Mockup 2 workflow rail) */}
          <div className="grid grid-cols-2 lg:grid-cols-7 gap-3 pt-4 border-t border-slate-200">
            {[
              { id: '01', title: '输入真实经历', desc: '教育、技能、项目、实习、作品都可以写，系统只会基于这些证据生成建议。' },
              { id: '02', title: '收集目标 JD', desc: '可粘贴 JD，也可以输入公开岗位链接；系统会留下正文哈希、截图状态和安全记录。' },
              { id: '03', title: '查看匹配与缺口', desc: '知道哪些能写、哪些缺证据、哪些需要补项目。' },
              { id: '04', title: '审批并导出', desc: '确认没有虚构内容后，导出中文简历写稿。' },
              { id: '05', title: '准备面试', desc: '生成真实面试风格的问题、项目追问、回答框架和复习清单。' },
              { id: '06', title: '投递管理', desc: '保存投递记录、面试反馈、长期记忆和下一步任务。' },
              { id: '07', title: '质量评测', desc: '用规则评测和 QualityGate 检查证据链、改写风险与导出质量。' }
            ].map((step, idx) => (
              <div
                key={step.id}
                className="bg-white/30 border border-white/60 p-3 rounded-xl hover:border-white/80 hover:bg-white/50 hover:shadow-md transition-all flex flex-col justify-between"
              >
                <div>
                  <span className="text-xs font-bold text-sky-600 block font-mono">{step.id}</span>
                  <h4 className="font-extrabold text-xs text-slate-800 mt-1">{step.title}</h4>
                  <p className="text-[10px] text-slate-500 leading-relaxed mt-1">{step.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* INPUT FORM CONTROLS PANEL */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 w-full max-w-7xl mb-8 z-10">
          
          {/* Resume Input Panel */}
          <div 
            onDragOver={(e) => handleDragOver(e, 'resume')}
            onDragLeave={(e) => handleDragLeave(e, 'resume')}
            onDrop={(e) => handleDrop(e, 'resume')}
            className="bg-white/45 backdrop-blur-xl border border-white/70 shadow-xl rounded-3xl p-6 flex flex-col h-[500px] relative overflow-hidden transition-all duration-300 text-slate-800"
          >
            <div className="flex justify-between items-center mb-3 flex-wrap gap-2">
              <h3 className="font-bold text-slate-800 text-sm flex items-center gap-1.5">
                <FileText className="w-4 h-4 text-slate-500" /> 张三的真实履历材料 (输入区)
              </h3>
              <div className="flex items-center gap-2">
                <label className="cursor-pointer bg-indigo-50 hover:bg-indigo-100 text-indigo-600 hover:text-indigo-700 border border-indigo-200 font-bold px-3 py-1 rounded-xl text-[11px] transition-colors flex items-center gap-1 shadow-sm">
                  <FileUp className="w-3.5 h-3.5" />
                  <span>选择文件</span>
                  <input
                    type="file"
                    accept=".pdf,.md,.txt,.png,.jpg,.jpeg"
                    className="hidden"
                    onChange={(e) => {
                      if (e.target.files && e.target.files[0]) {
                        handleFileUpload(e.target.files[0], 'resume');
                      }
                    }}
                  />
                </label>
                <span className="text-[10px] text-slate-500 font-mono">PDF/MD/图片/TXT</span>
              </div>
            </div>

            {uploadError.resume && (
              <div className="mb-2 p-2 bg-rose-50 border border-rose-200 text-rose-700 rounded-xl text-[10.5px] flex items-start gap-1.5 leading-snug animate-fade-in shadow-sm">
                <AlertCircle className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
                <span>{uploadError.resume}</span>
              </div>
            )}
            
            <textarea
              value={resumeText}
              onChange={(e) => setResumeText(e.target.value)}
              className="flex-1 w-full p-4 bg-white/40 border border-white/60 rounded-2xl text-xs font-mono leading-relaxed resize-none focus:outline-none focus:ring-2 focus:ring-indigo-500/20 text-slate-800 placeholder-slate-450"
              placeholder="在此处输入您真实的教育经历、主导过的项目、核心技能，或粘贴 markdown 简历，支持直接拖拽 PDF、Markdown 或图片进行提取..."
            />

            {/* Drag Overlay */}
            {isDragging.resume && (
              <div className="absolute inset-0 bg-indigo-500/5 backdrop-blur-xs border-2 border-dashed border-indigo-500 rounded-3xl flex flex-col items-center justify-center pointer-events-none z-20 animate-fade-in">
                <div className="p-4 bg-white/95 shadow-xl rounded-2xl flex flex-col items-center max-w-xs text-center border border-indigo-200">
                  <FileUp className="w-10 h-10 text-indigo-600 animate-bounce mb-2" />
                  <span className="text-xs font-bold text-indigo-600">释放鼠标以导入简历</span>
                  <span className="text-[10px] text-slate-500 mt-1">支持 PDF、Markdown、TXT 以及 JPG/PNG 图片</span>
                </div>
              </div>
            )}

            {/* Loading Overlay */}
            {isUploading.resume && (
              <div className="absolute inset-0 bg-white/40 backdrop-blur-xs rounded-3xl flex flex-col items-center justify-center z-20 animate-fade-in">
                <div className="bg-white/95 backdrop-blur-md px-6 py-5 rounded-2xl shadow-xl border border-white/70 flex flex-col items-center space-y-3 max-w-xs text-center">
                  <Loader2 className="w-8 h-8 text-sky-500 animate-spin" />
                  <div className="space-y-1">
                    <h5 className="text-xs font-extrabold text-slate-800">正在高精度解析文档...</h5>
                    <p className="text-[10.5px] text-slate-500 leading-relaxed">
                      大语言模型正在执行多模态 OCR 与结构化文字提取，预计耗时 3-5 秒。
                    </p>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* JD Input Panel */}
          <div 
            onDragOver={(e) => handleDragOver(e, 'job')}
            onDragLeave={(e) => handleDragLeave(e, 'job')}
            onDrop={(e) => handleDrop(e, 'job')}
            className="bg-white/45 backdrop-blur-xl border border-white/70 shadow-xl rounded-3xl p-6 flex flex-col h-[500px] relative overflow-hidden transition-all duration-300 text-slate-800"
          >
            <div className="flex justify-between items-center mb-3 flex-wrap gap-2">
              <h3 className="font-bold text-slate-800 text-sm flex items-center gap-1.5">
                <Sparkles className="w-4 h-4 text-slate-500" /> 目标招聘岗位 JD 细则 (输入区)
              </h3>
              <div className="flex items-center gap-2">
                <label className="cursor-pointer bg-indigo-50 hover:bg-indigo-100 text-indigo-600 hover:text-indigo-700 border border-indigo-200 font-bold px-3 py-1 rounded-xl text-[11px] transition-colors flex items-center gap-1 shadow-sm">
                  <FileUp className="w-3.5 h-3.5" />
                  <span>选择文件</span>
                  <input
                    type="file"
                    accept=".pdf,.md,.txt,.png,.jpg,.jpeg"
                    className="hidden"
                    onChange={(e) => {
                      if (e.target.files && e.target.files[0]) {
                        handleFileUpload(e.target.files[0], 'job');
                      }
                    }}
                  />
                </label>
                <span className="text-[10px] text-slate-500 font-mono">PDF/MD/图片/TXT</span>
              </div>
            </div>

            {uploadError.job && (
              <div className="mb-2 p-2 bg-rose-50 border border-rose-200 text-rose-700 rounded-xl text-[10.5px] flex items-start gap-1.5 leading-snug animate-fade-in shadow-sm">
                <AlertCircle className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
                <span>{uploadError.job}</span>
              </div>
            )}

            <textarea
              value={jobText}
              onChange={(e) => setJobText(e.target.value)}
              className="flex-1 w-full p-4 bg-white/40 border border-white/60 rounded-2xl text-xs font-mono leading-relaxed resize-none focus:outline-none focus:ring-2 focus:ring-indigo-500/20 text-slate-800 placeholder-slate-450"
              placeholder="在此处复制并粘贴招聘网站的公开岗位职责、JD 文字描述，或直接拖拽岗位文件、JD 截图进行提取..."
            />

            {/* Drag Overlay */}
            {isDragging.job && (
              <div className="absolute inset-0 bg-indigo-500/5 backdrop-blur-xs border-2 border-dashed border-indigo-500 rounded-3xl flex flex-col items-center justify-center pointer-events-none z-20 animate-fade-in">
                <div className="p-4 bg-white/95 shadow-xl rounded-2xl flex flex-col items-center max-w-xs text-center border border-indigo-200">
                  <FileUp className="w-10 h-10 text-indigo-600 animate-bounce mb-2" />
                  <span className="text-xs font-bold text-indigo-600">释放鼠标以导入岗位 JD</span>
                  <span className="text-[10px] text-slate-500 mt-1">支持 PDF、Markdown、TXT 以及 JPG/PNG 图片</span>
                </div>
              </div>
            )}

            {/* Loading Overlay */}
            {isUploading.job && (
              <div className="absolute inset-0 bg-white/40 backdrop-blur-xs rounded-3xl flex flex-col items-center justify-center z-20 animate-fade-in">
                <div className="bg-white/95 backdrop-blur-md px-6 py-5 rounded-2xl shadow-xl border border-white/70 flex flex-col items-center space-y-3 max-w-xs text-center">
                  <Loader2 className="w-8 h-8 text-sky-500 animate-spin" />
                  <div className="space-y-1">
                    <h5 className="text-xs font-extrabold text-slate-800">正在高精度解析岗位 JD...</h5>
                    <p className="text-[10.5px] text-slate-500 leading-relaxed">
                      大语言模型正在执行多模态 OCR 与结构化文字提取，预计耗时 3-5 秒。
                    </p>
                  </div>
                </div>
              </div>
            )}
          </div>

        </div>

        {/* WORKFLOW DISPATCH SUBMIT BAR (Big centered visual pills input bar) */}
        <div className="w-full max-w-3xl mb-8 z-10 animate-pulse-slow">
          <div className="bg-white/45 backdrop-blur-xl border border-white/70 shadow-xl rounded-full p-3 flex items-center justify-between gap-3 hover:border-white/90 transition-all">
            <div className="flex items-center gap-3 pl-4 flex-grow">
              <Plus className="w-5 h-5 text-slate-400 flex-shrink-0" />
              <span className="text-xs md:text-sm text-slate-600 truncate select-none">
                为 AI Agent 实习岗位生成可追踪运行计划，保留人工审批点和成本记录。
              </span>
            </div>

            <button
              onClick={handleStartWorkflow}
              disabled={isLoopLoading || runStatus === '运行中'}
              className="w-12 h-12 rounded-full bg-indigo-600 hover:bg-indigo-700 text-white flex items-center justify-center active:scale-95 transition-all shadow-lg disabled:bg-slate-200 disabled:text-slate-400 disabled:cursor-not-allowed flex-shrink-0"
              title="启动多智能体协作链"
            >
              {isLoopLoading ? (
                <Loader2 className="w-5 h-5 animate-spin" />
              ) : (
                <ArrowUp className="w-5 h-5 font-bold" />
              )}
            </button>
          </div>
          <p className="text-center text-[10px] text-slate-500 mt-2">
            💡 点击右侧上箭头按钮即可启动 CareerPilot 引擎。此会话会自动触发多步骤规划并在此面板实时打印。
          </p>
        </div>

        {/* ACTIVE WORKFLOW MONITOR (Scrolling stream console events log) */}
        {activeRun && (
          <div className="bg-white/45 backdrop-blur-xl border border-white/70 shadow-xl rounded-3xl p-6 w-full max-w-7xl mb-8 z-10 space-y-4">
            <div className="flex justify-between items-center border-b border-slate-200 pb-3">
              <div className="flex items-center gap-2">
                <Terminal className="w-4 h-4 text-emerald-600" />
                <h4 className="font-bold text-xs text-slate-850 uppercase tracking-wider font-mono">
                  CareerPilot Live Agent Tracing Engine — {activeRun.run_id}
                </h4>
              </div>

              <div className="flex items-center gap-2 text-xs">
                <span className={`inline-block w-2.5 h-2.5 rounded-full ${activeRun.state === 'RUNNING' ? 'bg-indigo-600 animate-ping' : activeRun.state === 'WAITING_APPROVAL' ? 'bg-amber-500' : 'bg-emerald-500'}`} />
                <span className="text-[10px] font-mono text-slate-500">状态: {activeRun.state}</span>
              </div>
            </div>

            {/* Scrolling Events Console */}
            <div 
              ref={consoleRef}
              className="h-44 overflow-y-auto font-mono text-xs text-slate-750 space-y-2 pr-1 select-text"
            >
              {activeRun.events.map((ev, i) => (
                <div key={i} className="flex gap-2 leading-relaxed">
                  <span className="text-slate-500 flex-shrink-0">[{ev.timestamp.split('T')[1]?.slice(0, 8)}]</span>
                  <span className={`flex-shrink-0 font-bold uppercase ${ev.level === 'warn' ? 'text-amber-600' : ev.level === 'error' ? 'text-rose-600' : 'text-indigo-600'}`}>
                    {ev.level}
                  </span>
                  <span className={`${ev.level === 'warn' ? 'text-amber-700 font-bold' : 'text-slate-705'}`}>
                    {ev.message}
                  </span>
                </div>
              ))}
            </div>

            {/* Workflows Steps indicators list */}
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3 pt-3 border-t border-slate-200 text-[11px] font-mono">
              {activeRun.steps.map((st) => (
                <div
                  key={st.step_id}
                  className={`p-2 rounded-lg border ${
                    st.status === 'RUNNING' ? 'bg-indigo-50 border-indigo-350 text-indigo-750 font-semibold' :
                    st.status === 'COMPLETED' ? 'bg-emerald-50 border-emerald-300 text-emerald-700 font-semibold' :
                    'bg-white/30 border-slate-200 text-slate-400'
                  }`}
                >
                  <div className="flex items-center gap-1.5 justify-between">
                    <span className="truncate block font-semibold">{st.name.split(' ')[0]}</span>
                    <span className={`text-[9px] font-bold px-1 rounded uppercase ${st.status === 'RUNNING' ? 'bg-indigo-100 text-indigo-750 font-semibold' : st.status === 'COMPLETED' ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}>
                      {st.status}
                    </span>
                  </div>
                  {st.output_summary && (
                    <span className="text-[9px] text-slate-500 truncate block mt-1">{st.output_summary}</span>
                  )}
                </div>
              ))}
            </div>

            {/* Checklist checkpoint interaction approval drawer */}
            {activeRun.state === 'WAITING_APPROVAL' && (
              <div className="bg-amber-500/5 border border-amber-500/20 p-4 rounded-2xl space-y-3 mt-4 animate-fade-in shadow-sm">
                <div className="flex gap-2 text-amber-800 text-xs">
                  <AlertTriangle className="w-5 h-5 flex-shrink-0 text-amber-600" />
                  <div>
                    <strong className="block font-bold">人在回路 (Human-in-the-Loop) 简历合规审批点已激活</strong>
                    <p className="mt-1 text-slate-600 leading-relaxed">
                      求职 Agent 完成了简历改写。为了规避大模型在修饰简历技术名词时出现凭空虚构，请张三同学核对改写细节（可在下方改写稿选项查看风险），填入批注后点击批准即可自动推进后续的面试通包生成。
                    </p>
                  </div>
                </div>

                <div className="space-y-2.5">
                  <input
                    type="text"
                    value={approvalNote}
                    onChange={(e) => setApprovalNote(e.target.value)}
                    className="w-full p-2.5 bg-white border border-slate-200 rounded-xl text-xs text-slate-800 font-sans focus:outline-none focus:border-amber-500/50 focus:ring-1 focus:ring-amber-500/10"
                    placeholder="添加手动批注与核查记录..."
                  />

                  <div className="flex justify-end gap-2">
                    <button
                      onClick={handleApproveCheckpoint}
                      disabled={isActionLoading}
                      className="px-4 py-1.5 bg-amber-500 hover:bg-amber-600 text-white font-bold rounded-lg text-xs transition-colors flex items-center gap-1 shadow-md"
                    >
                      {isActionLoading && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                      核实无虚构 · 批准继续
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* OUTPUT DISPLAY TABS COMPONENT */}
        <div className="w-full max-w-7xl mb-8 z-10">
          <ResumeOutputView
            matchReport={matchReport}
            rewriteDraft={rewriteDraft}
            interviewPack={interviewPack}
            onApproveDraft={handleApproveCheckpoint}
            draftApproved={draftApproved}
            activeRun={activeRun}
          />
        </div>

        {/* QUALITY GATE SECTION */}
        <div className="w-full max-w-7xl mb-8 z-10">
          <QualityGateReport
            onTriggerEval={handleTriggerEval}
            evalReport={evalReport}
            loading={isActionLoading}
          />
        </div>

        {/* CRM LONG TERM MEMORY MANAGER */}
        <div className="w-full max-w-7xl mb-8 z-10">
          <CrmTracker
            applications={applications}
            onUpdateStatus={handleUpdateApplicationStatus}
            onAddApplication={handleAddApplication}
          />
        </div>

        {/* FOOTER */}
        <div className="text-center text-[11px] text-slate-600/90 max-w-md z-10 mt-6 font-medium leading-relaxed">
          <p>© 2026 CareerPilot Inc. 专注于国内全栈及 AI 实习生证据锁定式投递辅助。</p>
          <p className="mt-1">
            基于 Google AI Studio Build 开发 · 深度集成 Gemini 3.5-flash 与多重算力网关。
          </p>
        </div>

        {/* FLOATING ACTION UTILITY RAILS WITH PHYSICAL PHYSICS ENGINE */}
        {isLandingFinished && (
          <PhysicsFloatingRails
            onOpenBalance={() => setIsBalanceOpen(true)}
            onOpenDemo={() => setIsDemoOpen(true)}
          />
        )}

        {/* MODAL DIALOG DRAWER CONTROLLERS */}
        <ProviderBalanceModal isOpen={isBalanceOpen} onClose={() => setIsBalanceOpen(false)} />
        <DemoVideoModal isOpen={isDemoOpen} onClose={() => setIsDemoOpen(false)} />

      </div>
    </div>
  );
}
