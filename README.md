# CareerPilot

CareerPilot is an AI Agent workflow platform for internship and early-career job search preparation. It focuses on traceable, evidence-locked workflows: resume parsing, job analysis, matching, resume tailoring, approval, interview preparation, feedback, and evaluation.

Week1 establishes the runnable project skeleton:

- Python/FastAPI backend
- React + TypeScript frontend
- Unified LLM client boundary with dry-run mode
- Run trace with steps, events, idempotency key, token usage, latency, and estimated cost
- Human approval checkpoint before user-facing artifact export

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

## API Demo

```bash
curl -X POST http://localhost:8000/api/runs \
  -H "Content-Type: application/json" \
  -H "Idempotency-Key: local-demo-1" \
  -d '{"user_id":"local-user","goal":"为 AI Agent 实习岗位生成 Week1 可追踪运行计划"}'
```

## Current Limits

- The Week1 run store is in memory. PostgreSQL repositories are planned for the LoopEngine phase.
- LLM calls default to dry-run mode unless `LLM_API_KEY` is configured.
- Artifact export, resume parsing, JD parsing, and evaluation harness are planned for later weeks.

## Safety Rule

CareerPilot helps users express real experience more clearly. It must not fabricate internships, projects, metrics, education, awards, or application outcomes.
