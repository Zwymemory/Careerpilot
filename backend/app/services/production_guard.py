import time
from collections import defaultdict, deque
from collections.abc import Awaitable, Callable

from fastapi import Request, Response, status
from starlette.responses import JSONResponse

from app.core.config import Settings


class InMemoryRateLimiter:
    """Small per-process limiter for local demos and single-instance deployments."""

    def __init__(self) -> None:
        self._buckets: dict[str, deque[float]] = defaultdict(deque)

    def allow(self, key: str, limit_per_minute: int) -> bool:
        if limit_per_minute <= 0:
            return True

        now = time.monotonic()
        window_start = now - 60
        bucket = self._buckets[key]
        while bucket and bucket[0] < window_start:
            bucket.popleft()
        if len(bucket) >= limit_per_minute:
            return False
        bucket.append(now)
        return True


rate_limiter = InMemoryRateLimiter()


def _client_key(request: Request) -> str:
    forwarded = request.headers.get("x-forwarded-for")
    if forwarded:
        return forwarded.split(",", 1)[0].strip()
    if request.client:
        return request.client.host
    return "unknown"


def _authorized(request: Request, settings: Settings) -> bool:
    if not settings.api_access_token:
        return True

    bearer = request.headers.get("authorization", "")
    if (
        bearer.startswith("Bearer ")
        and bearer.removeprefix("Bearer ").strip() == settings.api_access_token
    ):
        return True
    return request.headers.get("x-api-key") == settings.api_access_token


async def production_guard_middleware(
    request: Request,
    call_next: Callable[[Request], Awaitable[Response]],
    settings: Settings,
) -> Response:
    if request.url.path.startswith("/api") and request.url.path != "/api/health":
        if not _authorized(request, settings):
            return JSONResponse(
                status_code=status.HTTP_401_UNAUTHORIZED,
                content={"detail": "Missing or invalid API access token."},
            )

        if not rate_limiter.allow(_client_key(request), settings.rate_limit_requests_per_minute):
            return JSONResponse(
                status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                content={"detail": "Rate limit exceeded. Please retry later."},
            )

    response = await call_next(request)
    if settings.security_headers_enabled:
        response.headers.setdefault("X-Content-Type-Options", "nosniff")
        response.headers.setdefault("X-Frame-Options", "DENY")
        response.headers.setdefault("Referrer-Policy", "strict-origin-when-cross-origin")
        response.headers.setdefault(
            "Permissions-Policy",
            "camera=(), microphone=(), geolocation=()",
        )
    return response
