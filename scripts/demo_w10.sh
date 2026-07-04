#!/usr/bin/env bash
set -euo pipefail

API_BASE_URL="${API_BASE_URL:-http://localhost:8000/api}"

echo "== CareerPilot W10 demo =="
echo "API_BASE_URL=${API_BASE_URL}"
echo

echo "1) Health"
curl -sS "${API_BASE_URL}/health"
echo
echo

echo "2) Production readiness"
curl -sS "${API_BASE_URL}/production/readiness"
echo
echo

echo "3) Create a traceable eval run"
curl -sS -X POST "${API_BASE_URL}/evals" \
  -H "Content-Type: application/json" \
  -d '{
    "user_id": "demo-user",
    "case_name": "W10 production smoke test",
    "judge_mode": "llm_as_judge_dry_run",
    "min_score": 70,
    "expected_keywords": ["Python", "FastAPI", "AI Agent"],
    "resume_profile": {
      "education": [],
      "skills": ["Python", "FastAPI", "React", "AI Agent"],
      "projects": [
        {
          "name": "CareerPilot",
          "description": "面向求职投递场景的可追踪 AI Agent 工作流平台。",
          "skills": ["Python", "FastAPI", "React", "AI Agent"],
          "evidence": [
            {
              "field_path": "projects[0].description",
              "source_text": "可追踪 AI Agent 工作流平台",
              "confidence": 0.9,
              "is_inferred": false
            }
          ]
        }
      ],
      "experiences": [],
      "keywords": ["Python", "FastAPI", "AI Agent"],
      "evidence": [
        {
          "field_path": "skills",
          "source_text": "Python, FastAPI, AI Agent",
          "confidence": 0.9,
          "is_inferred": false
        }
      ],
      "inferred_fields": [],
      "needs_confirmation": []
    },
    "job_profile": {
      "company": "Demo AI",
      "title": "AI Agent Intern",
      "hard_requirements": ["Python", "FastAPI", "Agent workflow"],
      "nice_to_have": ["React"],
      "responsibilities": ["构建可观测的 AI Agent 工作流。"],
      "tech_keywords": ["Python", "FastAPI", "AI Agent", "React"],
      "hidden_keywords": ["traceability"],
      "company_context": [],
      "evidence": [],
      "inferred_fields": [],
      "needs_confirmation": []
    }
  }'
echo
echo

echo "4) Cost summary"
curl -sS "${API_BASE_URL}/production/cost-summary"
echo
