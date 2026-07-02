# CareerPilot

CareerPilot is an AI Agent workflow platform for internship and early-career job search preparation. It focuses on traceable, evidence-locked workflows: resume parsing, job analysis, matching, resume tailoring, approval, interview preparation, feedback, and evaluation.

Week1 establishes the runnable project skeleton, and Week2 adds structured resume/JD parsing:

- Python/FastAPI backend
- React + TypeScript frontend
- Unified LLM client boundary with dry-run mode
- Run trace with steps, events, idempotency key, token usage, latency, and estimated cost
- Human approval checkpoint before user-facing artifact export
- ResumeParserAgent and JobIntelAgent structured parser endpoints
- JSON repair plus Pydantic schema validation

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

## Current Limits

- The run store is in memory. PostgreSQL repositories are planned for the LoopEngine phase.
- LLM calls default to dry-run mode unless `LLM_API_KEY` is configured.
- Week2 parser endpoints use a conservative heuristic parser in dry-run mode. Real LLM structured parsing is available once an OpenAI-compatible API key is configured.
- Artifact export, matching, resume rewriting, browser tools, and evaluation harness are planned for later weeks.

## Safety Rule

CareerPilot helps users express real experience more clearly. It must not fabricate internships, projects, metrics, education, awards, or application outcomes.
