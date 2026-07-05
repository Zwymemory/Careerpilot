import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";

import {
  addApplicationFeedback,
  approveLoopRun,
  approveRewriteDraft,
  collectJob,
  createApplicationRecord,
  createEvalReport,
  createInterviewPack,
  createLoopRun,
  createMatch,
  createRewriteDraft,
  createRun,
  evalReportHtmlUrl,
  exportRewritePdf,
  getRun,
  getProviderBalances,
  listApplications,
  listEvalReports,
  listRuns,
  parseJob,
  parseResume,
  resumeLoopRun,
  updateApplicationStatus
} from "./api/client";
import { RunTrace } from "./components/RunTrace";
import type {
  ApplicationRecord,
  ApplicationResponse,
  ApplicationStatus,
  EvalReportSummary,
  EvalRunResponse,
  InterviewPackResponse,
  JobCollectResponse,
  MatchResponse,
  ParseJobResponse,
  ParseResumeResponse,
  ProviderBalance,
  ProviderBalanceResponse,
  ResumeRewriteResponse,
  RunDetail,
  RunSummary
} from "./types";

const defaultGoal =
  "为 AI Agent 实习岗位生成可追踪运行计划，保留人工审批点和成本记录。";
const defaultResumeText =
  "教育经历：示例大学，计算机科学与技术本科。\n技能：Python、FastAPI、React、TypeScript、PostgreSQL、Redis、Docker、LLM、AI Agent、RAG、Function Calling。\n项目：CareerPilot 是一个可追踪 AI Agent Workflow Platform，使用 FastAPI 和 React 实现 Run Trace、Checkpoint、成本记录、人工审批、匹配分析和简历改写草稿。";
const defaultJobText =
  "公司：示例 AI\n岗位名称：AI Agent 全栈开发工程师\n硬性要求：Python、FastAPI、SQL、REST API、Agent 工作流、Function Calling\n加分项：React、TypeScript、RAG、Redis、Docker、Pydantic、可视化交互";

type WorkflowAction =
  | "resume-parser"
  | "job-parser"
  | "job-collector"
  | "intake-analysis"
  | "match-agent"
  | "interview-pack"
  | "application-record"
  | "application-feedback"
  | "application-status"
  | "eval-harness"
  | "rewrite-draft"
  | "rewrite-approval"
  | "rewrite-export"
  | "loop-run"
  | "loop-approval"
  | "loop-resume";

interface CanvasParticle {
  x: number;
  y: number;
  phase: number;
  size: number;
  drift: number;
  hue: number;
  band: number;
  mist: number;
  depth: number;
}

function smoothStep(edge0: number, edge1: number, value: number) {
  const x = Math.max(0, Math.min(1, (value - edge0) / (edge1 - edge0)));
  return x * x * (3 - 2 * x);
}

