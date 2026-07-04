# CareerPilot

CareerPilot is an AI Agent workflow platform for internship and early-career job search preparation. It focuses on traceable, evidence-locked workflows: resume parsing, job analysis, matching, resume tailoring, approval, interview preparation, feedback, and evaluation.

Week1 establishes the runnable project skeleton, Week2 adds structured resume/JD parsing,
Week3 introduces the LoopEngine, Week4 adds explainable resume/JD matching, Week5
adds evidence-locked resume rewrite drafts with approval-gated export, and Weeks6-10
complete the end-to-end job-search Agent workflow:

- Python/FastAPI backend
- React + TypeScript frontend
- Unified LLM client boundary with dry-run mode
- Run trace with steps, events, idempotency key, token usage, latency, and estimated cost
- Human approval checkpoint before user-facing artifact export
- ResumeParserAgent and JobIntelAgent structured parser endpoints
- JSON repair plus Pydantic schema validation
- LoopEngine with Plan / Execute / Verify / Reflect / Human Approval / Commit
- Checkpoints, event stream, idempotency, and resume-from-failure scaffolding
- MatchAgent with score breakdown, evidence mapping, gap analysis, and priority ranking
- ResumeRewriteAgent with diff suggestions, evidence links, risk warnings, approval, and PDF export
- JobCollectorAgent with public-source safety checks, text/html/url collection, hashes, and optional screenshots
- InterviewCoachAgent with realistic project questions, answer frameworks, and evidence warnings
- ApplicationCRMAgent with application memory, next tasks, feedback, and status tracking
- EvalHarness with QualityGate, HTML reports, optional LLM-as-Judge, and cost recording
- Week10 production guard with optional API token auth, rate limiting, security headers, readiness, cost summary, Docker Compose, and demo script

## Start with Docker Compose

```bash
cp backend/.env.example backend/.env
docker compose up --build
```

The frontend will be available at `http://localhost:5173`, and the backend API will be
available through the frontend container at `/api` and directly at `http://localhost:8000/api`.

Useful production checks:

```bash
curl http://localhost:8000/api/health
curl http://localhost:8000/api/production/readiness
curl http://localhost:8000/api/production/cost-summary
```

Run the W10 smoke demo:

```bash
scripts/demo_w10.sh
```

## Start Backend

```bash
cd backend
python3 -m venv .venv
source .venv/bin/activate
pip install -e ".[dev]"
cp .env.example .env
uvicorn app.main:app --reload
```

The API will be available at `http://localhost:8000`.

## Start Frontend

```bash
cd frontend
npm install
npm run dev
```

The app will be available at `http://localhost:5173`.

When using Vite dev mode, keep the backend running at `http://localhost:8000`. If you need
to point the frontend at another backend, set `VITE_API_BASE_URL`.

## Production Settings

`backend/.env` is local only and must not be committed. The most relevant W10 settings are:

```env
API_ACCESS_TOKEN=
RATE_LIMIT_REQUESTS_PER_MINUTE=180
SECURITY_HEADERS_ENABLED=true

JUDGE_DRY_RUN=true
JUDGE_PROVIDER=openai
JUDGE_MODEL=gpt-4.1-mini
JUDGE_BASE_URL=https://api.openai.com/v1
JUDGE_API_KEY=
```

- Leave `API_ACCESS_TOKEN` empty for local development. Set it in shared/demo deployments.
- Use `Authorization: Bearer <token>` or `X-API-Key: <token>` when auth is enabled.
- `JUDGE_DRY_RUN=true` keeps QualityGate deterministic. Set it to `false` only when a real
  OpenAI-compatible judge key is configured.

## API Demo

Create a traceable Week1 run:

```bash
curl -X POST http://localhost:8000/api/runs \
  -H "Content-Type: application/json" \
  -H "Idempotency-Key: local-demo-1" \
  -d '{"user_id":"local-user","goal":"为 AI Agent 实习岗位生成 Week1 可追踪运行计划"}'
```

Parse a resume into a structured profile:

```bash
curl -X POST http://localhost:8000/api/parsers/resume \
  -H "Content-Type: application/json" \
  -d '{
    "user_id": "local-user",
    "source_name": "resume.md",
    "text": "Education: Example University\nSkills: Python, FastAPI, React\nProject: CareerPilot built a traceable Agent workflow."
  }'
```

Parse a JD into a structured profile:

