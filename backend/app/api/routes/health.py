from fastapi import APIRouter

from app.core.config import get_settings

router = APIRouter(tags=["health"])


@router.get("/health")
async def health_check() -> dict[str, str | bool | int]:
    settings = get_settings()
    return {
        "status": "ok",
        "app": settings.app_name,
        "environment": settings.environment,
        "llm_dry_run": settings.llm_dry_run,
        "judge_dry_run": settings.judge_dry_run,
        "auth_enabled": bool(settings.api_access_token),
        "rate_limit_requests_per_minute": settings.rate_limit_requests_per_minute,
    }