export default function App() {
  const [goal, setGoal] = useState(defaultGoal);
  const [runs, setRuns] = useState<RunSummary[]>([]);
  const [activeRun, setActiveRun] = useState<RunDetail | null>(null);
  const [resumeText, setResumeText] = useState(defaultResumeText);
  const [jobText, setJobText] = useState(defaultJobText);
  const [jobUrl, setJobUrl] = useState("");
  const [resumeResult, setResumeResult] = useState<ParseResumeResponse | null>(null);
  const [jobResult, setJobResult] = useState<ParseJobResponse | null>(null);
  const [jobCollectResult, setJobCollectResult] = useState<JobCollectResponse | null>(null);
  const [matchResult, setMatchResult] = useState<MatchResponse | null>(null);
  const [rewriteResult, setRewriteResult] = useState<ResumeRewriteResponse | null>(null);
  const [interviewResult, setInterviewResult] = useState<InterviewPackResponse | null>(null);
  const [applicationResult, setApplicationResult] = useState<ApplicationResponse | null>(null);
  const [applications, setApplications] = useState<ApplicationRecord[]>([]);
  const [evalResult, setEvalResult] = useState<EvalRunResponse | null>(null);
  const [evalReports, setEvalReports] = useState<EvalReportSummary[]>([]);
  const [workflowAction, setWorkflowAction] = useState<WorkflowAction | null>(null);
  const [workflowError, setWorkflowError] = useState<string | null>(null);
  const [approvalNotes, setApprovalNotes] = useState("");
  const [rewriteApprovalNotes, setRewriteApprovalNotes] = useState("");
  const [applicationNotes, setApplicationNotes] = useState("准备投递前确认岗位、简历和面试材料。");
  const [applicationStatusDraft, setApplicationStatusDraft] =
    useState<ApplicationStatus>("READY_TO_APPLY");
  const [feedbackStage, setFeedbackStage] = useState("初面");
  const [feedbackText, setFeedbackText] = useState("");
  const [feedbackStrengths, setFeedbackStrengths] = useState("");
  const [feedbackConcerns, setFeedbackConcerns] = useState("");
  const [feedbackTasks, setFeedbackTasks] = useState("");
  const [evalCaseName, setEvalCaseName] = useState("AI Agent 求职链路质量评测");
  const [evalMinScore, setEvalMinScore] = useState(75);
  const [evalExpectedKeywords, setEvalExpectedKeywords] =
    useState("Python, FastAPI, Function Calling, AI Agent");
  const [isBooting, setIsBooting] = useState(true);
  const [bootProgress, setBootProgress] = useState(0);
  const [completionPulse, setCompletionPulse] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [audioName, setAudioName] = useState("未选择音乐");
  const [isPlaying, setIsPlaying] = useState(false);
  const [isMusicDockOpen, setIsMusicDockOpen] = useState(false);
  const [balanceResult, setBalanceResult] = useState<ProviderBalanceResponse | null>(null);
  const [balanceError, setBalanceError] = useState<string | null>(null);
  const [isBalanceDockOpen, setIsBalanceDockOpen] = useState(false);
  const [isDemoDockOpen, setIsDemoDockOpen] = useState(false);
  const shellRef = useRef<HTMLDivElement | null>(null);
  const musicDockRef = useRef<HTMLElement | null>(null);
  const balanceDockRef = useRef<HTMLElement | null>(null);
  const demoDockRef = useRef<HTMLDivElement | null>(null);
  const musicDockPointerInsideRef = useRef(false);
  const heroCopyRef = useRef<HTMLDivElement | null>(null);
  const goalInputRef = useRef<HTMLTextAreaElement | null>(null);
  const flowCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const sourceRef = useRef<MediaElementAudioSourceNode | null>(null);
  const audioFrameRef = useRef<number | null>(null);
  const backgroundFrameRef = useRef<number | null>(null);
  const completionTimerRef = useRef<number | null>(null);
  const audioLevelRef = useRef(0);
  const particleFieldRef = useRef<CanvasParticle[]>([]);
  const modelMotionRef = useRef({ busy: false, burstStartedAt: 0, intensity: 0 });
  const pointerRef = useRef({ x: 0, y: 0, targetX: 0, targetY: 0, scroll: 0 });

  async function refreshRuns() {
    const data = await listRuns();
    setRuns(data);
  }

  async function refreshApplications() {
    const data = await listApplications();
    setApplications(data);
  }

  async function refreshEvalReports() {
    const data = await listEvalReports();
    setEvalReports(data);
  }

  async function refreshProviderBalances() {
    const data = await getProviderBalances();
    setBalanceResult(data);
    setBalanceError(null);
  }

  async function showRun(runId: string) {
    const detail = await getRun(runId);
    setActiveRun(detail);
  }

  function markRequestComplete() {
    setCompletionPulse(true);
    if (completionTimerRef.current) {
      window.clearTimeout(completionTimerRef.current);
    }
    completionTimerRef.current = window.setTimeout(() => {
      setCompletionPulse(false);
      completionTimerRef.current = null;
    }, 1500);
  }

  function clearCompletionPulse() {
    if (completionTimerRef.current) {
      window.clearTimeout(completionTimerRef.current);
      completionTimerRef.current = null;
    }
    setCompletionPulse(false);
  }

  useLayoutEffect(() => {
    const input = goalInputRef.current;
    if (!input) {
      return;
    }

    input.style.height = "auto";
    const nextHeight = Math.min(input.scrollHeight, 132);
    input.style.height = `${nextHeight}px`;
    input.style.overflowY = input.scrollHeight > 132 ? "auto" : "hidden";
  }, [goal]);

  useEffect(() => {
    refreshRuns().catch((err: unknown) => {
      setError(err instanceof Error ? err.message : "运行记录加载失败。");
    });
    refreshApplications().catch((err: unknown) => {
      setWorkflowError(err instanceof Error ? err.message : "投递记录加载失败。");
    });
    refreshEvalReports().catch((err: unknown) => {
      setWorkflowError(err instanceof Error ? err.message : "评测报告加载失败。");
    });
    refreshProviderBalances().catch((err: unknown) => {
      setBalanceError(err instanceof Error ? err.message : "模型余额加载失败。");
    });
  }, []);

  useEffect(() => {
    const refreshTimer = window.setInterval(() => {
      refreshProviderBalances().catch((err: unknown) => {
        setBalanceError(err instanceof Error ? err.message : "模型余额加载失败。");
      });
    }, 90000);

    return () => window.clearInterval(refreshTimer);
  }, []);

  useEffect(() => {
    const initialLoader = document.getElementById("initial-boot-loader");
    if (initialLoader) {
      window.dispatchEvent(new Event("careerpilot:app-mounted"));
    }

    const minDuration = 1500;
    const maxDuration = 6000;
    const startedAt = performance.now();
    let pageLoaded = document.readyState === "complete";
    let frame = 0;
    let hideTimer = 0;

    const handleLoad = () => {
      pageLoaded = true;
    };

    const tick = (now: number) => {
      const elapsed = now - startedAt;
      if (!pageLoaded && elapsed >= maxDuration) {
        pageLoaded = true;
      }

      const warmupProgress = Math.min(92, Math.round((elapsed / minDuration) * 92));

      if (!pageLoaded || elapsed < minDuration) {
        setBootProgress(warmupProgress);
        frame = requestAnimationFrame(tick);
        return;
      }

      const completionProgress = 92 + Math.min(8, Math.round(((elapsed - minDuration) / 320) * 8));
      const progress = Math.min(100, completionProgress);
      setBootProgress(progress);

      if (progress < 100) {
        frame = requestAnimationFrame(tick);
        return;
      }

      hideTimer = window.setTimeout(() => setIsBooting(false), 260);
    };

    window.addEventListener("load", handleLoad, { once: true });
    frame = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(frame);
      window.clearTimeout(hideTimer);
      window.removeEventListener("load", handleLoad);
    };
  }, []);

  useEffect(() => {
    document.body.classList.toggle("boot-lock", isBooting);
    return () => document.body.classList.remove("boot-lock");
  }, [isBooting]);

  useEffect(() => {
    modelMotionRef.current.busy = isLoading || workflowAction !== null;
    if (completionPulse) {
      modelMotionRef.current.burstStartedAt = performance.now();
    }
  }, [completionPulse, isLoading, workflowAction]);

  useEffect(() => {
    const revealItems = Array.from(document.querySelectorAll<HTMLElement>(".revealable"));
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add("is-visible");
            return;
          }
          if (entry.target.classList.contains("reveal-repeat")) {
            entry.target.classList.remove("is-visible");
          }
        });
      },
      { rootMargin: "18% 0px -2% 0px", threshold: 0.04 },
    );

    revealItems.forEach((item) => observer.observe(item));
    return () => observer.disconnect();
  }, [activeRun, runs.length, matchResult]);

  useEffect(() => {
    const handlePointerMove = (event: PointerEvent) => {
      if (!shellRef.current) {
        return;
      }
      const x = event.clientX / window.innerWidth - 0.5;
      const y = event.clientY / window.innerHeight - 0.5;
      pointerRef.current.targetX = x;
      pointerRef.current.targetY = y;
      shellRef.current.style.setProperty("--mouse-x", x.toFixed(3));
      shellRef.current.style.setProperty("--mouse-y", y.toFixed(3));
    };

    const handleScroll = () => {
      const maxScroll = Math.max(document.documentElement.scrollHeight - window.innerHeight, 1);
      const scroll = window.scrollY / maxScroll;
      pointerRef.current.scroll = scroll;
      shellRef.current?.style.setProperty("--scroll-ratio", scroll.toFixed(3));

      const heroCopy = heroCopyRef.current;
      if (heroCopy) {
        const rect = heroCopy.getBoundingClientRect();
        const opacity = Math.max(0, Math.min(1, (rect.bottom - 44) / 260));
        heroCopy.style.setProperty("--hero-copy-opacity", opacity.toFixed(3));
      }

      document.querySelectorAll<HTMLElement>(".scroll-fade").forEach((item) => {
        const rect = item.getBoundingClientRect();
        const entering = Math.max(0, Math.min(1, (window.innerHeight - rect.top) / 320));
        const leaving = Math.max(0, Math.min(1, rect.bottom / 320));
        const opacity = Math.min(entering, leaving);
        item.style.setProperty("--scroll-fade-opacity", opacity.toFixed(3));
      });
    };

    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("scroll", handleScroll, { passive: true });
    handleScroll();
    return () => {
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("scroll", handleScroll);
    };
  }, []);

  useEffect(() => {
    if (!isMusicDockOpen) {
      return;
    }

    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target;
      if (target instanceof Node && musicDockRef.current?.contains(target)) {
        return;
      }
      setIsMusicDockOpen(false);
    };

    window.addEventListener("pointerdown", handlePointerDown, { capture: true });
    return () => window.removeEventListener("pointerdown", handlePointerDown, { capture: true });
  }, [isMusicDockOpen]);

  useEffect(() => {
    if (!isBalanceDockOpen) {
      return;
    }

    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target;
      if (target instanceof Node && balanceDockRef.current?.contains(target)) {
        return;
      }
      setIsBalanceDockOpen(false);
    };

    window.addEventListener("pointerdown", handlePointerDown, { capture: true });
    return () => window.removeEventListener("pointerdown", handlePointerDown, { capture: true });
  }, [isBalanceDockOpen]);

  useEffect(() => {
    if (!isDemoDockOpen) {
      return;
    }

    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target;
      if (target instanceof Node && demoDockRef.current?.contains(target)) {
        return;
      }
      setIsDemoDockOpen(false);
    };

    window.addEventListener("pointerdown", handlePointerDown, { capture: true });
    return () => window.removeEventListener("pointerdown", handlePointerDown, { capture: true });
  }, [isDemoDockOpen]);

  useEffect(() => {
    const canvas = flowCanvasRef.current;
    const context = canvas?.getContext("2d");
    if (!canvas || !context) {
      return;
    }

    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const colorStops = [
      { hue: 198, sat: 88, light: 74 },
      { hue: 142, sat: 74, light: 78 },
      { hue: 318, sat: 70, light: 82 },
      { hue: 40, sat: 82, light: 80 },
      { hue: 254, sat: 76, light: 83 },
      { hue: 174, sat: 72, light: 76 },
    ];

    const seedParticles = () => {
      const particleCount = window.innerWidth > 1440 ? 1180 : 940;
      const rainbowHues = [354, 28, 48, 132, 190, 226, 278];
      particleFieldRef.current = Array.from({ length: particleCount }, (_, index) => {
        const flow = Math.random();
        const isCloudParticle = Math.random() < 0.84;
        const ribbonX = 0.08 + flow * 0.9 + (Math.random() - 0.5) * 0.22;
        const ribbonY =
          0.49 +
          Math.sin(flow * Math.PI * 2.15 + 0.58) * 0.18 +
          Math.cos(flow * Math.PI * 3.4) * 0.06 +
          (Math.random() - 0.5) * 0.28;

        return {
          x: isCloudParticle ? ribbonX : -0.1 + Math.random() * 1.2,
          y: isCloudParticle ? ribbonY : -0.08 + Math.random() * 1.16,
          phase: Math.random() * Math.PI * 2 + index * 0.017,
          size: 0.22 + Math.random() * 0.68,
          drift: 0.32 + Math.random() * 1.1,
          hue: rainbowHues[index % rainbowHues.length],
          band: index % rainbowHues.length,
          mist: isCloudParticle ? 0.66 + Math.random() * 0.34 : 0.18 + Math.random() * 0.24,
          depth: 0.42 + Math.random() * 0.76,
        };
      });
    };

    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.floor(window.innerWidth * dpr);
      canvas.height = Math.floor(window.innerHeight * dpr);
      canvas.style.width = `${window.innerWidth}px`;
      canvas.style.height = `${window.innerHeight}px`;
      context.setTransform(dpr, 0, 0, dpr, 0, 0);
      if (particleFieldRef.current.length === 0) {
        seedParticles();
      }
    };

    const draw = (now: number) => {
      const width = window.innerWidth;
      const height = window.innerHeight;
      const t = now / 1000;
      const pointer = pointerRef.current;
      pointer.x += (pointer.targetX - pointer.x) * 0.045;
      pointer.y += (pointer.targetY - pointer.y) * 0.045;

      const audioLift = audioLevelRef.current;
      const motion = modelMotionRef.current;
      motion.intensity += ((motion.busy ? 1 : 0) - motion.intensity) * 0.055;
      const burstElapsed = motion.burstStartedAt ? now - motion.burstStartedAt : 2200;
      const burstLife = 1800;
      const burstPhase = Math.max(0, Math.min(1, burstElapsed / burstLife));
      const burst = Math.max(0, 1 - burstPhase);
      const busy = motion.intensity;
      const formation = Math.max(busy, burst);
      const idleAudio = audioLift * (1 - Math.min(1, formation * 1.25));
      const base = context.createLinearGradient(0, 0, width, height);
      base.addColorStop(0, "#f8eee8");
      base.addColorStop(0.28, "#e8f4d7");
      base.addColorStop(0.62, "#cfeaf2");
      base.addColorStop(1, "#bdd8f4");
      context.globalCompositeOperation = "source-over";
      context.fillStyle = base;
      context.fillRect(0, 0, width, height);

      context.globalCompositeOperation = "source-over";
      colorStops.forEach((color, index) => {
        const phase = t * (0.2 + index * 0.032) + index * 1.72 + pointer.scroll * 2.2;
        const orbitX = Math.sin(phase * 1.13) * width * 0.25;
        const orbitY = Math.cos(phase * 0.91) * height * 0.2;
        const x =
          width * (0.16 + index * 0.145) +
          orbitX +
          pointer.x * (160 + index * 18) -
          width * 0.09;
        const y =
          height * (0.22 + ((index * 0.19) % 0.62)) +
          orbitY +
          pointer.y * (130 + index * 16) +
          pointer.scroll * height * 0.24;
        const radius = Math.max(width, height) * (0.34 + index * 0.022 + idleAudio * 0.035);
        const gradient = context.createRadialGradient(x, y, 0, x, y, radius);
        const hue = color.hue + Math.sin(t * 0.24 + index) * 14;
        gradient.addColorStop(
          0,
          `hsla(${hue}, ${color.sat}%, ${color.light}%, ${0.46 + idleAudio * 0.14})`,
        );
        gradient.addColorStop(0.45, `hsla(${hue}, ${color.sat}%, ${color.light}%, 0.24)`);
        gradient.addColorStop(1, `hsla(${hue}, ${color.sat}%, ${color.light}%, 0)`);
        context.fillStyle = gradient;
        context.fillRect(0, 0, width, height);
      });

      context.save();
      context.globalCompositeOperation = "soft-light";
      context.filter = "blur(18px)";
      for (let band = 0; band < 4; band += 1) {
        const hue = 174 + band * 28 + Math.sin(t * 0.18 + band) * 18;
        const yBase = height * (0.2 + band * 0.18) + Math.sin(t * 0.26 + band) * height * 0.08;
        context.beginPath();
        context.moveTo(-width * 0.12, yBase + pointer.y * 44);
        for (let x = -width * 0.12; x <= width * 1.12; x += width / 5) {
          const wave =
            Math.sin(x * 0.004 + t * (0.8 + band * 0.12) + band) * height * 0.08 +
            Math.cos(x * 0.002 + t * 0.42 + band * 0.7) * height * 0.04;
          context.lineTo(x + pointer.x * 90, yBase + wave + pointer.scroll * height * 0.15);
        }
        context.lineWidth = Math.max(90, height * 0.14);
        context.lineCap = "round";
        context.strokeStyle = `hsla(${hue}, 76%, 74%, ${0.11 + idleAudio * 0.05})`;
        context.stroke();
      }
      context.restore();

      const centerX = width * (0.5 + pointer.x * 0.035);
      const centerY = height * (0.56 + pointer.y * 0.025 - pointer.scroll * 0.04);

      context.save();
      context.globalCompositeOperation = "source-over";
      particleFieldRef.current.forEach((particle, index) => {
        const breath = 0.5 + Math.sin(t * (1.35 + particle.drift * 0.72) + particle.phase) * 0.5;
        const flicker =
          0.65 + Math.sin(t * (4.2 + particle.drift * 2.4) + particle.phase * 2.6) * 0.35;
        const idlePresence = 1 - Math.min(1, formation);
        const idleBreath = idlePresence * breath;
        const idleFlicker = idlePresence * flicker;
        const idlePulse = idleAudio * (0.68 + breath * 0.54 + flicker * 0.32);
        const bandCount = 7;
        const laneIndex = Math.floor(index / bandCount);
        const laneCount = Math.ceil(particleFieldRef.current.length / bandCount);
        const u = laneIndex / Math.max(laneCount - 1, 1);
        const rainbowAngle = Math.PI * (0.96 - u * 0.86);
        const bandOffset = particle.band - (bandCount - 1) / 2;
        const radiusX = width * (0.34 + particle.band * 0.009);
        const radiusY = height * (0.26 + particle.band * 0.01);
        const shimmer = Math.sin(t * (1.3 + particle.drift * 0.4) + particle.phase) * (4 + busy * 7);
        const rainbowX =
          centerX +
          Math.cos(rainbowAngle) * radiusX +
          Math.sin(t * 0.72 + particle.phase) * (5 + busy * 8);
        const rainbowY =
          centerY -
          Math.sin(rainbowAngle) * radiusY +
          bandOffset * (4.2 + busy * 1.2) +
          shimmer;

        const orbit = particle.phase + t * (0.16 + busy * 1.9 + idleAudio * 0.9) + index * 0.006;
        const baseX =
          particle.x * width +
          Math.sin(t * 0.16 * particle.drift + particle.phase) * (28 + idlePulse * 38) +
          Math.sin(t * 2.2 + particle.phase * 1.8) * idlePulse * 20 +
          pointer.x * (32 + particle.depth * 18);
        const baseY =
          particle.y * height +
          Math.cos(t * 0.13 * particle.drift + particle.phase * 1.4) * (30 + idlePulse * 34) +
          Math.cos(t * 2.0 + particle.phase * 1.6) * idlePulse * 16 +
          pointer.y * (24 + particle.depth * 16) +
          pointer.scroll * height * 0.12;
        const pull = 0.035 + formation * 0.945;
        let x =
          baseX * (1 - pull) +
          rainbowX * pull +
          Math.cos(orbit) * (busy * 18 + idlePulse * 26) * particle.drift;
        let y =
          baseY * (1 - pull) +
          rainbowY * pull +
          Math.sin(orbit * 1.16) * (busy * 14 + idlePulse * 22) * particle.drift;

        if (burst > 0) {
          const diagonal = Math.max(0, Math.min(1, (x / width + (height - y) / height) / 2));
          const sweep = smoothStep(0, 1, (burstPhase - diagonal * 0.46) * 2.1);
          const scatter = smoothStep(0.42, 1, burstPhase);
          const dx = x - centerX;
          const dy = y - centerY;
          const distance = Math.max(24, Math.hypot(dx, dy));
          x += sweep * (width * 0.1 + particle.drift * 68);
          y -= sweep * (height * 0.08 + particle.drift * 52);
          x += (dx / distance) * scatter * 230 * particle.drift;
          y += (dy / distance) * scatter * 180 * particle.drift;
        }

        const opacity =
          0.035 +
          particle.mist * 0.032 +
          idleBreath * 0.026 +
          idleFlicker * (0.012 + idleAudio * 0.085) +
          busy * 0.24 +
          burst * (0.15 + particle.drift * 0.06);
        const particleRadius =
          particle.size * (1 + idleBreath * 0.18 + idlePulse * 0.42) + busy * 0.68 + burst * 0.54;
        context.beginPath();
        context.fillStyle = `hsla(${particle.hue}, 82%, ${54 + particle.band * 2}%, ${opacity})`;
        context.arc(x, y, particleRadius, 0, Math.PI * 2);
        context.fill();

        if (formation < 0.24 && index % 37 === 0) {
          const fogRadius = (18 + idleAudio * 28) * particle.depth;
          const fog = context.createRadialGradient(x, y, 0, x, y, fogRadius);
          fog.addColorStop(0, `hsla(${particle.hue}, 68%, 74%, ${0.025 * particle.mist})`);
          fog.addColorStop(1, `hsla(${particle.hue}, 68%, 74%, 0)`);
          context.fillStyle = fog;
          context.fillRect(x - fogRadius, y - fogRadius, fogRadius * 2, fogRadius * 2);
        }

        if ((index + Math.floor(t * 8)) % 43 === 0) {
          context.beginPath();
          context.moveTo(x, y);
          context.lineTo(
            x + Math.cos(orbit + Math.PI / 2) * (9 + busy * 30),
            y + Math.sin(orbit + Math.PI / 2) * (8 + busy * 26),
          );
          context.strokeStyle = `hsla(${particle.hue}, 88%, 58%, ${
            0.028 + idleAudio * 0.08 + busy * 0.09 + burst * 0.065
          })`;
          context.lineWidth = 0.55;
          context.stroke();
        }
      });
      context.restore();

      context.globalCompositeOperation = "source-over";
      context.lineWidth = 1.2;
      for (let row = -1; row < 9; row += 1) {
        const y = height * (row / 8) + Math.sin(t * 0.34 + row) * 24 + pointer.y * 24;
        context.beginPath();
        for (let x = -20; x <= width + 20; x += 22) {
          const wave =
            Math.sin(x * 0.008 + t * 0.72 + row * 0.8) * (12 + idleAudio * 8) +
            Math.cos(x * 0.004 - t * 0.34 + row) * 9;
          if (x === -20) {
            context.moveTo(x, y + wave);
          } else {
            context.lineTo(x, y + wave);
          }
        }
        context.strokeStyle = `rgba(255, 255, 255, ${0.09 + row * 0.009})`;
        context.stroke();
      }

      if (!reducedMotion) {
        backgroundFrameRef.current = requestAnimationFrame(draw);
      }
    };

    resize();
    window.addEventListener("resize", resize);
    backgroundFrameRef.current = requestAnimationFrame(draw);

    return () => {
      window.removeEventListener("resize", resize);
      if (backgroundFrameRef.current) {
        cancelAnimationFrame(backgroundFrameRef.current);
      }
    };
  }, []);

  useEffect(() => {
    return () => {
      if (audioFrameRef.current) {
        cancelAnimationFrame(audioFrameRef.current);
      }
      if (completionTimerRef.current) {
        window.clearTimeout(completionTimerRef.current);
      }
      audioContextRef.current?.close();
    };
  }, []);

  async function handleCreateRun() {
    const runGoal = goal.trim();
    if (!runGoal || isLoading) {
      return;
    }

    setIsLoading(true);
    setError(null);
    clearCompletionPulse();
    try {
      const detail = await createRun(runGoal);
      setActiveRun(detail);
      await refreshRuns();
      markRequestComplete();
    } catch (err) {
      setError(err instanceof Error ? err.message : "创建运行失败。");
    } finally {
      setIsLoading(false);
    }
  }

  async function handleParseResume() {
    const text = resumeText.trim();
    if (text.length < 10 || workflowAction) {
      setWorkflowError("简历文本至少需要 10 个字符。");
      return;
    }

    setWorkflowAction("resume-parser");
    setWorkflowError(null);
    clearCompletionPulse();
    try {
      const result = await parseResume(text);
      setResumeResult(result);
      setMatchResult(null);
      setRewriteResult(null);
      setInterviewResult(null);
      await showRun(result.run_id);
      await refreshRuns();
      markRequestComplete();
    } catch (err) {
      setWorkflowError(err instanceof Error ? err.message : "简历解析失败。");
    } finally {
      setWorkflowAction(null);
    }
  }

  async function handleParseJob() {
    const text = jobText.trim();
    if (text.length < 10 || workflowAction) {
      setWorkflowError("岗位 JD 至少需要 10 个字符。");
      return;
    }

    setWorkflowAction("job-parser");
    setWorkflowError(null);
    clearCompletionPulse();
    try {
      const result = await parseJob(text);
      setJobResult(result);
      setJobCollectResult(null);
      setMatchResult(null);
      setRewriteResult(null);
      setInterviewResult(null);
      await showRun(result.run_id);
      await refreshRuns();
      markRequestComplete();
    } catch (err) {
      setWorkflowError(err instanceof Error ? err.message : "JD 解析失败。");
    } finally {
      setWorkflowAction(null);
    }
  }

  async function handleCollectJob() {
    const url = jobUrl.trim();
    const text = jobText.trim();
    if (workflowAction) {
      return;
    }
    if (!url && text.length < 10) {
      setWorkflowError("请填写岗位链接，或粘贴至少 10 个字符的岗位 JD。");
      return;
    }

    setWorkflowAction("job-collector");
    setWorkflowError(null);
    clearCompletionPulse();
    try {
      const result = await collectJob(
        url
          ? {
              url,
              source_name: "frontend-job-url",
              capture_screenshot: true
            }
          : {
              text,
              source_name: "frontend-jd",
              capture_screenshot: false
            },
      );
      setJobCollectResult(result);
      setJobText(result.snapshot.text);
      setJobResult({
        run_id: result.run_id,
        profile: result.profile,
        metadata: result.metadata
      });
      setMatchResult(null);
      setRewriteResult(null);
      setInterviewResult(null);
      await showRun(result.run_id);
      await refreshRuns();
      markRequestComplete();
    } catch (err) {
      setWorkflowError(err instanceof Error ? err.message : "岗位收集失败。");
    } finally {
      setWorkflowAction(null);
    }
  }

  async function handleAnalyzeIntake() {
    const resume = resumeText.trim();
    const job = jobText.trim();
    const url = jobUrl.trim();
    if (workflowAction) {
      return;
    }
    if (resume.length < 10 || (!url && job.length < 10)) {
      setWorkflowError("请先补充真实经历，并填写岗位链接或目标岗位 JD。");
      return;
    }

    setWorkflowAction("intake-analysis");
    setWorkflowError(null);
    clearCompletionPulse();
    try {
      const [parsedResume, parsedJob] = await Promise.all([
        parseResume(resume),
        url
          ? collectJob({
              url,
              source_name: "frontend-job-url",
              capture_screenshot: true
            })
          : parseJob(job)
      ]);
      setResumeResult(parsedResume);
      if (isJobCollectResponse(parsedJob)) {
        setJobCollectResult(parsedJob);
        setJobText(parsedJob.snapshot.text);
        setJobResult({
          run_id: parsedJob.run_id,
          profile: parsedJob.profile,
          metadata: parsedJob.metadata
        });
      } else {
        setJobCollectResult(null);
        setJobResult(parsedJob);
      }
      setMatchResult(null);
      setRewriteResult(null);
      setInterviewResult(null);
      await showRun(parsedJob.run_id);
      await refreshRuns();
      markRequestComplete();
    } catch (err) {
      setWorkflowError(err instanceof Error ? err.message : "材料解析失败。");
    } finally {
      setWorkflowAction(null);
    }
  }

  async function handleCreateLoopRun() {
    const runGoal = goal.trim();
    const resume = resumeText.trim();
    const job = jobText.trim();
    if (!runGoal || (!resume && !job) || workflowAction) {
      setWorkflowError("LoopEngine 需要运行目标，并且至少需要一段简历或 JD 输入。");
      return;
    }

    setWorkflowAction("loop-run");
    setWorkflowError(null);
    clearCompletionPulse();
    try {
      const detail = await createLoopRun({
        goal: runGoal,
        ...(resume ? { resume_text: resume } : {}),
        ...(job ? { job_text: job } : {})
      });
      setActiveRun(detail);
      await refreshRuns();
      markRequestComplete();
    } catch (err) {
      setWorkflowError(err instanceof Error ? err.message : "LoopEngine 运行失败。");
    } finally {
      setWorkflowAction(null);
    }
  }

  async function handleRunMatch() {
    if (!resumeResult || !jobResult || workflowAction) {
      setWorkflowError("MatchAgent 需要先完成简历解析和 JD 解析。");
      return;
    }

    setWorkflowAction("match-agent");
    setWorkflowError(null);
    clearCompletionPulse();
    try {
      const result = await createMatch({
        resume_profile: resumeResult.profile,
        job_profile: jobResult.profile
      });
      setMatchResult(result);
      setRewriteResult(null);
      setInterviewResult(null);
      await showRun(result.run_id);
      await refreshRuns();
      markRequestComplete();
    } catch (err) {
      setWorkflowError(err instanceof Error ? err.message : "MatchAgent 匹配失败。");
    } finally {
      setWorkflowAction(null);
    }
  }

  async function handleCreateRewriteDraft() {
    if (!resumeResult || !jobResult || !matchResult || workflowAction) {
      setWorkflowError("ResumeRewriteAgent 需要先完成 W2 解析和 W4 匹配。");
      return;
    }

    setWorkflowAction("rewrite-draft");
    setWorkflowError(null);
    clearCompletionPulse();
    try {
      const result = await createRewriteDraft({
        resume_profile: resumeResult.profile,
        job_profile: jobResult.profile,
        match_profile: matchResult.match
      });
      setRewriteResult(result);
      setInterviewResult(null);
      await showRun(result.run_id);
      await refreshRuns();
      markRequestComplete();
    } catch (err) {
      setWorkflowError(err instanceof Error ? err.message : "ResumeRewriteAgent 生成草稿失败。");
    } finally {
      setWorkflowAction(null);
    }
  }

  async function handleApproveRewriteDraft() {
    if (!rewriteResult || workflowAction) {
      return;
    }

    setWorkflowAction("rewrite-approval");
    setWorkflowError(null);
    clearCompletionPulse();
    try {
      const detail = await approveRewriteDraft(
        rewriteResult.run_id,
        rewriteApprovalNotes.trim()
      );
      setRewriteResult({
        ...rewriteResult,
        draft: {
          ...rewriteResult.draft,
          approval_status: "APPROVED"
        }
      });
      setRewriteApprovalNotes("");
      setActiveRun(detail);
      await refreshRuns();
      markRequestComplete();
    } catch (err) {
      setWorkflowError(err instanceof Error ? err.message : "改写草稿审批失败。");
    } finally {
      setWorkflowAction(null);
    }
  }

  async function handleExportRewritePdf() {
    if (!rewriteResult || workflowAction) {
      return;
    }

    setWorkflowAction("rewrite-export");
    setWorkflowError(null);
    try {
      const blob = await exportRewritePdf(rewriteResult.run_id);
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `${rewriteResult.draft.draft_id}.pdf`;
      anchor.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      setWorkflowError(err instanceof Error ? err.message : "PDF 导出失败。");
    } finally {
      setWorkflowAction(null);
    }
  }

  async function handleCreateInterviewPack() {
    if (!resumeResult || !jobResult || workflowAction) {
      setWorkflowError("InterviewCoachAgent 需要先完成简历解析和 JD 解析。");
      return;
    }

    setWorkflowAction("interview-pack");
    setWorkflowError(null);
    clearCompletionPulse();
    try {
      const result = await createInterviewPack({
        resume_profile: resumeResult.profile,
        job_profile: jobResult.profile,
        ...(matchResult ? { match_profile: matchResult.match } : {}),
        ...(rewriteResult ? { rewrite_draft: rewriteResult.draft } : {})
      });
      setInterviewResult(result);
      await showRun(result.run_id);
      await refreshRuns();
      markRequestComplete();
    } catch (err) {
      setWorkflowError(err instanceof Error ? err.message : "InterviewCoachAgent 生成面试包失败。");
    } finally {
      setWorkflowAction(null);
    }
  }

  async function handleCreateApplicationRecord() {
    if (!jobResult || workflowAction) {
      setWorkflowError("ApplicationCRMAgent 需要先完成 JD 解析。");
      return;
    }

    setWorkflowAction("application-record");
    setWorkflowError(null);
    clearCompletionPulse();
    try {
      const sourceRunIds = [
        resumeResult?.run_id,
        jobResult.run_id,
        jobCollectResult?.run_id,
        matchResult?.run_id,
        rewriteResult?.run_id,
        interviewResult?.run_id
      ].filter((value): value is string => Boolean(value));
      const result = await createApplicationRecord({
        job_profile: jobResult.profile,
        ...(resumeResult ? { resume_profile: resumeResult.profile } : {}),
        ...(matchResult ? { match_profile: matchResult.match } : {}),
        ...(rewriteResult ? { rewrite_draft: rewriteResult.draft } : {}),
        ...(interviewResult ? { interview_pack: interviewResult.pack } : {}),
        ...(jobUrl.trim() ? { job_url: jobUrl.trim() } : {}),
        status: applicationStatusDraft,
        notes: applicationNotes.trim() || undefined,
        source_run_ids: sourceRunIds
      });
      setApplicationResult(result);
      await showRun(result.run_id);
      await refreshRuns();
      await refreshApplications();
      markRequestComplete();
    } catch (err) {
      setWorkflowError(err instanceof Error ? err.message : "ApplicationCRMAgent 保存失败。");
    } finally {
      setWorkflowAction(null);
    }
  }

  async function handleAddApplicationFeedback() {
    const activeApplication = applicationResult?.record ?? applications[0];
    if (!activeApplication || workflowAction) {
      setWorkflowError("请先保存一条投递记录。");
      return;
    }
    if (feedbackText.trim().length < 4) {
      setWorkflowError("面试反馈至少需要 4 个字符。");
      return;
    }

    setWorkflowAction("application-feedback");
    setWorkflowError(null);
    clearCompletionPulse();
    try {
      const result = await addApplicationFeedback(activeApplication.application_id, {
        stage: feedbackStage.trim() || "面试",
        feedback_text: feedbackText.trim(),
        strengths: splitInput(feedbackStrengths),
        concerns: splitInput(feedbackConcerns),
        follow_up_tasks: splitInput(feedbackTasks)
      });
      setApplicationResult(result);
      setFeedbackText("");
      setFeedbackStrengths("");
      setFeedbackConcerns("");
      setFeedbackTasks("");
      await showRun(result.run_id);
      await refreshRuns();
      await refreshApplications();
      markRequestComplete();
    } catch (err) {
      setWorkflowError(err instanceof Error ? err.message : "面试反馈保存失败。");
    } finally {
      setWorkflowAction(null);
    }
  }

  async function handleUpdateApplicationStatus() {
    const activeApplication = applicationResult?.record ?? applications[0];
    if (!activeApplication || workflowAction) {
      setWorkflowError("请先保存一条投递记录。");
      return;
    }

    setWorkflowAction("application-status");
    setWorkflowError(null);
    clearCompletionPulse();
    try {
      const result = await updateApplicationStatus(
        activeApplication.application_id,
        applicationStatusDraft,
        applicationNotes.trim() || undefined,
      );
      setApplicationResult(result);
      await showRun(result.run_id);
      await refreshRuns();
      await refreshApplications();
      markRequestComplete();
    } catch (err) {
      setWorkflowError(err instanceof Error ? err.message : "投递状态更新失败。");
    } finally {
      setWorkflowAction(null);
    }
  }

  async function handleRunEval() {
    const activeApplication = applicationResult?.record ?? applications[0] ?? null;
    const hasArtifacts = Boolean(
      resumeResult || jobResult || matchResult || rewriteResult || interviewResult || activeApplication,
    );
    if (!hasArtifacts || workflowAction) {
      setWorkflowError("EvalHarness 需要至少一个 W2-W8 产物。");
      return;
    }

    setWorkflowAction("eval-harness");
    setWorkflowError(null);
    clearCompletionPulse();
    try {
      const result = await createEvalReport({
        case_name: evalCaseName.trim() || "CareerPilot 质量评测",
        judge_mode: "llm_as_judge_dry_run",
        min_score: evalMinScore,
        expected_keywords: splitInput(evalExpectedKeywords),
        required_sections: ["summary", "skills", "project"],
        ...(resumeResult ? { resume_profile: resumeResult.profile } : {}),
        ...(jobResult ? { job_profile: jobResult.profile } : {}),
        ...(matchResult ? { match_profile: matchResult.match } : {}),
        ...(rewriteResult ? { rewrite_draft: rewriteResult.draft } : {}),
        ...(interviewResult ? { interview_pack: interviewResult.pack } : {}),
        ...(activeApplication ? { application_record: activeApplication } : {})
      });
      setEvalResult(result);
      await showRun(result.run_id);
      await refreshRuns();
      await refreshEvalReports();
      markRequestComplete();
    } catch (err) {
      setWorkflowError(err instanceof Error ? err.message : "EvalHarness 评测失败。");
    } finally {
      setWorkflowAction(null);
    }
  }

  async function handleApproveLoopRun() {
    if (!activeRun || workflowAction) {
      return;
    }

    setWorkflowAction("loop-approval");
    setWorkflowError(null);
    clearCompletionPulse();
    try {
      const detail = await approveLoopRun(activeRun.run.run_id, approvalNotes.trim());
      setActiveRun(detail);
      setApprovalNotes("");
      await refreshRuns();
      markRequestComplete();
    } catch (err) {
      setWorkflowError(err instanceof Error ? err.message : "审批失败。");
    } finally {
      setWorkflowAction(null);
    }
  }

  async function handleResumeLoopRun() {
    if (!activeRun || workflowAction) {
      return;
    }

    setWorkflowAction("loop-resume");
    setWorkflowError(null);
    clearCompletionPulse();
    try {
      const detail = await resumeLoopRun(activeRun.run.run_id);
      setActiveRun(detail);
      await refreshRuns();
      markRequestComplete();
    } catch (err) {
      setWorkflowError(err instanceof Error ? err.message : "恢复运行失败。");
    } finally {
      setWorkflowAction(null);
    }
  }

  function handleAudioChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file || !audioRef.current) {
      return;
    }
    audioRef.current.src = URL.createObjectURL(file);
    setAudioName(file.name.replace(/\.[^.]+$/, ""));
    setIsPlaying(false);
    setIsMusicDockOpen(true);
  }

  async function toggleAudio() {
    const audio = audioRef.current;
    if (!audio || !audio.src) {
      return;
    }

    if (!audioContextRef.current) {
      const AudioContextConstructor = window.AudioContext || window.webkitAudioContext;
      audioContextRef.current = new AudioContextConstructor();
      analyserRef.current = audioContextRef.current.createAnalyser();
      analyserRef.current.fftSize = 128;
    }

    if (!sourceRef.current && analyserRef.current && audioContextRef.current) {
      sourceRef.current = audioContextRef.current.createMediaElementSource(audio);
      sourceRef.current.connect(analyserRef.current);
      analyserRef.current.connect(audioContextRef.current.destination);
    }

    if (audio.paused) {
      await audioContextRef.current?.resume();
      await audio.play();
      setIsPlaying(true);
      startAudioPulse();
    } else {
      audio.pause();
      setIsPlaying(false);
      audioLevelRef.current = 0;
      shellRef.current?.style.setProperty("--audio-level", "0");
    }
  }

  function startAudioPulse() {
    const analyser = analyserRef.current;
    if (!analyser || !shellRef.current) {
      return;
    }

    if (audioFrameRef.current) {
      cancelAnimationFrame(audioFrameRef.current);
    }

    const samples = new Uint8Array(analyser.frequencyBinCount);
    const tick = () => {
      analyser.getByteFrequencyData(samples);
      const average = samples.reduce((sum, sample) => sum + sample, 0) / samples.length;
      const level = Math.min(1, average / 160);
      audioLevelRef.current = level;
      shellRef.current?.style.setProperty("--audio-level", level.toFixed(3));
      audioFrameRef.current = requestAnimationFrame(tick);
    };
    tick();
  }

  const latestRun = useMemo(() => activeRun?.run ?? null, [activeRun]);
  const latestSummary = runs[0];
  const latestState = latestRun?.state ?? latestSummary?.state ?? "IDLE";
  const latestTokens = activeRun?.total_tokens ?? latestSummary?.total_tokens ?? 0;
  const totalCost = activeRun?.total_cost_cny ?? runs[0]?.total_cost_cny ?? 0;
  const activeCheckpoints = activeRun?.run.checkpoints.length ?? 0;
  const activeStepCount = activeRun?.run.steps.length ?? latestSummary?.step_count ?? 0;
  const canApproveActiveRun = activeRun?.run.state === "WAITING_APPROVAL";
  const canResumeActiveRun = activeRun?.run.state === "FAILED";
  const canRunMatch = Boolean(resumeResult && jobResult);
  const canRunRewrite = Boolean(resumeResult && jobResult && matchResult);
  const canRunInterview = Boolean(resumeResult && jobResult);
  const canCreateApplication = Boolean(jobResult);
  const activeApplication = applicationResult?.record ?? applications[0] ?? null;
  const canRunEval = Boolean(
    resumeResult || jobResult || matchResult || rewriteResult || interviewResult || activeApplication,
  );
  const canApproveRewrite =
    rewriteResult?.draft.approval_status === "WAITING_APPROVAL" &&
    activeRun?.run.run_id === rewriteResult.run_id &&
    activeRun.run.state === "WAITING_APPROVAL";
  const canExportRewrite =
    rewriteResult?.draft.approval_status === "APPROVED" &&
    activeRun?.run.run_id === rewriteResult.run_id &&
    activeRun.run.state === "COMPLETED";
  const isModelWorking = isLoading || workflowAction !== null;
  const providerBalances = balanceResult?.providers ?? [];

  return (
    <div
      className={`ambient-stage ${isModelWorking ? "ambient-stage-busy" : ""} ${
        completionPulse ? "ambient-stage-complete" : ""
      }`}
      ref={shellRef}
    >
      <canvas className="flow-canvas" ref={flowCanvasRef} aria-hidden="true" />
      <div className="scroll-atmosphere" aria-hidden="true">
        <span className="depth-halo" />
        <span className="pixel-bloom pixel-bloom-left" />
        <span className="pixel-bloom pixel-bloom-right" />
      </div>
      <div className="ambient-noise" />
      <audio ref={audioRef} onEnded={() => setIsPlaying(false)} />
      <div className={`boot-loader ${isBooting ? "" : "boot-loader-hidden"}`} aria-hidden="true">
        <div className="boot-rail boot-rail-top">
          <span>CAREERPILOT</span>
          <i />
          <span>2026</span>
        </div>
        <div className="boot-card">
          <span className="boot-flower" />
          <span className="boot-mark">CareerPilot</span>
          <span className="boot-submark">Agent · 轨迹 · Studio</span>
          <span
            className="boot-center-line"
            style={{ "--boot-progress": `${bootProgress}%` } as React.CSSProperties}
          >
            <i />
          </span>
        </div>
        <div className="boot-rail boot-rail-bottom">
          <span>加载中</span>
          <i style={{ "--boot-progress": `${bootProgress}%` } as React.CSSProperties}>
            <b />
          </i>
          <span>{bootProgress.toString().padStart(3, "0")}</span>
        </div>
      </div>

      <header
        ref={musicDockRef}
        className={`minimal-nav glass-surface liftable ${
          isMusicDockOpen ? "dock-open" : "dock-closed"
        }`}
        aria-label="音乐区"
        onPointerDownCapture={() => {
          musicDockPointerInsideRef.current = true;
        }}
        onPointerUpCapture={() => {
          window.setTimeout(() => {
            musicDockPointerInsideRef.current = false;
          }, 350);
        }}
        onBlur={(event) => {
          const currentTarget = event.currentTarget;
          const nextTarget = event.relatedTarget;
          if (nextTarget instanceof Node && currentTarget.contains(nextTarget)) {
            return;
          }

          const pointerStartedInside = musicDockPointerInsideRef.current;
          window.setTimeout(() => {
            if (pointerStartedInside) {
              musicDockPointerInsideRef.current = false;
              return;
            }
            if (currentTarget.contains(document.activeElement)) {
              return;
            }
            setIsMusicDockOpen(false);
          }, 0);
        }}
      >
        <button
          className="nav-collapsed"
          type="button"
          onFocus={() => setIsMusicDockOpen(true)}
          onClick={() => setIsMusicDockOpen(true)}
          aria-label="打开音乐区"
          aria-expanded={isMusicDockOpen}
        >
          <span className={isPlaying ? "nav-orb nav-orb-on" : "nav-orb"}>♪</span>
        </button>
        <div className="nav-expanded" aria-hidden={!isMusicDockOpen}>
          <div className="nav-title">
            <p className="eyebrow">音乐区</p>
            <h1>求职材料工作台</h1>
            <p className="nav-track">{audioName}</p>
          </div>
          <div className="nav-actions">
            <label className="icon-pill liftable" title="选择本地音乐">
              <span aria-hidden="true">♪</span>
              <input type="file" accept="audio/*" onChange={handleAudioChange} />
            </label>
            <button
              className="icon-pill liftable"
              type="button"
              onClick={toggleAudio}
              disabled={audioName === "未选择音乐"}
              title={isPlaying ? "暂停音乐" : "播放音乐"}
            >
              {isPlaying ? "Ⅱ" : "▶"}
            </button>
          </div>
        </div>
      </header>

      <aside
        ref={balanceDockRef}
        className={`provider-dock glass-surface ${
          isBalanceDockOpen ? "balance-open" : "balance-closed"
        }`}
        aria-label="模型余额"
      >
        <button
          className="provider-collapsed"
          type="button"
          onClick={() => setIsBalanceDockOpen(true)}
          aria-label="打开模型余额"
          aria-expanded={isBalanceDockOpen}
        >
          <span className="provider-orb">API</span>
        </button>
        <div className="provider-expanded" aria-hidden={!isBalanceDockOpen}>
          <div className="provider-heading">
            <div>
              <p className="eyebrow">模型余额</p>
              <h2>调用水位</h2>
            </div>
            <button
              className="provider-refresh"
              type="button"
              onClick={() => {
                refreshProviderBalances().catch((err: unknown) => {
                  setBalanceError(err instanceof Error ? err.message : "模型余额加载失败。");
                });
              }}
            >
              刷新
            </button>
          </div>
          <div className="quota-grid">
            {providerBalances.length > 0 ? (
              providerBalances.map((provider) => (
                <ProviderQuota provider={provider} key={provider.provider} />
              ))
            ) : (
              <p className="provider-loading">正在同步 API 余额...</p>
            )}
          </div>
          <p className={balanceError ? "provider-error" : "provider-summary"}>
            {balanceError ?? "悬停卡片查看余额来源。"}
          </p>
        </div>
      </aside>

      <div
        ref={demoDockRef}
        className={`demo-dock glass-surface ${isDemoDockOpen ? "demo-open" : "demo-closed"}`}
        aria-label="Demo"
      >
        <button
          className="demo-trigger"
          type="button"
          onClick={() => setIsDemoDockOpen(true)}
          aria-label="打开 Demo"
          aria-expanded={isDemoDockOpen}
        >
          <span aria-hidden="true">Demo</span>
        </button>
        <div className="demo-expanded" aria-hidden={!isDemoDockOpen}>
          <div className="demo-heading">
            <div>
              <p className="eyebrow">Demo</p>
              <h3>三分钟看完整求职链路</h3>
            </div>
            <button type="button" onClick={() => setIsDemoDockOpen(false)} aria-label="收起演示">
              ×
            </button>
          </div>
          <div className="demo-frame">
            <video className="demo-video" controls preload="metadata" src="/careerpilot-demo.mp4" />
            <p className="demo-hint">
              将演示视频放到 frontend/public/careerpilot-demo.mp4 后，这里会自动播放。
            </p>
          </div>
        </div>
      </div>

      <main className="app-shell">
        <section className="hero-workspace">
          <div className="hero-copy revealable reveal-once reveal-delay-1" ref={heroCopyRef}>
            <p className="eyebrow">我在听，CareerPilot</p>
            <h2>把真实经历，变成可投递的岗位叙事。</h2>
            <p>
              输入你的真实能力和目标实习 JD，CareerPilot 会拆解岗位、匹配证据、
              标出能力缺口，并生成需要人工确认的中文简历改写稿。
            </p>
          </div>

          <div className="command-dock glass-surface liftable revealable reveal-delay-2">
            <button
              className="composer-icon composer-plus"
              type="button"
              aria-label="聚焦运行目标"
              title="聚焦运行目标"
              onClick={() => goalInputRef.current?.focus()}
            >
              <span aria-hidden="true">+</span>
            </button>
            <textarea
              ref={goalInputRef}
              className="goal-input"
              aria-label="运行目标"
              placeholder="描述这次 Agent 运行目标"
              value={goal}
              onChange={(event) => setGoal(event.target.value)}
              onKeyDown={(event) => {
                if (event.key !== "Enter" || event.shiftKey || event.nativeEvent.isComposing) {
                  return;
                }
                event.preventDefault();
                void handleCreateRun();
              }}
              rows={1}
            />
            <button
              className="composer-send liftable"
              type="button"
              onClick={handleCreateRun}
              disabled={isLoading || !goal.trim()}
              aria-label={isLoading ? "正在创建运行" : "创建运行"}
              title={isLoading ? "正在创建" : "创建运行"}
            >
              <span aria-hidden="true">{isLoading ? "…" : "↑"}</span>
            </button>
          </div>

          {error ? <p className="error-text glass-surface revealable">{error}</p> : null}
        </section>

        <section className="insight-strip">
          <Metric label="运行次数" value={runs.length.toString()} />
          <Metric label="状态" value={formatState(latestState)} />
          <Metric label="Token" value={latestTokens.toString()} />
          <Metric label="成本 CNY" value={totalCost.toFixed(6)} />
        </section>

        <section className="product-journey glass-surface revealable reveal-once">
          <div className="section-heading product-heading">
            <div>
              <p className="eyebrow">用户流程</p>
              <h2>从岗位 JD 到定制简历</h2>
            </div>
            <span className="state-badge">求职 Agent</span>
          </div>
          <div className="product-copy">
            <p>
              这个项目不负责“编造简历”。它负责把你的真实经历拆成证据，再把这些证据
              翻译成目标岗位能看懂的表达；缺少证据的地方只会进入风险清单。
            </p>
            <p>
              最终产物是：匹配报告、能力缺口、改写建议、审批记录和可导出的中文 PDF。
            </p>
          </div>
          <div className="journey-steps">
            <ProductStep
              index="01"
              title="输入真实经历"
              text="教育、技能、项目、实习、作品都可以写，系统只会基于这些证据生成建议。"
              active
            />
            <ProductStep
              index="02"
              title="收集目标 JD"
              text="可粘贴 JD，也可输入公开岗位链接；系统会留下正文哈希、截图状态和安全记录。"
              active={Boolean(jobCollectResult || jobResult)}
            />
            <ProductStep
              index="03"
              title="查看匹配与缺口"
              text="知道哪些能写、哪些缺证据、哪些需要补项目。"
              active={Boolean(matchResult)}
            />
            <ProductStep
              index="04"
              title="审批并导出"
              text="确认没有虚构内容后，导出中文简历改写稿。"
              active={Boolean(rewriteResult)}
            />
            <ProductStep
              index="05"
              title="准备面试"
              text="生成真实面试风格的问题、项目追问、回答框架和复习清单。"
              active={Boolean(interviewResult)}
            />
            <ProductStep
              index="06"
              title="投递管理"
              text="保存投递记录、面试反馈、长期记忆和下一步任务。"
              active={Boolean(activeApplication)}
            />
            <ProductStep
              index="07"
              title="质量评测"
              text="用规则评测和 QualityGate 检查证据链、改写风险和可导出质量。"
              active={Boolean(evalResult)}
            />
          </div>
        </section>

        <section className="user-flow-grid">
          <section className="product-panel product-panel-wide scroll-fade glass-surface liftable">
            <div className="section-heading">
              <div>
                <p className="eyebrow">第一步</p>
                <h2>准备投递材料</h2>
              </div>
              <span className="state-badge">真实证据</span>
            </div>
            <div className="collector-strip">
              <label className="collector-field">
                <span>岗位链接 / 公开 JD 页面</span>
                <input
                  type="url"
                  value={jobUrl}
                  onChange={(event) => setJobUrl(event.target.value)}
                  placeholder="https://example.com/job/ai-agent-intern"
                />
              </label>
              <button
                className="ghost-action liftable"
                type="button"
                onClick={handleCollectJob}
                disabled={workflowAction !== null || (!jobUrl.trim() && jobText.trim().length < 10)}
              >
                {workflowAction === "job-collector" ? "收集中" : "收集岗位"}
              </button>
            </div>
            {jobCollectResult ? <JobCollectorSummary result={jobCollectResult} /> : null}
            <div className="workflow-input-grid">
              <label className="workflow-field">
                <span>我的真实经历 / 能力</span>
                <textarea
                  value={resumeText}
                  onChange={(event) => setResumeText(event.target.value)}
                  rows={5}
                />
              </label>
              <label className="workflow-field">
                <span>目标岗位 JD</span>
                <textarea
                  value={jobText}
                  onChange={(event) => setJobText(event.target.value)}
                  rows={5}
                />
              </label>
            </div>
            <div className="workflow-actions">
              <button
                className="primary-action liftable"
                type="button"
                onClick={handleAnalyzeIntake}
                disabled={workflowAction !== null}
              >
                {workflowAction === "intake-analysis" ? "解析中" : "解析材料"}
              </button>
              <button
                className="ghost-action liftable"
                type="button"
                onClick={handleParseResume}
                disabled={workflowAction !== null}
              >
                {workflowAction === "resume-parser" ? "解析中" : "只解析经历"}
              </button>
              <button
                className="ghost-action liftable"
                type="button"
                onClick={handleParseJob}
                disabled={workflowAction !== null}
              >
                {workflowAction === "job-parser" ? "解析中" : "只解析 JD"}
              </button>
            </div>
            <div className="parser-result-grid">
              <ParserSummary kind="resume" result={resumeResult} />
              <ParserSummary kind="job" result={jobResult} />
            </div>
          </section>

          <section className="product-panel scroll-fade glass-surface liftable">
            <div className="section-heading">
              <div>
                <p className="eyebrow">第二步</p>
                <h2>岗位匹配报告</h2>
              </div>
              <span className="state-badge">证据匹配</span>
            </div>
            <div className="product-column">
              <MatchSummary result={matchResult} />
              <button
                className="primary-action liftable"
                type="button"
                onClick={handleRunMatch}
                disabled={workflowAction !== null || !canRunMatch}
              >
                {workflowAction === "match-agent" ? "匹配中" : "生成匹配报告"}
              </button>
              {!canRunMatch ? <span className="match-hint">请先解析经历和 JD。</span> : null}
            </div>
          </section>

          <section className="product-panel scroll-fade glass-surface liftable">
            <div className="section-heading">
              <div>
                <p className="eyebrow">第三步</p>
                <h2>简历改写与导出</h2>
              </div>
              <span className="state-badge">人工确认</span>
            </div>
            <div className="product-column">
              <RewriteSummary result={rewriteResult} mode="candidate" />
              <label className="workflow-field workflow-field-compact">
                <span>审批备注</span>
                <textarea
                  value={rewriteApprovalNotes}
                  onChange={(event) => setRewriteApprovalNotes(event.target.value)}
                  rows={3}
                  placeholder="确认这些改写都有真实证据后再审批"
                />
              </label>
              <div className="workflow-actions">
                <button
                  className="primary-action liftable"
                  type="button"
                  onClick={handleCreateRewriteDraft}
                  disabled={workflowAction !== null || !canRunRewrite}
                >
                  {workflowAction === "rewrite-draft" ? "生成中" : "生成改写稿"}
                </button>
                <button
                  className="ghost-action liftable"
                  type="button"
                  onClick={handleApproveRewriteDraft}
                  disabled={workflowAction !== null || !canApproveRewrite}
                >
                  {workflowAction === "rewrite-approval" ? "审批中" : "确认真实"}
                </button>
                <button
                  className="ghost-action liftable"
                  type="button"
                  onClick={handleExportRewritePdf}
                  disabled={workflowAction !== null || !canExportRewrite}
                >
                  {workflowAction === "rewrite-export" ? "导出中" : "导出 PDF"}
                </button>
              </div>
              {!canRunRewrite ? <span className="match-hint">请先完成匹配报告。</span> : null}
            </div>
          </section>

          <section className="product-panel product-panel-wide scroll-fade glass-surface liftable">
            <div className="section-heading">
              <div>
                <p className="eyebrow">第四步</p>
                <h2>面试准备包</h2>
              </div>
              <span className="state-badge">证据锁定</span>
            </div>
            <div className="interview-workspace">
              <InterviewSummary result={interviewResult} mode="candidate" />
              <div className="interview-side">
                <p>
                  InterviewCoachAgent 会把简历证据、JD 要求、匹配缺口和改写草稿转成更接近真实面试的
                  技术追问、项目追问和回答框架。
                </p>
                <button
                  className="primary-action liftable"
                  type="button"
                  onClick={handleCreateInterviewPack}
                  disabled={workflowAction !== null || !canRunInterview}
                >
                  {workflowAction === "interview-pack" ? "生成中" : "生成面试包"}
                </button>
                {!canRunInterview ? (
                  <span className="match-hint">请先解析经历和 JD。</span>
                ) : null}
              </div>
            </div>
          </section>

          <section className="product-panel product-panel-wide scroll-fade glass-surface liftable">
            <div className="section-heading">
              <div>
                <p className="eyebrow">第五步</p>
                <h2>投递 CRM 与长期记忆</h2>
              </div>
              <span className="state-badge">W8</span>
            </div>
            <div className="application-workspace">
              <ApplicationSummary record={activeApplication} applications={applications} />
              <div className="application-side">
                <p>
                  ApplicationCRMAgent 会把岗位、匹配报告、改写稿、面试包和反馈保存成一条
                  可继续追踪的投递记录。它只管理记录和下一步任务，不会自动替你投递。
                </p>
                <label className="workflow-field workflow-field-compact">
                  <span>投递状态</span>
                  <select
                    value={applicationStatusDraft}
                    onChange={(event) =>
                      setApplicationStatusDraft(event.target.value as ApplicationStatus)
                    }
                  >
                    <option value="SAVED">已收藏</option>
                    <option value="READY_TO_APPLY">准备投递</option>
                    <option value="APPLIED">已投递</option>
                    <option value="INTERVIEWING">面试中</option>
                    <option value="OFFER">已 Offer</option>
                    <option value="REJECTED">未通过</option>
                    <option value="ARCHIVED">已归档</option>
                  </select>
                </label>
                <label className="workflow-field workflow-field-compact">
                  <span>记录备注</span>
                  <textarea
                    value={applicationNotes}
                    onChange={(event) => setApplicationNotes(event.target.value)}
                    rows={3}
                    placeholder="例如：本周投递，面试前重点复习 SQL"
                  />
                </label>
                <div className="workflow-actions">
                  <button
                    className="primary-action liftable"
                    type="button"
                    onClick={handleCreateApplicationRecord}
                    disabled={workflowAction !== null || !canCreateApplication}
                  >
                    {workflowAction === "application-record" ? "保存中" : "保存投递记录"}
                  </button>
                  <button
                    className="ghost-action liftable"
                    type="button"
                    onClick={handleUpdateApplicationStatus}
                    disabled={workflowAction !== null || !activeApplication}
                  >
                    {workflowAction === "application-status" ? "更新中" : "更新状态"}
                  </button>
                </div>
                {!canCreateApplication ? (
                  <span className="match-hint">请先解析目标 JD。</span>
                ) : null}
              </div>
            </div>
            <div className="feedback-box">
              <div className="feedback-fields">
                <label className="workflow-field workflow-field-compact">
                  <span>面试阶段</span>
                  <input
                    value={feedbackStage}
                    onChange={(event) => setFeedbackStage(event.target.value)}
                    placeholder="初面 / 二面 / HR 面"
                  />
                </label>
                <label className="workflow-field workflow-field-compact feedback-main">
                  <span>面试反馈</span>
                  <textarea
                    value={feedbackText}
                    onChange={(event) => setFeedbackText(event.target.value)}
                    rows={3}
                    placeholder="记录真实反馈，例如：项目讲得清楚，但 SQL 细节需要补强"
                  />
                </label>
                <label className="workflow-field workflow-field-compact">
                  <span>正向信号</span>
                  <textarea
                    value={feedbackStrengths}
                    onChange={(event) => setFeedbackStrengths(event.target.value)}
                    rows={2}
                    placeholder="逗号或换行分隔"
                  />
                </label>
                <label className="workflow-field workflow-field-compact">
                  <span>暴露问题</span>
                  <textarea
                    value={feedbackConcerns}
                    onChange={(event) => setFeedbackConcerns(event.target.value)}
                    rows={2}
                    placeholder="逗号或换行分隔"
                  />
                </label>
                <label className="workflow-field workflow-field-compact feedback-main">
                  <span>下一步任务</span>
                  <textarea
                    value={feedbackTasks}
                    onChange={(event) => setFeedbackTasks(event.target.value)}
                    rows={2}
                    placeholder="补 SQL 查询练习；准备 Function Calling 调用链讲法"
                  />
                </label>
              </div>
              <button
                className="ghost-action liftable"
                type="button"
                onClick={handleAddApplicationFeedback}
                disabled={workflowAction !== null || !activeApplication}
              >
                {workflowAction === "application-feedback" ? "记录中" : "添加面试反馈"}
              </button>
            </div>
          </section>

          <section className="product-panel product-panel-wide scroll-fade glass-surface liftable">
            <div className="section-heading">
              <div>
                <p className="eyebrow">第六步</p>
                <h2>质量评测与 QualityGate</h2>
              </div>
              <span className="state-badge">W9</span>
            </div>
            <div className="eval-workspace">
              <EvalSummary report={evalResult?.report ?? null} reports={evalReports} />
              <div className="eval-side">
                <p>
                  EvalHarness 会检查解析覆盖、证据映射、改写证据锁定、面试准备完整度和
                  CRM 记录质量。它不会替代人工判断，但会阻断明显无证据或风险过高的内容。
                </p>
                <label className="workflow-field workflow-field-compact">
                  <span>评测名称</span>
                  <input
                    value={evalCaseName}
                    onChange={(event) => setEvalCaseName(event.target.value)}
                  />
                </label>
                <label className="workflow-field workflow-field-compact">
                  <span>最低通过分</span>
                  <input
                    type="number"
                    min={0}
                    max={100}
                    value={evalMinScore}
                    onChange={(event) => setEvalMinScore(Number(event.target.value))}
                  />
                </label>
                <label className="workflow-field workflow-field-compact">
                  <span>期望关键词</span>
                  <textarea
                    value={evalExpectedKeywords}
                    onChange={(event) => setEvalExpectedKeywords(event.target.value)}
                    rows={3}
                    placeholder="逗号或换行分隔"
                  />
                </label>
                <div className="workflow-actions">
                  <button
                    className="primary-action liftable"
                    type="button"
                    onClick={handleRunEval}
                    disabled={workflowAction !== null || !canRunEval}
                  >
                    {workflowAction === "eval-harness" ? "评测中" : "运行质量评测"}
                  </button>
                  {evalResult ? (
                    <a
                      className="ghost-action liftable"
                      href={evalReportHtmlUrl(evalResult.report)}
                      target="_blank"
                      rel="noreferrer"
                    >
                      打开 HTML 报告
                    </a>
                  ) : null}
                </div>
                {!canRunEval ? (
                  <span className="match-hint">请先完成至少一个 W2-W8 步骤。</span>
                ) : null}
              </div>
            </div>
          </section>
        </section>

        <details className="developer-view glass-surface revealable">
          <summary>
            <span>开发者视图</span>
            <strong>查看 Week2-9 Agent 运行细节、审批、checkpoint 和质量门禁</strong>
          </summary>
          <section className="workflow-board developer-workflow">
            <section className="workflow-panel workflow-panel-wide scroll-fade glass-surface liftable">
              <div className="section-heading">
                <div>
                  <p className="eyebrow">Week6 JobCollectorAgent</p>
                  <h2>公开岗位收集 · 安全边界 · 留证</h2>
                </div>
                <span className="state-badge">W6</span>
              </div>
              <div className="collector-dev-grid">
                <div className="match-side">
                  <p>
                    W6 只收集你提供的公开岗位页面或粘贴文本，不携带登录态，不绕过验证码，
                    并为正文、HTML 和截图生成 hash，作为后续匹配与改写的证据来源。
                  </p>
                  <div className="collector-strip collector-strip-compact">
                    <label className="collector-field">
                      <span>岗位链接</span>
                      <input
                        type="url"
                        value={jobUrl}
                        onChange={(event) => setJobUrl(event.target.value)}
                        placeholder="粘贴公开岗位 URL"
                      />
                    </label>
                    <button
                      className="primary-action liftable"
                      type="button"
                      onClick={handleCollectJob}
                      disabled={
                        workflowAction !== null || (!jobUrl.trim() && jobText.trim().length < 10)
                      }
                    >
                      {workflowAction === "job-collector" ? "收集中" : "运行收集"}
                    </button>
                  </div>
                </div>
                <JobCollectorSummary result={jobCollectResult} />
              </div>
            </section>

            <section className="workflow-panel scroll-fade glass-surface liftable">
              <div className="section-heading">
                <div>
                  <p className="eyebrow">Week2 Parser</p>
                  <h2>结构化录入</h2>
                </div>
                <span className="state-badge">W2</span>
              </div>
              <div className="parser-result-grid">
                <ParserSummary kind="resume" result={resumeResult} />
                <ParserSummary kind="job" result={jobResult} />
              </div>
              <div className="workflow-actions">
                <button
                  className="ghost-action liftable"
                  type="button"
                  onClick={handleParseResume}
                  disabled={workflowAction !== null}
                >
                  {workflowAction === "resume-parser" ? "解析中" : "重新解析经历"}
                </button>
                <button
                  className="ghost-action liftable"
                  type="button"
                  onClick={handleParseJob}
                  disabled={workflowAction !== null}
                >
                  {workflowAction === "job-parser" ? "解析中" : "重新解析 JD"}
                </button>
              </div>
            </section>

            <section className="workflow-panel scroll-fade glass-surface liftable">
              <div className="section-heading">
                <div>
                  <p className="eyebrow">Week3 LoopEngine</p>
                  <h2>规划 · 执行 · 校验</h2>
                </div>
                <span className="state-badge">W3</span>
              </div>
              <div className="loop-stats">
                <WorkflowStat label="当前状态" value={formatState(latestState)} />
                <WorkflowStat label="步骤" value={activeStepCount.toString()} />
                <WorkflowStat label="Checkpoint" value={activeCheckpoints.toString()} />
              </div>
              <label className="workflow-field workflow-field-compact">
                <span>审批备注</span>
                <textarea
                  value={approvalNotes}
                  onChange={(event) => setApprovalNotes(event.target.value)}
                  rows={3}
                  placeholder="给当前 LoopEngine 运行写一条审批备注"
                />
              </label>
              <div className="workflow-actions loop-actions">
                <button
                  className="primary-action liftable"
                  type="button"
                  onClick={handleCreateLoopRun}
                  disabled={workflowAction !== null || (!resumeText.trim() && !jobText.trim())}
                >
                  {workflowAction === "loop-run" ? "运行中" : "启动流程"}
                </button>
                <button
                  className="ghost-action liftable"
                  type="button"
                  onClick={handleApproveLoopRun}
                  disabled={workflowAction !== null || !canApproveActiveRun}
                >
                  {workflowAction === "loop-approval" ? "审批中" : "审批通过"}
                </button>
                <button
                  className="ghost-action liftable"
                  type="button"
                  onClick={handleResumeLoopRun}
                  disabled={workflowAction !== null || !canResumeActiveRun}
                >
                  {workflowAction === "loop-resume" ? "恢复中" : "恢复运行"}
                </button>
              </div>
            </section>

            <section className="workflow-panel workflow-panel-wide scroll-fade glass-surface liftable">
              <div className="section-heading">
                <div>
                  <p className="eyebrow">Week4 MatchAgent</p>
                  <h2>匹配分 · 证据 · 缺口</h2>
                </div>
                <span className="state-badge">W4</span>
              </div>
              <div className="match-workspace">
                <MatchSummary result={matchResult} />
                <div className="match-side">
                  <p>
                    MatchAgent 会比较结构化简历和 JD，生成匹配分、证据映射、能力缺口，
                    并为 Week5 排出真实可写的改写优先级。
                  </p>
                  <button
                    className="primary-action liftable"
                    type="button"
                    onClick={handleRunMatch}
                    disabled={workflowAction !== null || !canRunMatch}
                  >
                    {workflowAction === "match-agent" ? "匹配中" : "运行匹配"}
                  </button>
                  {!canRunMatch ? (
                    <span className="match-hint">请先完成经历和 JD 解析。</span>
                  ) : null}
                </div>
              </div>
            </section>

            <section className="workflow-panel workflow-panel-wide scroll-fade glass-surface liftable">
              <div className="section-heading">
                <div>
                  <p className="eyebrow">Week5 ResumeRewriteAgent</p>
                  <h2>改写草稿 · Diff · 审批</h2>
                </div>
                <span className="state-badge">W5</span>
              </div>
              <div className="rewrite-workspace">
                <RewriteSummary result={rewriteResult} mode="audit" />
                <div className="rewrite-side">
                  <p>
                    ResumeRewriteAgent 会把 W4 的缺口和证据映射转成可审阅的简历改写建议。
                    没有证据的内容只会被标为风险，不会变成虚假经历。
                  </p>
                  <div className="workflow-actions">
                    <button
                      className="primary-action liftable"
                      type="button"
                      onClick={handleCreateRewriteDraft}
                      disabled={workflowAction !== null || !canRunRewrite}
                    >
                      {workflowAction === "rewrite-draft" ? "生成中" : "生成草稿"}
                    </button>
                    <button
                      className="ghost-action liftable"
                      type="button"
                      onClick={handleApproveRewriteDraft}
                      disabled={workflowAction !== null || !canApproveRewrite}
                    >
                      {workflowAction === "rewrite-approval" ? "审批中" : "审批草稿"}
                    </button>
                    <button
                      className="ghost-action liftable"
                      type="button"
                      onClick={handleExportRewritePdf}
                      disabled={workflowAction !== null || !canExportRewrite}
                    >
                      {workflowAction === "rewrite-export" ? "导出中" : "导出 PDF"}
                    </button>
                  </div>
                </div>
              </div>
            </section>

            <section className="workflow-panel workflow-panel-wide scroll-fade glass-surface liftable">
              <div className="section-heading">
                <div>
                  <p className="eyebrow">Week7 InterviewCoachAgent</p>
                  <h2>面试题预测 · 项目回答框架 · 模拟评分</h2>
                </div>
                <span className="state-badge">W7</span>
              </div>
              <div className="interview-workspace">
                <InterviewSummary result={interviewResult} mode="audit" />
                <div className="interview-side">
                  <p>
                    W7 继承前面几周的证据链：W2 结构化输入、W4 缺口、W5 改写草稿。
                    它把这些内容转成可练习的面试题、项目追问和项目回答框架，并保留 checkpoint。
                  </p>
                  <button
                    className="primary-action liftable"
                    type="button"
                    onClick={handleCreateInterviewPack}
                    disabled={workflowAction !== null || !canRunInterview}
                  >
                    {workflowAction === "interview-pack" ? "生成中" : "运行面试教练"}
                  </button>
                  {!canRunInterview ? (
                    <span className="match-hint">请先完成经历和 JD 解析。</span>
                  ) : null}
                </div>
              </div>
            </section>

            <section className="workflow-panel workflow-panel-wide scroll-fade glass-surface liftable">
              <div className="section-heading">
                <div>
                  <p className="eyebrow">Week8 ApplicationCRMAgent</p>
                  <h2>投递记录 · 面试反馈 · 长期记忆</h2>
                </div>
                <span className="state-badge">W8</span>
              </div>
              <div className="application-workspace">
                <ApplicationSummary record={activeApplication} applications={applications} />
                <div className="application-side">
                  <p>
                    W8 把单次 Agent 输出沉淀成长期求职 CRM：投递状态、记忆、反馈、
                    下一步任务都会进入 ApplicationRecord，并保存 checkpoint。
                  </p>
                  <button
                    className="primary-action liftable"
                    type="button"
                    onClick={handleCreateApplicationRecord}
                    disabled={workflowAction !== null || !canCreateApplication}
                  >
                    {workflowAction === "application-record" ? "保存中" : "运行 CRM Agent"}
                  </button>
                  {!canCreateApplication ? (
                    <span className="match-hint">请先完成 JD 解析。</span>
                  ) : null}
                </div>
              </div>
            </section>

            <section className="workflow-panel workflow-panel-wide scroll-fade glass-surface liftable">
              <div className="section-heading">
                <div>
                  <p className="eyebrow">Week9 EvalHarnessAgent</p>
                  <h2>JSONL Case · Rule Grader · QualityGate · HTML Report</h2>
                </div>
                <span className="state-badge">W9</span>
              </div>
              <div className="eval-workspace">
                <EvalSummary report={evalResult?.report ?? null} reports={evalReports} />
                <div className="eval-side">
                  <p>
                    W9 对 W2-W8 的产物做规则评测：解析覆盖、证据链、改写风险、
                    面试准备和 CRM 记忆都会进入报告。失败项会写入 run trace checkpoint。
                  </p>
                  <button
                    className="primary-action liftable"
                    type="button"
                    onClick={handleRunEval}
                    disabled={workflowAction !== null || !canRunEval}
                  >
                    {workflowAction === "eval-harness" ? "评测中" : "运行 Eval Harness"}
                  </button>
                  {!canRunEval ? (
                    <span className="match-hint">请先生成任意 W2-W8 产物。</span>
                  ) : null}
                </div>
              </div>
            </section>
          </section>
        </details>

        {workflowError ? <p className="error-text glass-surface revealable">{workflowError}</p> : null}

        {activeRun ? (
          <RunTrace detail={activeRun} />
        ) : (
          <section className="empty-state glass-surface liftable revealable">
            <p className="eyebrow">运行轨迹</p>
            <h2>等待第一次运行</h2>
            <p>规划结果、checkpoint、事件、token、延迟和成本会显示在这里。</p>
          </section>
        )}

        <section className="run-list glass-surface liftable revealable">
          <div className="section-heading">
            <div>
              <p className="eyebrow">历史记录</p>
              <h2>最近运行</h2>
            </div>
            <button className="ghost-action liftable" type="button" onClick={refreshRuns}>
              刷新
            </button>
          </div>
          <div className="run-table">
            {runs.map((run) => (
              <div className="run-row liftable revealable" key={run.run_id}>
                <span>{run.run_id}</span>
                <strong>{formatState(run.state)}</strong>
                <span>{run.step_count} 个步骤</span>
                <span>{run.total_tokens} Token</span>
              </div>
            ))}
          </div>
        </section>
      </main>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="metric glass-surface liftable revealable">
      <span className="metric-visual" aria-hidden="true" />
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function ProviderQuota({ provider }: { provider: ProviderBalance }) {
  const percent = Math.max(0, Math.min(100, provider.percent_remaining));
  return (
    <article
      className={`quota-card quota-${provider.status}`}
      title={`${provider.balance_label} · ${provider.unit_label}`}
      style={
        {
          "--quota-level": `${percent}%`,
          "--quota-fill": `${100 - percent}%`
        } as React.CSSProperties
      }
    >
      <div className="quota-copy">
        <span>{provider.live ? "实时" : provider.configured ? "估算" : "未启用"}</span>
        <strong>{provider.label}</strong>
        <p>{provider.remaining_label}</p>
      </div>
      <div className="quota-meter" aria-label={`${provider.label} 剩余 ${percent.toFixed(0)}%`}>
        <span className="quota-water">
          <i />
        </span>
        <b>{Math.round(percent)}%</b>
      </div>
    </article>
  );
}

function ProductStep({
  index,
  title,
  text,
  active
}: {
  index: string;
  title: string;
  text: string;
  active: boolean;
}) {
  return (
    <article className={active ? "journey-step journey-step-active" : "journey-step"}>
      <span>{index}</span>
      <strong>{title}</strong>
      <p>{text}</p>
    </article>
  );
}

function ParserSummary({
  kind,
  result
}: {
  kind: "resume" | "job";
  result: ParseResumeResponse | ParseJobResponse | null;
}) {
  if (!result) {
    return (
      <article className="parser-result-card parser-result-empty">
        <p className="eyebrow">{kind === "resume" ? "简历画像" : "JD 画像"}</p>
        <h3>{kind === "resume" ? "等待解析简历" : "等待解析 JD"}</h3>
        <p>结构化字段、元数据和风险提示会显示在这里。</p>
      </article>
    );
  }

  const isResume = kind === "resume";
  const resumeProfile = isResume ? (result as ParseResumeResponse).profile : null;
  const jobProfile = !isResume ? (result as ParseJobResponse).profile : null;
  const title = resumeProfile
    ? `${resumeProfile.skills.length} 个技能 · ${resumeProfile.projects.length} 个项目`
    : `${jobProfile?.company ?? "未知公司"} · ${jobProfile?.title ?? "未命名岗位"}`;
  const summary = resumeProfile
    ? `${resumeProfile.education.length} 段教育 · ${resumeProfile.experiences.length} 段经历 · ${resumeProfile.keywords.length} 个关键词`
    : `${jobProfile?.hard_requirements.length ?? 0} 个硬性要求 · ${
        jobProfile?.nice_to_have.length ?? 0
      } 个加分项 · ${jobProfile?.responsibilities.length ?? 0} 条职责`;
  const chips = resumeProfile
    ? resumeProfile.skills.concat(resumeProfile.keywords).slice(0, 6)
    : (jobProfile?.tech_keywords ?? []).concat(jobProfile?.hidden_keywords ?? []).slice(0, 6);

  return (
    <article className="parser-result-card liftable">
      <p className="eyebrow">{isResume ? "简历画像" : "JD 画像"}</p>
      <h3>{title}</h3>
      <p>{summary}</p>
      <div className="chip-row">
        {(chips.length ? chips : ["暂无关键词"]).map((chip, index) => (
          <span key={`${chip}-${index}`}>{chip}</span>
        ))}
      </div>
      <dl className="metadata-row">
        <div>
          <dt>来源</dt>
          <dd>{formatSource(result.metadata.source)}</dd>
        </div>
        <div>
          <dt>模型</dt>
          <dd>{result.metadata.model ?? "本地规则"}</dd>
        </div>
        <div>
          <dt>问题</dt>
          <dd>{result.metadata.issues.length}</dd>
        </div>
      </dl>
    </article>
  );
}

function JobCollectorSummary({ result }: { result: JobCollectResponse | null }) {
  if (!result) {
    return (
      <article className="collector-summary collector-summary-empty">
        <p className="eyebrow">岗位收集证据</p>
        <h3>等待 W6 收集公开岗位。</h3>
        <p>公开链接、粘贴文本、正文 hash、截图状态和安全边界会显示在这里。</p>
      </article>
    );
  }

  const { snapshot } = result;
  const warnings = snapshot.safety.warnings;
  const evidenceItems = [
    ["来源", formatCollectorSource(snapshot.source_type)],
    ["正文 Hash", snapshot.text_hash.slice(0, 12)],
    ["HTML Hash", snapshot.html_hash ? snapshot.html_hash.slice(0, 12) : "未保存"],
    ["截图", formatScreenshotStatus(snapshot.screenshot_status)]
  ];

  return (
    <article className="collector-summary liftable">
      <div className="collector-summary-head">
        <div>
          <p className="eyebrow">岗位收集证据</p>
          <h3>{snapshot.title || snapshot.source_name || "已收集岗位正文"}</h3>
          {snapshot.source_url ? <p>{snapshot.source_url}</p> : null}
        </div>
        <span className={snapshot.safety.allowed ? "safety-pill safety-ok" : "safety-pill"}>
          {snapshot.safety.allowed ? "安全通过" : "已阻断"}
        </span>
      </div>
      <div className="collector-evidence-grid">
        {evidenceItems.map(([label, value]) => (
          <div key={label}>
            <span>{label}</span>
            <strong>{value}</strong>
          </div>
        ))}
      </div>
      <div className="collector-preview">
        <span>正文预览</span>
        <p>{snapshot.text.slice(0, 220)}{snapshot.text.length > 220 ? "..." : ""}</p>
      </div>
      <div className="safety-list">
        {(warnings.length ? warnings : snapshot.safety.rules.slice(0, 3)).map((item) => (
          <span key={item}>{item}</span>
        ))}
      </div>
    </article>
  );
}

function WorkflowStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="workflow-stat">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function MatchSummary({ result }: { result: MatchResponse | null }) {
  if (!result) {
    return (
      <article className="match-summary match-summary-empty">
        <div className="score-orb">
          <strong>--</strong>
          <span>分数</span>
        </div>
        <div>
          <p className="eyebrow">等待 MatchAgent</p>
          <h3>先解析简历和 JD，再运行匹配。</h3>
          <p>证据映射、缺失关键词和改写优先级会显示在这里。</p>
        </div>
      </article>
    );
  }

  const { match } = result;
  const breakdown = [
    ["硬性要求", match.score_breakdown.hard_requirements],
    ["加分项", match.score_breakdown.nice_to_have],
    ["岗位职责", match.score_breakdown.responsibilities],
    ["关键词", match.score_breakdown.keyword_alignment]
  ];
  const topGaps = match.gaps.slice(0, 3);
  const topPriorities = match.priority_ranking.slice(0, 3);

  return (
    <article className="match-summary">
      <div className="match-topline">
        <div className="score-orb score-orb-on">
          <strong>{Math.round(match.overall_score)}</strong>
          <span>分数</span>
        </div>
        <div>
          <p className="eyebrow">匹配结果</p>
          <h3>{match.summary}</h3>
          <div className="keyword-cloud">
            {match.matched_keywords.slice(0, 6).map((keyword) => (
              <span className="keyword-match" key={`match-${keyword}`}>
                {keyword}
              </span>
            ))}
            {match.missing_keywords.slice(0, 5).map((keyword) => (
              <span className="keyword-missing" key={`missing-${keyword}`}>
                {keyword}
              </span>
            ))}
          </div>
        </div>
      </div>
      <div className="match-breakdown">
        {breakdown.map(([label, value]) => (
          <div key={label}>
            <span>{label}</span>
            <strong>{Number(value).toFixed(0)}</strong>
          </div>
        ))}
      </div>
      <div className="match-lists">
        <div>
          <p className="eyebrow">主要缺口</p>
          {topGaps.length ? (
            topGaps.map((gap) => (
              <div className="mini-row" key={gap.requirement}>
                <strong>{formatSeverity(gap.severity)}</strong>
                <span>{gap.requirement}</span>
              </div>
            ))
          ) : (
            <p>没有发现关键缺口。</p>
          )}
        </div>
        <div>
          <p className="eyebrow">改写优先级</p>
          {topPriorities.length ? (
            topPriorities.map((priority) => (
              <div className="mini-row" key={`${priority.priority}-${priority.item}`}>
                <strong>{priority.priority}</strong>
                <span>{priority.item}</span>
              </div>
            ))
          ) : (
            <p>暂无改写优先级。</p>
          )}
        </div>
      </div>
    </article>
  );
}

function RewriteSummary({
  result,
  mode = "candidate"
}: {
  result: ResumeRewriteResponse | null;
  mode?: "candidate" | "audit";
}) {
  if (!result) {
    return (
      <article className="rewrite-summary rewrite-summary-empty">
        <div>
          <p className="eyebrow">等待 ResumeRewriteAgent</p>
          <h3>先完成匹配，再生成证据锁定的中文投递稿。</h3>
          <p>
            {mode === "audit"
              ? "Diff、关联证据、审批状态和风险提示会显示在这里。"
              : "简历标题、个人概要、核心技能和项目经历会显示在这里。"}
          </p>
        </div>
      </article>
    );
  }

  const { draft } = result;
  const tailored = draft.tailored_resume;
  const showAudit = mode === "audit" || !tailored;
  const topChanges = draft.changes.slice(0, 5);
  const evidenceCount = draft.changes.reduce((sum, change) => sum + change.evidence.length, 0);

  return (
    <article className="rewrite-summary">
      <div className="rewrite-header">
        <div>
          <p className="eyebrow">{tailored ? "中文投递稿" : "改写草稿"}</p>
          <h3>{tailored?.headline ?? draft.headline}</h3>
          <div className="keyword-cloud">
            {(tailored?.skills ?? draft.target_keywords).slice(0, 8).map((keyword) => (
              <span className="keyword-match" key={`rewrite-keyword-${keyword}`}>
                {keyword}
              </span>
            ))}
          </div>
        </div>
        <div className="rewrite-status">
          <span>{formatApprovalStatus(draft.approval_status)}</span>
          <strong>{draft.changes.length}</strong>
          <small>{showAudit ? "处改写" : "处待确认"}</small>
        </div>
      </div>

      {showAudit ? (
        <div className="rewrite-metrics">
          <div>
            <span>证据链接</span>
            <strong>{evidenceCount}</strong>
          </div>
          <div>
            <span>风险</span>
            <strong>{draft.risk_warnings.length}</strong>
          </div>
          <div>
            <span>运行</span>
            <strong>{result.run_id.slice(0, 12)}</strong>
          </div>
        </div>
      ) : null}

      {tailored ? (
        <div className="tailored-resume-preview">
          <p className="eyebrow">个人概要</p>
          <p className="tailored-summary-text">{tailored.summary}</p>
          <div className="tailored-skill-line">
            {tailored.skills.slice(0, 10).map((skill) => (
              <span className="keyword-match" key={`tailored-skill-${skill}`}>
                {skill}
              </span>
            ))}
          </div>
          {tailored.projects.length ? (
            <div className="tailored-projects">
              {tailored.projects.slice(0, 2).map((project) => (
                <div key={`tailored-${project.name}`}>
                  <span>{project.name}</span>
                  <p>{project.bullets[0]}</p>
                </div>
              ))}
            </div>
          ) : null}
          {mode === "audit" ? <small>{tailored.evidence_notice}</small> : null}
        </div>
      ) : null}

      {showAudit ? (
        <div className="rewrite-change-list">
          {topChanges.map((change) => (
            <div className="rewrite-change" key={change.change_id}>
              <div className="rewrite-change-title">
                <strong>{formatRewriteSection(change.section)}</strong>
                <span className={`risk-pill risk-${change.risk_level}`}>
                  {formatRiskLevel(change.risk_level)}
                </span>
              </div>
              {change.original_text ? (
                <p className="diff-line diff-remove">- {change.original_text}</p>
              ) : null}
              <p className="diff-line diff-add">+ {change.revised_text}</p>
              <p>{change.rationale}</p>
              {change.evidence.length ? (
                <div className="evidence-strip">
                  {change.evidence.slice(0, 2).map((item) => (
                    <span key={`${change.change_id}-${item.field_path}-${item.source_text}`}>
                      {item.field_path}: {item.source_text}
                    </span>
                  ))}
                </div>
              ) : null}
            </div>
          ))}
        </div>
      ) : null}

      {showAudit && draft.risk_warnings.length ? (
        <div className="risk-list">
          <p className="eyebrow">风险提示</p>
          {draft.risk_warnings.slice(0, 4).map((warning) => (
            <span key={warning}>{warning}</span>
          ))}
        </div>
      ) : null}
    </article>
  );
}

function InterviewSummary({
  result,
  mode = "candidate"
}: {
  result: InterviewPackResponse | null;
  mode?: "candidate" | "audit";
}) {
  if (!result) {
    return (
      <article className="interview-summary interview-summary-empty">
        <div className="score-orb">
          <strong>--</strong>
          <span>准备分</span>
        </div>
        <div>
          <p className="eyebrow">等待 InterviewCoachAgent</p>
          <h3>先解析材料，再生成面试准备包。</h3>
          <p>真实面试风格的问题、项目追问、回答框架和复习清单会显示在这里。</p>
        </div>
      </article>
    );
  }

  const { pack } = result;
  const topQuestions = pack.predicted_questions.slice(0, 4);
  const topFollowups = pack.project_followups.slice(0, 3);
  const topStars = pack.star_answers.slice(0, 2);
  const gapPoints = pack.knowledge_points.filter((point) => point.current_signal === "gap").slice(0, 4);

  return (
    <article className="interview-summary">
      <div className="interview-topline">
        <div className="score-orb score-orb-on">
          <strong>{Math.round(pack.mock_score.overall_score)}</strong>
          <span>准备分</span>
        </div>
        <div>
          <p className="eyebrow">面试准备包</p>
          <h3>{pack.company ?? "目标公司"} · {pack.title ?? "目标岗位"}</h3>
          <div className="keyword-cloud">
            {pack.target_keywords.slice(0, 9).map((keyword) => (
              <span className="keyword-match" key={`interview-keyword-${keyword}`}>
                {keyword}
              </span>
            ))}
          </div>
        </div>
      </div>

      <div className="interview-score-grid">
        {pack.mock_score.dimensions.slice(0, 4).map((dimension) => (
          <div key={dimension.name}>
            <span>{dimension.name}</span>
            <strong>{Math.round(dimension.score)}</strong>
            <p>{dimension.feedback}</p>
          </div>
        ))}
      </div>

      <div className="interview-section-grid">
        <section>
          <p className="eyebrow">预测问题</p>
          {topQuestions.map((question) => (
            <div className="interview-card" key={question.question_id}>
              <span>{question.priority} · {formatInterviewCategory(question.category)}</span>
              <strong>{question.question}</strong>
              <p>{question.suggested_angle}</p>
            </div>
          ))}
        </section>
        <section>
          <p className="eyebrow">项目追问</p>
          {topFollowups.map((followup) => (
            <div className="interview-card" key={`${followup.project_name}-${followup.question}`}>
              <span>{followup.project_name}</span>
              <strong>{followup.question}</strong>
              <p>{followup.probe_focus}</p>
            </div>
          ))}
        </section>
      </div>

      <div className="interview-section-grid">
        <section>
          <p className="eyebrow">项目回答框架</p>
          {topStars.map((answer) => (
            <div className="interview-card" key={answer.prompt}>
              <span>按背景 · 任务 · 行动 · 结果组织</span>
              <strong>{answer.prompt}</strong>
              <p>{answer.action}</p>
            </div>
          ))}
        </section>
        <section>
          <p className="eyebrow">需要补强</p>
          {(gapPoints.length ? gapPoints : pack.knowledge_points.slice(0, 3)).map((point) => (
            <div className="interview-card" key={point.topic}>
              <span>{formatKnowledgeSignal(point.current_signal)}</span>
              <strong>{point.topic}</strong>
              <p>{point.review_prompt}</p>
            </div>
          ))}
        </section>
      </div>

      {mode === "audit" && pack.evidence_warnings.length ? (
        <div className="risk-list">
          <p className="eyebrow">证据风险</p>
          {pack.evidence_warnings.slice(0, 4).map((warning) => (
            <span key={warning}>{warning}</span>
          ))}
        </div>
      ) : null}
    </article>
  );
}

function ApplicationSummary({
  record,
  applications
}: {
  record: ApplicationRecord | null;
  applications: ApplicationRecord[];
}) {
  if (!record) {
    return (
      <article className="application-summary application-summary-empty">
        <div className="score-orb">
          <strong>--</strong>
          <span>记录</span>
        </div>
        <div>
          <p className="eyebrow">等待 ApplicationCRMAgent</p>
          <h3>保存第一条投递记录后，长期记忆和下一步任务会显示在这里。</h3>
          <p>W8 会把岗位、匹配、改写、面试准备和反馈沉淀为可追踪 CRM。</p>
        </div>
      </article>
    );
  }

  const openTasks = record.tasks.filter((task) => task.status === "OPEN").slice(0, 5);
  const topMemories = record.memories.slice(0, 6);
  const recentApplications = applications.slice(0, 4);

  return (
    <article className="application-summary">
      <div className="application-topline">
        <div className="score-orb score-orb-on">
          <strong>{formatApplicationStatusShort(record.status)}</strong>
          <span>状态</span>
        </div>
        <div>
          <p className="eyebrow">投递记录</p>
          <h3>{record.company ?? "目标公司"} · {record.title ?? "目标岗位"}</h3>
          <div className="keyword-cloud">
            {record.target_keywords.slice(0, 9).map((keyword) => (
              <span className="keyword-match" key={`application-keyword-${keyword}`}>
                {keyword}
              </span>
            ))}
          </div>
        </div>
      </div>

      <div className="application-metrics">
        <div>
          <span>匹配分</span>
          <strong>{record.match_score == null ? "--" : Math.round(record.match_score)}</strong>
        </div>
        <div>
          <span>面试准备分</span>
          <strong>
            {record.interview_score == null ? "--" : Math.round(record.interview_score)}
          </strong>
        </div>
        <div>
          <span>记忆</span>
          <strong>{record.memories.length}</strong>
        </div>
        <div>
          <span>任务</span>
          <strong>{openTasks.length}</strong>
        </div>
      </div>

      <div className="application-section-grid">
        <section>
          <p className="eyebrow">长期记忆</p>
          {topMemories.map((memory) => (
            <div className="application-card" key={memory.memory_id}>
              <span>{formatMemoryCategory(memory.category)} · {memory.source}</span>
              <strong>{memory.text}</strong>
            </div>
          ))}
        </section>
        <section>
          <p className="eyebrow">下一步任务</p>
          {openTasks.length ? (
            openTasks.map((task) => (
              <div className="application-card" key={task.task_id}>
                <span>{task.priority} · {task.due_hint ?? "待安排"}</span>
                <strong>{task.title}</strong>
                <p>{task.reason}</p>
              </div>
            ))
          ) : (
            <div className="application-card">
              <span>完成</span>
              <strong>暂无打开任务。</strong>
            </div>
          )}
        </section>
      </div>

      {recentApplications.length ? (
        <div className="application-list">
          <p className="eyebrow">最近投递</p>
          {recentApplications.map((item) => (
            <div className="application-row" key={item.application_id}>
              <span>{item.company ?? "未知公司"}</span>
              <strong>{item.title ?? "未知岗位"}</strong>
              <em>{formatApplicationStatus(item.status)}</em>
            </div>
          ))}
        </div>
      ) : null}
    </article>
  );
}

function EvalSummary({
  report,
  reports
}: {
  report: EvalRunResponse["report"] | null;
  reports: EvalReportSummary[];
}) {
  if (!report) {
    return (
      <article className="eval-summary eval-summary-empty">
        <div className="score-orb">
          <strong>--</strong>
          <span>评测</span>
        </div>
        <div>
          <p className="eyebrow">等待 EvalHarnessAgent</p>
          <h3>运行一次质量评测后，规则分数和 QualityGate 会显示在这里。</h3>
          <p>W9 会把前面各 Week 的输出转成可验证报告，而不是只相信“看起来不错”。</p>
          {reports.length ? (
            <div className="eval-history">
              {reports.slice(0, 3).map((item) => (
                <span key={item.report_id}>
                  {item.case_name} · {Math.round(item.overall_score)} · {item.decision}
                </span>
              ))}
            </div>
          ) : null}
        </div>
      </article>
    );
  }

  const failedRules = report.rule_results.filter((rule) => rule.status === "failed");
  const warningRules = report.rule_results.filter((rule) => rule.status === "warning");
  const passedRules = report.rule_results.filter((rule) => rule.status === "passed");
  const priorityRules = [...failedRules, ...warningRules, ...passedRules].slice(0, 7);

  return (
    <article className="eval-summary">
      <div className="eval-topline">
        <div className={`score-orb score-orb-on eval-decision-${report.gate.decision.toLowerCase()}`}>
          <strong>{Math.round(report.overall_score)}</strong>
          <span>{report.gate.decision}</span>
        </div>
        <div>
          <p className="eyebrow">QualityGate</p>
          <h3>{formatEvalDecision(report.gate.decision)}</h3>
          <p>{report.summary}</p>
          <div className="keyword-cloud">
            {report.evaluated_artifacts.map((artifact) => (
              <span className="keyword-match" key={`eval-artifact-${artifact}`}>
                {formatEvalArtifact(artifact)}
              </span>
            ))}
          </div>
        </div>
      </div>

      <div className="eval-metrics">
        <div>
          <span>通过</span>
          <strong>{passedRules.length}</strong>
        </div>
        <div>
          <span>警告</span>
          <strong>{warningRules.length}</strong>
        </div>
        <div>
          <span>失败</span>
          <strong>{failedRules.length}</strong>
        </div>
        <div>
          <span>模式</span>
          <strong>{formatEvalJudgeMode(report.judge_mode)}</strong>
        </div>
      </div>

      <div className="eval-rule-list">
        {priorityRules.map((rule) => (
          <div className={`eval-rule eval-rule-${rule.status}`} key={rule.rule_id}>
            <span>{formatEvalArtifact(rule.category)} · {formatEvalRuleStatus(rule.status)}</span>
            <strong>{rule.name}</strong>
            <p>{rule.message}</p>
            {rule.evidence.length ? (
              <em>{rule.evidence.slice(0, 3).join(" / ")}</em>
            ) : null}
          </div>
        ))}
      </div>

      {report.gate.release_notes.length ? (
        <div className="eval-release-notes">
          <p className="eyebrow">放行说明</p>
          {report.gate.release_notes.map((note) => (
            <span key={note}>{note}</span>
          ))}
        </div>
      ) : null}
    </article>
  );
}

function formatEvalJudgeMode(mode: string): string {
  if (mode === "rule_based") {
    return "规则";
  }
  if (mode === "llm_as_judge_dry_run") {
    return "Judge Dry-run";
  }
  return "Judge";
}

function formatState(state: string): string {
  const labels: Record<string, string> = {
    IDLE: "空闲",
    CREATED: "已创建",
    RUNNING: "运行中",
    WAITING_APPROVAL: "等待审批",
    COMPLETED: "已完成",
    FAILED: "失败",
    CANCELLED: "已取消",
    PAUSED: "已暂停",
    APPROVED: "已审批"
  };
  return labels[state] ?? titleizeToken(state);
}

function isJobCollectResponse(
  value: ParseJobResponse | JobCollectResponse,
): value is JobCollectResponse {
  return "snapshot" in value;
}

function formatSource(source: string): string {
  const labels: Record<string, string> = {
    heuristic_dry_run: "本地规则解析",
    llm_structured_output: "LLM 结构化输出",
    llm_structured: "LLM 结构化输出",
    local: "本地",
    manual: "手动输入"
  };
  return labels[source] ?? titleizeToken(source);
}

function formatCollectorSource(source: string): string {
  const labels: Record<string, string> = {
    url: "公开链接",
    html: "HTML 片段",
    text: "粘贴文本"
  };
  return labels[source] ?? titleizeToken(source);
}

function formatScreenshotStatus(status: string): string {
  const labels: Record<string, string> = {
    captured: "已截图",
    skipped: "未请求",
    unavailable: "不可用"
  };
  return labels[status] ?? titleizeToken(status);
}

function formatSeverity(severity: string): string {
  const labels: Record<string, string> = {
    high: "高",
    medium: "中",
    low: "低",
    none: "无"
  };
  return labels[severity.toLowerCase()] ?? severity;
}

function formatRiskLevel(level: string): string {
  const labels: Record<string, string> = {
    low: "低风险",
    medium: "中风险",
    high: "高风险"
  };
  return labels[level.toLowerCase()] ?? level;
}

function formatInterviewCategory(category: string): string {
  const labels: Record<string, string> = {
    technical: "技术题",
    project: "项目题",
    behavioral: "行为题",
    gap: "缺口追问",
    system_design: "方案设计"
  };
  return labels[category] ?? titleizeToken(category);
}

function formatKnowledgeSignal(signal: string): string {
  const labels: Record<string, string> = {
    covered: "已有证据",
    partial: "部分相关",
    gap: "需要补强"
  };
  return labels[signal] ?? titleizeToken(signal);
}

function formatApplicationStatus(status: string): string {
  const labels: Record<string, string> = {
    SAVED: "已收藏",
    READY_TO_APPLY: "准备投递",
    APPLIED: "已投递",
    INTERVIEWING: "面试中",
    OFFER: "已 Offer",
    REJECTED: "未通过",
    ARCHIVED: "已归档"
  };
  return labels[status] ?? formatState(status);
}

function formatApplicationStatusShort(status: string): string {
  const labels: Record<string, string> = {
    SAVED: "藏",
    READY_TO_APPLY: "备",
    APPLIED: "投",
    INTERVIEWING: "面",
    OFFER: "O",
    REJECTED: "拒",
    ARCHIVED: "档"
  };
  return labels[status] ?? status.slice(0, 2);
}

function formatMemoryCategory(category: string): string {
  const labels: Record<string, string> = {
    strength: "优势",
    gap: "缺口",
    preference: "偏好",
    feedback: "反馈",
    follow_up: "跟进"
  };
  return labels[category] ?? titleizeToken(category);
}

function formatEvalDecision(decision: string): string {
  const labels: Record<string, string> = {
    PASS: "通过，可以进入人工确认",
    WARN: "可继续，但建议处理警告",
    BLOCK: "已阻断，需要先修复风险"
  };
  return labels[decision] ?? decision;
}

function formatEvalArtifact(artifact: string): string {
  const labels: Record<string, string> = {
    parser: "解析",
    matching: "匹配",
    rewrite: "改写",
    interview: "面试",
    application: "CRM",
    judge: "Judge"
  };
  return labels[artifact] ?? titleizeToken(artifact);
}

function formatEvalRuleStatus(status: string): string {
  const labels: Record<string, string> = {
    passed: "通过",
    warning: "警告",
    failed: "失败"
  };
  return labels[status] ?? titleizeToken(status);
}

function formatRewriteSection(section: string): string {
  const labels: Record<string, string> = {
    summary: "个人概要",
    skills: "技能",
    project: "项目经历",
    projects: "项目经历",
    experience: "工作经历",
    education: "教育经历",
    evidence_needed: "需要补充证据"
  };
  return labels[section.toLowerCase()] ?? titleizeToken(section);
}

function formatApprovalStatus(status: string): string {
  const labels: Record<string, string> = {
    WAITING_APPROVAL: "等待审批",
    APPROVED: "已审批",
    REJECTED: "已拒绝",
    DRAFT: "草稿"
  };
  return labels[status] ?? formatState(status);
}

function titleizeToken(value: string): string {
  return value
    .split("_")
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(" ");
}

function splitInput(value: string): string[] {
  return value
    .split(/[\n,，;；]+/)
    .map((item) => item.trim())
    .filter(Boolean);
}

declare global {
  interface Window {
    webkitAudioContext: typeof AudioContext;
  }
}
