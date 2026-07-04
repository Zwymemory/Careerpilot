from fastapi import APIRouter
from pydantic import BaseModel

from app.core.config import get_settings
from app.schemas.run import CostSummary
from app.services.run_store import run_store

router = APIRouter(prefix="/production", tags=["production"])


class ReadinessReport(BaseModel):
    status: str
    environment: str
    llm_configured: bool
    judge_configured: bool
    auth_enabled: bool
    rate_limit_requests_per_minute: int


@router.get("/readiness", response_model=ReadinessReport)
async def readiness() -> ReadinessReport:
    settings = get_settings()
    return ReadinessReport(
        status="ready",
        environment=settings.environment,
        llm_configured=bool(settings.llm_api_key) and not settings.llm_dry_run,
        judge_configured=bool(settings.judge_api_key) and not settings.judge_dry_run,
        auth_enabled=bool(settings.api_access_token),
        rate_limit_requests_per_minute=settings.rate_limit_requests_per_minute,
    )


@router.get("/cost-summary", response_model=CostSummary)
async def cost_summary() -> CostSummary:
    return run_store.cost_summary()
