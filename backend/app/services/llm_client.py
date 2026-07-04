import asyncio
import time
from typing import Any

from app.core.config import Settings
from app.schemas.llm import LLMRequest, LLMResponse, LLMUsage
from app.services.pricing import estimate_cost_cny


class LLMClientError(RuntimeError):
    pass


class LLMClient:
    """Unified OpenAI-compatible client with dry-run, timeout, retry, and cost tracking."""

    def __init__(
        self,
        settings: Settings,
        *,
        provider: str | None = None,
        model: str | None = None,
        base_url: str | None = None,
        api_key: str | None = None,
        dry_run: bool | None = None,
    ) -> None:
        self.settings = settings
        self.provider = provider or settings.llm_provider
        self.model = model or settings.llm_model
        self.base_url = base_url or settings.llm_base_url
        self.api_key = api_key if api_key is not None else settings.llm_api_key
        self.dry_run = settings.llm_dry_run if dry_run is None else dry_run

    async def chat(self, request: LLMRequest) -> LLMResponse:
        started = time.perf_counter()
        if self.dry_run or not self.api_key:
            return self._dry_run_response(request, started)

        last_error: Exception | None = None
        for attempt in range(self.settings.llm_max_retries + 1):
            try:
                return await self._chat_once(request, started)
            except Exception as exc:  # noqa: BLE001 - captured and wrapped after retries.
                last_error = exc
                if attempt < self.settings.llm_max_retries:
                    await asyncio.sleep(0.4 * (attempt + 1))
        raise LLMClientError(f"LLM call failed after retries: {last_error}") from last_error

    async def _chat_once(self, request: LLMRequest, started: float) -> LLMResponse:
        import httpx

        payload: dict[str, Any] = {
            "model": self.model,
            "messages": [message.model_dump() for message in request.messages],
            "temperature": request.temperature,
            "max_tokens": request.max_tokens,
        }
        if request.response_format:
            payload["response_format"] = request.response_format

        headers = {"Authorization": f"Bearer {self.api_key}"}
        url = f"{self.base_url.rstrip('/')}/chat/completions"

        async with httpx.AsyncClient(timeout=self.settings.llm_timeout_seconds) as client:
            response = await client.post(url, headers=headers, json=payload)
            response.raise_for_status()
            data = response.json()

        usage_data = data.get("usage") or {}
        usage = LLMUsage(
            prompt_tokens=usage_data.get("prompt_tokens", 0),
            completion_tokens=usage_data.get("completion_tokens", 0),
            total_tokens=usage_data.get("total_tokens", 0),
        )
        content = data["choices"][0]["message"]["content"]
        latency_ms = int((time.perf_counter() - started) * 1000)
        return LLMResponse(
            provider=self.provider,
            model=self.model,
            content=content,
            usage=usage,
            latency_ms=latency_ms,
            estimated_cost_cny=estimate_cost_cny(
                self.model,
                usage.prompt_tokens,
                usage.completion_tokens,
            ),
        )

    def _dry_run_response(self, request: LLMRequest, started: float) -> LLMResponse:
        prompt_text = "\n".join(message.content for message in request.messages)
        prompt_tokens = max(1, len(prompt_text) // 4)
        content = (
            "Dry-run plan: create a traceable CareerPilot run, record every step, "
            "and require human approval before export."
        )
        completion_tokens = max(1, len(content) // 4)
        latency_ms = int((time.perf_counter() - started) * 1000)
        return LLMResponse(
            provider=self.provider,
            model=self.model,
            content=content,
            usage=LLMUsage(
                prompt_tokens=prompt_tokens,
                completion_tokens=completion_tokens,
                total_tokens=prompt_tokens + completion_tokens,
            ),
            latency_ms=latency_ms,
            estimated_cost_cny=estimate_cost_cny(
                self.model,
                prompt_tokens,
                completion_tokens,
            ),
            dry_run=True,
        )
