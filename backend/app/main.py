from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.routes import health, loop_runs, matches, parsers, runs
from app.core.config import get_settings


def create_app() -> FastAPI:
    settings = get_settings()
    app = FastAPI(
        title=settings.app_name,
        version="0.1.0",
        description=(
            "CareerPilot API: run trace, cost tracking, LLM client boundary, "
            "structured Resume/JD parsing, Week3 LoopEngine, and Week4 MatchAgent."
        ),
    )

    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origins,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    app.include_router(health.router, prefix="/api")
    app.include_router(loop_runs.router, prefix="/api")
    app.include_router(matches.router, prefix="/api")
    app.include_router(parsers.router, prefix="/api")
    app.include_router(runs.router, prefix="/api")
    return app


app = create_app()
