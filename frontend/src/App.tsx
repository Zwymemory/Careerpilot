import { useEffect, useMemo, useRef, useState } from "react";

import { createRun, listRuns } from "./api/client";
import { RunTrace } from "./components/RunTrace";
import type { RunDetail, RunSummary } from "./types";

const defaultGoal =
  "为 AI Agent 实习岗位生成 Week1 可追踪运行计划，保留人工审批点和成本记录。";

export default function App() {
  const [goal, setGoal] = useState(defaultGoal);
  const [runs, setRuns] = useState<RunSummary[]>([]);
  const [activeRun, setActiveRun] = useState<RunDetail | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [audioName, setAudioName] = useState("No track");
  const [isPlaying, setIsPlaying] = useState(false);
  const shellRef = useRef<HTMLDivElement | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const sourceRef = useRef<MediaElementAudioSourceNode | null>(null);
  const frameRef = useRef<number | null>(null);

  async function refreshRuns() {
    const data = await listRuns();
    setRuns(data);
  }

  useEffect(() => {
    refreshRuns().catch((err: unknown) => {
      setError(err instanceof Error ? err.message : "Failed to load runs.");
    });
  }, []);

  useEffect(() => {
    const handlePointerMove = (event: PointerEvent) => {
      if (!shellRef.current) {
        return;
      }
      const x = event.clientX / window.innerWidth - 0.5;
      const y = event.clientY / window.innerHeight - 0.5;
      shellRef.current.style.setProperty("--mouse-x", x.toFixed(3));
      shellRef.current.style.setProperty("--mouse-y", y.toFixed(3));
    };

    window.addEventListener("pointermove", handlePointerMove);
    return () => window.removeEventListener("pointermove", handlePointerMove);
  }, []);

  useEffect(() => {
    return () => {
      if (frameRef.current) {
        cancelAnimationFrame(frameRef.current);
      }
      audioContextRef.current?.close();
    };
  }, []);

  async function handleCreateRun() {
    setIsLoading(true);
    setError(null);
    try {
      const detail = await createRun(goal);
      setActiveRun(detail);
      await refreshRuns();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create run.");
    } finally {
      setIsLoading(false);
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
    }
  }

  function startAudioPulse() {
    const analyser = analyserRef.current;
    if (!analyser || !shellRef.current) {
      return;
    }

    const samples = new Uint8Array(analyser.frequencyBinCount);
    const tick = () => {
      analyser.getByteFrequencyData(samples);
      const average = samples.reduce((sum, sample) => sum + sample, 0) / samples.length;
      const level = Math.min(1, average / 160);
      shellRef.current?.style.setProperty("--audio-level", level.toFixed(3));
      frameRef.current = requestAnimationFrame(tick);
    };
    tick();
  }

  const latestRun = useMemo(() => activeRun?.run ?? null, [activeRun]);
  const latestSummary = runs[0];
  const latestState = latestRun?.state ?? latestSummary?.state ?? "IDLE";
  const latestTokens = activeRun?.total_tokens ?? latestSummary?.total_tokens ?? 0;
  const totalCost = activeRun?.total_cost_cny ?? runs[0]?.total_cost_cny ?? 0;

  return (
    <div className="ambient-stage" ref={shellRef}>
      <div className="ambient-noise" />
      <audio ref={audioRef} onEnded={() => setIsPlaying(false)} />

      <main className="app-shell">
        <header className="minimal-nav glass-surface liftable">
          <div>
            <p className="eyebrow">CareerPilot</p>
            <h1>Run Trace Studio</h1>
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
        </header>

        <section className="hero-workspace">
          <div className="hero-copy">
            <p className="eyebrow">我在听，CareerPilot</p>
            <h2>把每一次 Agent 运行，都留成清晰、可信、可复盘的轨迹。</h2>
          </div>

          <div className="command-dock glass-surface liftable">
            <textarea
              aria-label="Run goal"
              value={goal}
              onChange={(event) => setGoal(event.target.value)}
              rows={3}
            />
            <button className="primary-action liftable" type="button" onClick={handleCreateRun} disabled={isLoading}>
              <span aria-hidden="true">↗</span>
              {isLoading ? "Starting" : "Start run"}
            </button>
          </div>

          <div className="music-line" title={audioName}>
            <span className={isPlaying ? "pulse-dot pulse-dot-on" : "pulse-dot"} />
            <span>{audioName}</span>
          </div>
          {error ? <p className="error-text glass-surface">{error}</p> : null}
        </section>

        <section className="insight-strip">
          <Metric label="Runs" value={runs.length.toString()} />
          <Metric label="State" value={formatState(latestState)} />
          <Metric label="Tokens" value={latestTokens.toString()} />
          <Metric label="Cost CNY" value={totalCost.toFixed(6)} />
        </section>

        {activeRun ? (
          <RunTrace detail={activeRun} />
        ) : (
          <section className="empty-state glass-surface liftable">
            <p className="eyebrow">Trace</p>
            <h2>Ready for the first run</h2>
            <p>Planner output, checkpoints, events, tokens, latency, and cost will appear here.</p>
          </section>
        )}

        <section className="run-list glass-surface liftable">
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
              <div className="run-row liftable" key={run.run_id}>
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
    <div className="metric glass-surface liftable">
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

declare global {
  interface Window {
    webkitAudioContext: typeof AudioContext;
  }
}
