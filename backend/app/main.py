from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware

from app.api.routes import (
    applications,
    evals,
    health,
    interview_packs,
    job_collector,
    loop_runs,
    matches,
    parsers,
    production,
    provider_balances,
    research,
    rewrite_drafts,
    runs,
)
from app.core.config import get_settings
from app.services.production_guard import production_guard_middleware


def create_app() -> FastAPI:
    settings = get_settings()
    app = FastAPI(
        title=settings.app_name,
        version="0.1.0",
        description=(
            "CareerPilot API: run trace, cost tracking, LLM client boundary, "
            "structured Resume/JD parsing, Week3 LoopEngine, Week4 MatchAgent, "
            "Week5 ResumeRewriteAgent, Week6 JobCollector browser boundary, "
            "Week7 InterviewCoachAgent, Week8 Application CRM memory, "
            "Week9 Eval Harness QualityGate, Week10 production polish, "
            "and Tavily-backed web research tools."
        ),
    )

    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origins,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    @app.middleware("http")
    async def apply_production_guard(request: Request, call_next):  # type: ignore[no-untyped-def]
        return await production_guard_middleware(request, call_next, settings)

    app.include_router(applications.router, prefix="/api")
    app.include_router(evals.router, prefix="/api")
    app.include_router(health.router, prefix="/api")
    app.include_router(interview_packs.router, prefix="/api")
    app.include_router(job_collector.router, prefix="/api")
    app.include_router(loop_runs.router, prefix="/api")
    app.include_router(matches.router, prefix="/api")
    app.include_router(parsers.router, prefix="/api")
    app.include_router(production.router, prefix="/api")
    app.include_router(provider_balances.router, prefix="/api")
    app.include_router(research.router, prefix="/api")
    app.include_router(rewrite_drafts.router, prefix="/api")
    app.include_router(runs.router, prefix="/api")
    return app


app = create_app()
