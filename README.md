# CareerPilot

CareerPilot is an AI Agent workflow platform for internship and early-career job search preparation. It focuses on traceable, evidence-locked workflows: resume parsing, job analysis, matching, resume tailoring, approval, interview preparation, feedback, and evaluation.

Week1 establishes the runnable project skeleton, Week2 adds structured resume/JD parsing,
Week3 introduces the LoopEngine, and Week4 adds explainable resume/JD matching:

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

## Current Limits

- The run store is in memory. PostgreSQL repositories are planned for a production persistence phase.
- LLM calls default to dry-run mode unless `LLM_API_KEY` is configured.
- Week2 parser endpoints use a conservative heuristic parser in dry-run mode. Real LLM structured parsing is available once an OpenAI-compatible API key is configured.
- Week3 event streaming currently returns existing events in SSE format. Continuous background streaming will become more useful after a queue/worker is introduced.
- Artifact export, resume rewriting, browser tools, and evaluation harness are planned for later weeks.

## Safety Rule

CareerPilot helps users express real experience more clearly. It must not fabricate internships, projects, metrics, education, awards, or application outcomes.