```bash
curl -X POST http://localhost:8000/api/parsers/job \
  -H "Content-Type: application/json" \
  -d '{
    "user_id": "local-user",
    "text": "Company: Example AI\nTitle: AI Agent Backend Intern\nRequired: Python, FastAPI, SQL\nPreferred: React, TypeScript"
  }'
```

Create a Week3 LoopEngine run:

```bash
curl -X POST http://localhost:8000/api/loop-runs \
  -H "Content-Type: application/json" \
  -H "Idempotency-Key: loop-demo-1" \
  -d '{
    "user_id": "local-user",
    "goal": "为 AI Agent 实习岗位生成可追踪的匹配准备流程",
    "resume_text": "Education: Example University\nSkills: Python, FastAPI, React\nProject: CareerPilot built a traceable Agent workflow.",
    "job_text": "Company: Example AI\nTitle: AI Agent Backend Intern\nRequired: Python, FastAPI, SQL\nPreferred: React, TypeScript"
  }'
```

Approve and commit a loop run:

```bash
curl -X POST http://localhost:8000/api/loop-runs/{run_id}/approve \
  -H "Content-Type: application/json" \
  -d '{"approved_by":"local-user","notes":"确认进入后续匹配流程"}'
```

Stream loop events:

```bash
curl http://localhost:8000/api/loop-runs/{run_id}/events/stream
```

Run a Week4 match from parsed profiles:

```bash
curl -X POST http://localhost:8000/api/matches \
  -H "Content-Type: application/json" \
  -d '{
    "user_id": "local-user",
    "resume_profile": {
      "education": [],
      "skills": ["Python", "FastAPI", "React"],
      "projects": [
        {
          "name": "CareerPilot",
          "description": "Built a traceable Agent workflow with FastAPI and React.",
          "skills": ["Python", "FastAPI", "React"],
          "evidence": []
        }
      ],
      "experiences": [],
      "keywords": ["Python", "FastAPI", "React", "Agent"],
      "evidence": [],
      "inferred_fields": [],
      "needs_confirmation": []
    },
    "job_profile": {
      "company": "Example AI",
      "title": "AI Agent Backend Intern",
      "hard_requirements": ["Required: Python, FastAPI, SQL"],
      "nice_to_have": ["Preferred: React, TypeScript"],
      "responsibilities": ["Build FastAPI services for traceable LLM workflow execution."],
      "tech_keywords": ["Python", "FastAPI", "SQL", "React", "TypeScript"],
      "hidden_keywords": ["communication"],
      "company_context": [],
      "evidence": [],
      "inferred_fields": [],
      "needs_confirmation": []
    }
  }'
```

Create a Week5 rewrite draft from parsed profiles and a match profile:

```bash
curl -X POST http://localhost:8000/api/rewrite-drafts \
  -H "Content-Type: application/json" \
  -d '{
    "user_id": "local-user",
    "resume_profile": { "...": "ResumeProfile from Week2" },
    "job_profile": { "...": "JobProfile from Week2" },
    "match_profile": { "...": "MatchProfile from Week4" }
  }'
```

Approve the draft before export:

```bash
curl -X POST http://localhost:8000/api/rewrite-drafts/{run_id}/approve \
  -H "Content-Type: application/json" \
  -d '{"approved_by":"local-user","notes":"证据真实，允许导出"}'
```

Export the approved draft:

```bash
curl http://localhost:8000/api/rewrite-drafts/{run_id}/export.pdf --output rewrite-draft.pdf
```

## Current Limits

- The run store is in memory. PostgreSQL repositories are planned for a production persistence phase.
- LLM calls default to dry-run mode unless `LLM_API_KEY` is configured.
- Week2 parser endpoints use a conservative heuristic parser in dry-run mode. Real LLM structured parsing is available once an OpenAI-compatible API key is configured.
- Week3 event streaming currently returns existing events in SSE format. Continuous background streaming will become more useful after a queue/worker is introduced.
- Week5 PDF export is a dependency-free preview renderer. A production template renderer can replace it later.
- The W10 rate limiter is in-process. Use Redis or gateway-level rate limiting for multi-instance deployments.
- Docker Compose is a local/demo production shape. A real deployment still needs managed persistence, log retention, backup, and secret management.

## Safety Rule

CareerPilot helps users express real experience more clearly. It must not fabricate internships, projects, metrics, education, awards, or application outcomes.
