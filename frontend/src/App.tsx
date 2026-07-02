import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";

import {
  approveLoopRun,
  createLoopRun,
  createRun,
  getRun,
  listRuns,
  parseJob,
  parseResume,
  resumeLoopRun
} from "./api/client";
import { RunTrace } from "./components/RunTrace";
import type { ParseJobResponse, ParseResumeResponse, RunDetail, RunSummary } from "./types";

const defaultGoal =
  "为 AI Agent 实习岗位生成可追踪运行计划，保留人工审批点和成本记录。";
const defaultResumeText =
  "Education: Example University\nSkills: Python, FastAPI, React\nProject: CareerPilot built a traceable Agent workflow.";
const defaultJobText =
  "Company: Example AI\nTitle: AI Agent Backend Intern\nRequired: Python, FastAPI, SQL\nPreferred: React, TypeScript";

type WorkflowAction =
  | "resume-parser"
  | "job-parser"
  | "loop-run"
  | "loop-approval"
  | "loop-resume";

export default function App() {
  const [goal, setGoal] = useState(defaultGoal);
  const [runs, setRuns] = useState<RunSummary[]>([]);
  const [activeRun, setActiveRun] = useState<RunDetail | null>(null);
  const [resumeText, setResumeText] = useState(defaultResumeText);
  const [jobText, setJobText] = useState(defaultJobText);
  const [resumeResult, setResumeResult] = useState<ParseResumeResponse | null>(null);
  const [jobResult, setJobResult] = useState<ParseJobResponse | null>(null);
  const [workflowAction, setWorkflowAction] = useState<WorkflowAction | null>(null);
  const [workflowError, setWorkflowError] = useState<string | null>(null);
  const [approvalNotes, setApprovalNotes] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [audioName, setAudioName] = useState("No track");
  const [isPlaying, setIsPlaying] = useState(false);
  const [isMusicDockOpen, setIsMusicDockOpen] = useState(false);
  const shellRef = useRef<HTMLDivElement | null>(null);
  const musicDockRef = useRef<HTMLElement | null>(null);
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
  const audioLevelRef = useRef(0);
  const pointerRef = useRef({ x: 0, y: 0, targetX: 0, targetY: 0, scroll: 0 });

  async function refreshRuns() {
    const data = await listRuns();
    setRuns(data);
  }

  async function showRun(runId: string) {
    const detail = await getRun(runId);
    setActiveRun(detail);
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
      setError(err instanceof Error ? err.message : "Failed to load runs.");
    });
  }, []);

  useEffect(() => {
    const revealItems = Array.from(document.querySelectorAll<HTMLElement>(".revealable"));
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.target.classList.contains("reveal-once")) {
            if (entry.isIntersecting) {
              entry.target.classList.add("is-visible");
            }
            return;
          }
          entry.target.classList.toggle("is-visible", entry.isIntersecting);
        });
      },
      { rootMargin: "-8% 0px -10% 0px", threshold: 0.16 },
    );

    revealItems.forEach((item) => observer.observe(item));
    return () => observer.disconnect();
  }, [activeRun, runs.length]);

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
        const opacity = Math.max(0, Math.min(1, (rect.bottom - 8) / 150));
        heroCopy.style.setProperty("--hero-copy-opacity", opacity.toFixed(3));
      }
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

    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.floor(window.innerWidth * dpr);
      canvas.height = Math.floor(window.innerHeight * dpr);
      canvas.style.width = `${window.innerWidth}px`;
      canvas.style.height = `${window.innerHeight}px`;
      context.setTransform(dpr, 0, 0, dpr, 0, 0);
    };

    const draw = (now: number) => {
      const width = window.innerWidth;
      const height = window.innerHeight;
      const t = now / 1000;
      const pointer = pointerRef.current;
      pointer.x += (pointer.targetX - pointer.x) * 0.045;
      pointer.y += (pointer.targetY - pointer.y) * 0.045;

      const audioLift = audioLevelRef.current;
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
        const radius = Math.max(width, height) * (0.34 + index * 0.022 + audioLift * 0.035);
        const gradient = context.createRadialGradient(x, y, 0, x, y, radius);
        const hue = color.hue + Math.sin(t * 0.24 + index) * 14;
        gradient.addColorStop(
          0,
          `hsla(${hue}, ${color.sat}%, ${color.light}%, ${0.46 + audioLift * 0.14})`,
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
        context.strokeStyle = `hsla(${hue}, 76%, 74%, ${0.11 + audioLift * 0.05})`;
        context.stroke();
      }
      context.restore();

      context.globalCompositeOperation = "source-over";
      context.lineWidth = 1.2;
      for (let row = -1; row < 9; row += 1) {
        const y = height * (row / 8) + Math.sin(t * 0.34 + row) * 24 + pointer.y * 24;
        context.beginPath();
        for (let x = -20; x <= width + 20; x += 22) {
          const wave =
            Math.sin(x * 0.008 + t * 0.72 + row * 0.8) * (12 + audioLift * 8) +
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
    try {
      const detail = await createRun(runGoal);
      setActiveRun(detail);
      await refreshRuns();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create run.");
    } finally {
      setIsLoading(false);
    }
  }

  async function handleParseResume() {
    const text = resumeText.trim();
    if (text.length < 10 || workflowAction) {
      setWorkflowError("Resume text needs at least 10 characters.");
      return;
    }

    setWorkflowAction("resume-parser");
    setWorkflowError(null);
    try {
      const result = await parseResume(text);
      setResumeResult(result);
      await showRun(result.run_id);
      await refreshRuns();
    } catch (err) {
      setWorkflowError(err instanceof Error ? err.message : "Resume parser failed.");
    } finally {
      setWorkflowAction(null);
    }
  }

  async function handleParseJob() {
    const text = jobText.trim();
    if (text.length < 10 || workflowAction) {
      setWorkflowError("Job description needs at least 10 characters.");
      return;
    }

    setWorkflowAction("job-parser");
    setWorkflowError(null);
    try {
      const result = await parseJob(text);
      setJobResult(result);
      await showRun(result.run_id);
      await refreshRuns();
    } catch (err) {
      setWorkflowError(err instanceof Error ? err.message : "Job parser failed.");
    } finally {
      setWorkflowAction(null);
    }
  }

  async function handleCreateLoopRun() {
    const runGoal = goal.trim();
    const resume = resumeText.trim();
    const job = jobText.trim();
    if (!runGoal || (!resume && !job) || workflowAction) {
      setWorkflowError("LoopEngine needs a goal and at least one resume/JD input.");
      return;
    }

    setWorkflowAction("loop-run");
    setWorkflowError(null);
    try {
      const detail = await createLoopRun({
        goal: runGoal,
        ...(resume ? { resume_text: resume } : {}),
        ...(job ? { job_text: job } : {})
      });
      setActiveRun(detail);
      await refreshRuns();
    } catch (err) {
      setWorkflowError(err instanceof Error ? err.message : "LoopEngine run failed.");
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
    try {
      const detail = await approveLoopRun(activeRun.run.run_id, approvalNotes.trim());
      setActiveRun(detail);
      setApprovalNotes("");
      await refreshRuns();
    } catch (err) {
      setWorkflowError(err instanceof Error ? err.message : "Approval failed.");
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
    try {
      const detail = await resumeLoopRun(activeRun.run.run_id);
      setActiveRun(detail);
      await refreshRuns();
    } catch (err) {
      setWorkflowError(err instanceof Error ? err.message : "Resume failed.");
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

  return (
    <div className="ambient-stage" ref={shellRef}>
      <canvas className="flow-canvas" ref={flowCanvasRef} aria-hidden="true" />
      <div className="ambient-noise" />
      <audio ref={audioRef} onEnded={() => setIsPlaying(false)} />

      <main className="app-shell">
        <header
          ref={musicDockRef}
          className={`minimal-nav glass-surface liftable ${
            isMusicDockOpen ? "dock-open" : "dock-closed"
          }`}
          aria-label="Music dock"
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
            aria-label="Open music dock"
            aria-expanded={isMusicDockOpen}
          >
            <span className={isPlaying ? "nav-orb nav-orb-on" : "nav-orb"}>♪</span>
          </button>
          <div className="nav-expanded" aria-hidden={!isMusicDockOpen}>
            <div className="nav-title">
              <p className="eyebrow">Music Dock</p>
              <h1>Run Trace Studio</h1>
              <p className="nav-track">{audioName}</p>
            </div>
            <div className="nav-actions">
              <label className="icon-pill liftable" title="Choose local audio">
                <span aria-hidden="true">♪</span>
                <input type="file" accept="audio/*" onChange={handleAudioChange} />
              </label>
              <button
                className="icon-pill liftable"
                type="button"
                onClick={toggleAudio}
                disabled={audioName === "No track"}
                title={isPlaying ? "Pause audio" : "Play audio"}
              >
                {isPlaying ? "Ⅱ" : "▶"}
              </button>
            </div>
          </div>
        </header>

        <section className="hero-workspace">
          <div className="hero-copy revealable reveal-once reveal-delay-1" ref={heroCopyRef}>
            <p className="eyebrow">我在听，CareerPilot</p>
            <h2>Agent の 轨迹。</h2>
          </div>

          <div className="command-dock glass-surface liftable revealable reveal-delay-2">
            <button
              className="composer-icon composer-plus"
              type="button"
              aria-label="Focus run goal"
              title="Focus run goal"
              onClick={() => goalInputRef.current?.focus()}
            >
              <span aria-hidden="true">+</span>
            </button>
            <textarea
              ref={goalInputRef}
              className="goal-input"
              aria-label="Run goal"
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
              aria-label={isLoading ? "Starting run" : "Start run"}
              title={isLoading ? "Starting" : "Start run"}
            >
              <span aria-hidden="true">{isLoading ? "…" : "↑"}</span>
            </button>
          </div>

          {error ? <p className="error-text glass-surface revealable">{error}</p> : null}
        </section>

        <section className="insight-strip">
          <Metric label="Runs" value={runs.length.toString()} />
          <Metric label="State" value={formatState(latestState)} />
          <Metric label="Tokens" value={latestTokens.toString()} />
          <Metric label="Cost CNY" value={totalCost.toFixed(6)} />
        </section>

        <section className="workflow-board">
          <section className="workflow-panel glass-surface liftable revealable">
            <div className="section-heading">
              <div>
                <p className="eyebrow">Week2 Parser</p>
                <h2>Structured intake</h2>
              </div>
              <span className="state-badge">W2</span>
            </div>
            <div className="workflow-input-grid">
              <label className="workflow-field">
                <span>Resume</span>
                <textarea
                  value={resumeText}
                  onChange={(event) => setResumeText(event.target.value)}
                  rows={5}
                />
              </label>
              <label className="workflow-field">
                <span>Job description</span>
                <textarea
                  value={jobText}
                  onChange={(event) => setJobText(event.target.value)}
                  rows={5}
                />
              </label>
            </div>
            <div className="workflow-actions">
              <button
                className="ghost-action liftable"
                type="button"
                onClick={handleParseResume}
                disabled={workflowAction !== null}
              >
                {workflowAction === "resume-parser" ? "Parsing" : "Parse resume"}
              </button>
              <button
                className="ghost-action liftable"
                type="button"
                onClick={handleParseJob}
                disabled={workflowAction !== null}
              >
                {workflowAction === "job-parser" ? "Parsing" : "Parse JD"}
              </button>
            </div>
            <div className="parser-result-grid">
              <ParserSummary kind="resume" result={resumeResult} />
              <ParserSummary kind="job" result={jobResult} />
            </div>
          </section>

          <section className="workflow-panel glass-surface liftable revealable reveal-delay-1">
            <div className="section-heading">
              <div>
                <p className="eyebrow">Week3 LoopEngine</p>
                <h2>Plan · Execute · Verify</h2>
              </div>
              <span className="state-badge">W3</span>
            </div>
            <div className="loop-stats">
              <WorkflowStat label="Current" value={formatState(latestState)} />
              <WorkflowStat label="Steps" value={activeStepCount.toString()} />
              <WorkflowStat label="Checkpoints" value={activeCheckpoints.toString()} />
            </div>
            <label className="workflow-field workflow-field-compact">
              <span>Approval notes</span>
              <textarea
                value={approvalNotes}
                onChange={(event) => setApprovalNotes(event.target.value)}
                rows={3}
                placeholder="Approval note for the active LoopEngine run"
              />
            </label>
            <div className="workflow-actions loop-actions">
              <button
                className="primary-action liftable"
                type="button"
                onClick={handleCreateLoopRun}
                disabled={workflowAction !== null || (!resumeText.trim() && !jobText.trim())}
              >
                {workflowAction === "loop-run" ? "Running" : "Start loop"}
              </button>
              <button
                className="ghost-action liftable"
                type="button"
                onClick={handleApproveLoopRun}
                disabled={workflowAction !== null || !canApproveActiveRun}
              >
                {workflowAction === "loop-approval" ? "Approving" : "Approve"}
              </button>
              <button
                className="ghost-action liftable"
                type="button"
                onClick={handleResumeLoopRun}
                disabled={workflowAction !== null || !canResumeActiveRun}
              >
                {workflowAction === "loop-resume" ? "Resuming" : "Resume"}
              </button>
            </div>
          </section>
        </section>

        {workflowError ? <p className="error-text glass-surface revealable">{workflowError}</p> : null}

        {activeRun ? (
          <RunTrace detail={activeRun} />
        ) : (
          <section className="empty-state glass-surface liftable revealable">
            <p className="eyebrow">Trace</p>
            <h2>Ready for the first run</h2>
            <p>Planner output, checkpoints, events, tokens, latency, and cost will appear here.</p>
          </section>
        )}

        <section className="run-list glass-surface liftable revealable">
          <div className="section-heading">
            <div>
              <p className="eyebrow">History</p>
              <h2>Recent runs</h2>
            </div>
            <button className="ghost-action liftable" type="button" onClick={refreshRuns}>
              Refresh
            </button>
          </div>
          <div className="run-table">
            {runs.map((run) => (
              <div className="run-row liftable revealable" key={run.run_id}>
                <span>{run.run_id}</span>
                <strong>{run.state}</strong>
                <span>{run.step_count} steps</span>
                <span>{run.total_tokens} tokens</span>
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
        <p className="eyebrow">{kind === "resume" ? "Resume Profile" : "Job Profile"}</p>
        <h3>{kind === "resume" ? "Awaiting resume parse" : "Awaiting JD parse"}</h3>
        <p>Structured fields, metadata, and warnings will land here.</p>
      </article>
    );
  }

  const isResume = kind === "resume";
  const resumeProfile = isResume ? (result as ParseResumeResponse).profile : null;
  const jobProfile = !isResume ? (result as ParseJobResponse).profile : null;
  const title = resumeProfile
    ? `${resumeProfile.skills.length} skills · ${resumeProfile.projects.length} projects`
    : `${jobProfile?.company ?? "Unknown company"} · ${jobProfile?.title ?? "Untitled role"}`;
  const summary = resumeProfile
    ? `${resumeProfile.education.length} education · ${resumeProfile.experiences.length} experience · ${resumeProfile.keywords.length} keywords`
    : `${jobProfile?.hard_requirements.length ?? 0} required · ${
        jobProfile?.nice_to_have.length ?? 0
      } preferred · ${jobProfile?.responsibilities.length ?? 0} responsibilities`;
  const chips = resumeProfile
    ? resumeProfile.skills.concat(resumeProfile.keywords).slice(0, 6)
    : (jobProfile?.tech_keywords ?? []).concat(jobProfile?.hidden_keywords ?? []).slice(0, 6);

  return (
    <article className="parser-result-card liftable">
      <p className="eyebrow">{isResume ? "Resume Profile" : "Job Profile"}</p>
      <h3>{title}</h3>
      <p>{summary}</p>
      <div className="chip-row">
        {(chips.length ? chips : ["No keywords yet"]).map((chip, index) => (
          <span key={`${chip}-${index}`}>{chip}</span>
        ))}
      </div>
      <dl className="metadata-row">
        <div>
          <dt>Source</dt>
          <dd>{formatSource(result.metadata.source)}</dd>
        </div>
        <div>
          <dt>Model</dt>
          <dd>{result.metadata.model ?? "local"}</dd>
        </div>
        <div>
          <dt>Issues</dt>
          <dd>{result.metadata.issues.length}</dd>
        </div>
      </dl>
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

function formatState(state: string): string {
  return state
    .toLowerCase()
    .split("_")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

function formatSource(source: string): string {
  return source
    .split("_")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

declare global {
  interface Window {
    webkitAudioContext: typeof AudioContext;
  }
}
