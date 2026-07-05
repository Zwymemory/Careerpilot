from __future__ import annotations

import math
from datetime import UTC, datetime, timedelta
from typing import Any

import httpx

from app.core.config import Settings
from app.schemas.provider_balance import ProviderBalance, ProviderBalanceResponse, ProviderBalanceStatus
from app.services.run_store import run_store


DEEPSEEK_BALANCE_DOC = "https://api-docs.deepseek.com/api/get-user-balance"
OPENAI_COSTS_DOC = "https://platform.openai.com/docs/api-reference/usage"
TAVILY_USAGE_DOC = "https://docs.tavily.com/documentation/api-reference/endpoint/usage"


class ProviderBalanceService:
    """Read provider quota/balance without exposing provider secrets to the frontend."""

    def __init__(self, settings: Settings) -> None:
        self.settings = settings

    async def get_balances(self) -> ProviderBalanceResponse:
        providers = [
            await self._deepseek_balance(),
            await self._openai_cost_balance(),
            await self._tavily_usage_balance(),
        ]
        live_count = sum(1 for provider in providers if provider.live)
        summary = f"{live_count}/{len(providers)} 个供应商返回实时余额，其余使用本地预算估算。"
        return ProviderBalanceResponse(
            summary=summary,
            providers=providers,
            docs={
                "deepseek": DEEPSEEK_BALANCE_DOC,
                "openai": OPENAI_COSTS_DOC,
                "tavily": TAVILY_USAGE_DOC,
            },
        )

    async def _deepseek_balance(self) -> ProviderBalance:
        configured = bool(self.settings.llm_api_key) and not self.settings.llm_dry_run
        if not configured:
            return self._budget_provider(
                provider="deepseek",
                label="DeepSeek",
                configured=False,
                budget=self.settings.balance_deepseek_budget_cny,
                spent=self._local_spend_cny(provider="deepseek"),
                avg_call_cost=self.settings.balance_deepseek_avg_call_cost_cny,
                currency="CNY",
                issues=["DeepSeek 未启用实时余额查询，当前显示本地预算估算。"],
                source="local_budget_estimate",
            )

        base_url = _strip_version_suffix(self.settings.llm_base_url)
        try:
            async with httpx.AsyncClient(timeout=self.settings.llm_timeout_seconds) as client:
                response = await client.get(
                    f"{base_url}/user/balance",
                    headers={"Authorization": f"Bearer {self.settings.llm_api_key}"},
                )
                response.raise_for_status()
        except httpx.HTTPStatusError as exc:
            return self._budget_provider(
                provider="deepseek",
                label="DeepSeek",
                configured=True,
                budget=self.settings.balance_deepseek_budget_cny,
                spent=self._local_spend_cny(provider="deepseek"),
                avg_call_cost=self.settings.balance_deepseek_avg_call_cost_cny,
                currency="CNY",
                issues=[f"DeepSeek 余额接口返回 {exc.response.status_code}，已退回本地估算。"],
                source="local_budget_estimate",
                status="warn",
            )
        except httpx.HTTPError as exc:
            return self._budget_provider(
                provider="deepseek",
                label="DeepSeek",
                configured=True,
                budget=self.settings.balance_deepseek_budget_cny,
                spent=self._local_spend_cny(provider="deepseek"),
                avg_call_cost=self.settings.balance_deepseek_avg_call_cost_cny,
                currency="CNY",
                issues=[f"DeepSeek 余额查询失败：{type(exc).__name__}。"],
                source="local_budget_estimate",
                status="warn",
            )

        payload = response.json()
        balances = payload.get("balance_infos") if isinstance(payload, dict) else None
        total = 0.0
        currencies: list[str] = []
        if isinstance(balances, list):
            for item in balances:
                if not isinstance(item, dict):
                    continue
                total += _number(item.get("total_balance"))
                currency = str(item.get("currency") or "").strip()
                if currency:
                    currencies.append(currency)

        currency_label = "/".join(dict.fromkeys(currencies)) or "CNY"
        calls = _remaining_calls(total, self.settings.balance_deepseek_avg_call_cost_cny)
        return ProviderBalance(
            provider="deepseek",
            label="DeepSeek",
            configured=True,
            live=True,
            status="ok" if bool(payload.get("is_available", True)) else "warn",
            percent_remaining=_percent(total, self.settings.balance_deepseek_budget_cny),
            estimated_calls_remaining=calls,
            balance_label=f"{currency_label} {total:.2f}",
            remaining_label=_calls_label(calls),
            unit_label=f"按 ¥{self.settings.balance_deepseek_avg_call_cost_cny:g}/次估算",
            source="deepseek_user_balance",
            issues=[] if bool(payload.get("is_available", True)) else ["DeepSeek 账户当前可能不可用。"],
        )

    async def _openai_cost_balance(self) -> ProviderBalance:
        configured = bool(self.settings.judge_api_key) and not self.settings.judge_dry_run
        local_spend_usd = self._local_spend_cny(provider=self.settings.judge_provider) / max(
            self.settings.balance_usd_to_cny,
            0.01,
        )
        if not configured:
            return self._budget_provider(
                provider="openai",
                label="OpenAI Judge",
                configured=False,
                budget=self.settings.balance_openai_budget_usd,
                spent=local_spend_usd,
                avg_call_cost=self.settings.balance_openai_avg_call_cost_usd,
                currency="USD",
                issues=["OpenAI 未启用实时成本查询，当前显示本地预算估算。"],
                source="local_budget_estimate",
            )

        start_time = _month_start_unix()
        try:
            async with httpx.AsyncClient(timeout=self.settings.llm_timeout_seconds) as client:
                response = await client.get(
                    f"{self.settings.judge_base_url.rstrip('/')}/organization/costs",
                    params={"start_time": start_time, "bucket_width": "1d", "limit": 31},
                    headers={"Authorization": f"Bearer {self.settings.judge_api_key}"},
                )
                response.raise_for_status()
        except httpx.HTTPStatusError as exc:
            return self._budget_provider(
                provider="openai",
                label="OpenAI Judge",
                configured=True,
                budget=self.settings.balance_openai_budget_usd,
                spent=local_spend_usd,
                avg_call_cost=self.settings.balance_openai_avg_call_cost_usd,
                currency="USD",
                issues=[
                    f"OpenAI Costs 接口返回 {exc.response.status_code}；该接口通常需要组织管理员权限，已退回本地估算。"
                ],
                source="local_budget_estimate",
                status="warn",
            )
        except httpx.HTTPError as exc:
            return self._budget_provider(
                provider="openai",
                label="OpenAI Judge",
                configured=True,
                budget=self.settings.balance_openai_budget_usd,
                spent=local_spend_usd,
                avg_call_cost=self.settings.balance_openai_avg_call_cost_usd,
                currency="USD",
                issues=[f"OpenAI 成本查询失败：{type(exc).__name__}。"],
                source="local_budget_estimate",
                status="warn",
            )

        payload = response.json()
        used_usd = _sum_openai_costs(payload)
        remaining = max(self.settings.balance_openai_budget_usd - used_usd, 0)
        calls = _remaining_calls(remaining, self.settings.balance_openai_avg_call_cost_usd)
        return ProviderBalance(
            provider="openai",
            label="OpenAI Judge",
            configured=True,
            live=True,
            status="ok" if remaining > 0 else "warn",
            percent_remaining=_percent(remaining, self.settings.balance_openai_budget_usd),
            estimated_calls_remaining=calls,
            balance_label=f"${remaining:.2f} / ${self.settings.balance_openai_budget_usd:.2f}",
            remaining_label=_calls_label(calls),
            unit_label=f"按 ${self.settings.balance_openai_avg_call_cost_usd:g}/次估算",
            source="openai_organization_costs",
            issues=[] if remaining > 0 else ["OpenAI 本月预算估算已用尽。"],
        )

    async def _tavily_usage_balance(self) -> ProviderBalance:
        configured = bool(self.settings.tavily_api_key) and not self.settings.tavily_dry_run
        if not configured:
            return self._credit_provider(
                credits_remaining=float(self.settings.balance_tavily_monthly_credits),
                credits_total=float(self.settings.balance_tavily_monthly_credits),
                configured=False,
                live=False,
                issues=["Tavily 未启用实时 usage 查询，当前显示默认月额度估算。"],
                source="local_credit_estimate",
            )

        try:
            async with httpx.AsyncClient(timeout=self.settings.tavily_timeout_seconds) as client:
                response = await client.get(
                    f"{self.settings.tavily_base_url.rstrip('/')}/usage",
                    headers={"Authorization": f"Bearer {self.settings.tavily_api_key}"},
                )
                response.raise_for_status()
        except httpx.HTTPStatusError as exc:
            return self._credit_provider(
                credits_remaining=float(self.settings.balance_tavily_monthly_credits),
                credits_total=float(self.settings.balance_tavily_monthly_credits),
                configured=True,
                live=False,
                issues=[f"Tavily usage 接口返回 {exc.response.status_code}，已退回默认月额度估算。"],
                source="local_credit_estimate",
                status="warn",
            )
        except httpx.HTTPError as exc:
            return self._credit_provider(
                credits_remaining=float(self.settings.balance_tavily_monthly_credits),
                credits_total=float(self.settings.balance_tavily_monthly_credits),
                configured=True,
                live=False,
                issues=[f"Tavily usage 查询失败：{type(exc).__name__}。"],
                source="local_credit_estimate",
                status="warn",
            )

        payload = response.json()
        credits_total, credits_remaining = _extract_credit_pair(payload)
        if credits_total <= 0:
            credits_total = float(self.settings.balance_tavily_monthly_credits)
        if credits_remaining < 0:
            credits_remaining = max(credits_total - _extract_usage_value(payload), 0)

        return self._credit_provider(
            credits_remaining=credits_remaining,
            credits_total=credits_total,
            configured=True,
            live=True,
            issues=[] if credits_remaining >= 0 else ["Tavily usage 返回结构未完全识别。"],
            source="tavily_usage",
        )

    def _budget_provider(
        self,
        provider: str,
        label: str,
        configured: bool,
        budget: float,
        spent: float,
        avg_call_cost: float,
        currency: str,
        issues: list[str],
        source: str,
        status: ProviderBalanceStatus = "unknown",
    ) -> ProviderBalance:
        remaining = max(budget - spent, 0)
        calls = _remaining_calls(remaining, avg_call_cost)
        prefix = "¥" if currency == "CNY" else "$"
        return ProviderBalance(
            provider=provider,
            label=label,
            configured=configured,
            live=False,
            status=status,
            percent_remaining=_percent(remaining, budget),
            estimated_calls_remaining=calls,
            balance_label=f"{prefix}{remaining:.2f} / {prefix}{budget:.2f}",
            remaining_label=_calls_label(calls),
            unit_label=f"按 {prefix}{avg_call_cost:g}/次估算",
            source=source,
            issues=issues,
        )

    def _credit_provider(
        self,
        credits_remaining: float,
        credits_total: float,
        configured: bool,
        live: bool,
        issues: list[str],
        source: str,
        status: ProviderBalanceStatus | None = None,
    ) -> ProviderBalance:
        calls = _remaining_calls(credits_remaining, self.settings.balance_tavily_avg_call_credits)
        return ProviderBalance(
            provider="tavily",
            label="Tavily Search",
            configured=configured,
            live=live,
            status=status or ("ok" if credits_remaining > 0 else "warn"),
            percent_remaining=_percent(credits_remaining, credits_total),
            estimated_calls_remaining=calls,
            balance_label=f"{credits_remaining:.0f} / {credits_total:.0f} credits",
            remaining_label=_calls_label(calls),
            unit_label=f"按 {self.settings.balance_tavily_avg_call_credits:g} credit/次估算",
            source=source,
            issues=issues,
        )

    @staticmethod
    def _local_spend_cny(provider: str) -> float:
        provider_lower = provider.lower()
        summary = run_store.cost_summary()
        return sum(
            item.estimated_cost_cny
            for item in summary.by_model
            if item.provider.lower() == provider_lower or provider_lower in item.model.lower()
        )


def _strip_version_suffix(base_url: str) -> str:
    base = base_url.rstrip("/")
    return base[:-3] if base.endswith("/v1") else base


def _number(value: Any, default: float = 0.0) -> float:
    try:
        if value is None:
            return default
        return float(value)
    except (TypeError, ValueError):
        return default


def _percent(remaining: float, total: float) -> float:
    if total <= 0:
        return 0
    return round(max(0, min(100, remaining / total * 100)), 2)


def _remaining_calls(remaining: float, avg_call_cost: float) -> int | None:
    if avg_call_cost <= 0:
        return None
    return max(0, math.floor(remaining / avg_call_cost))


def _calls_label(calls: int | None) -> str:
    if calls is None:
        return "需要人工确认"
    if calls >= 10000:
        return f"约 {calls // 1000}k 次"
    return f"约 {calls} 次"


def _month_start_unix() -> int:
    now = datetime.now(UTC)
    month_start = datetime(now.year, now.month, 1, tzinfo=UTC)
    return int(month_start.timestamp())


def _sum_openai_costs(payload: Any) -> float:
    total = 0.0

    def walk(value: Any) -> None:
        nonlocal total
        if isinstance(value, dict):
            amount = value.get("amount")
            if isinstance(amount, dict):
                total += _number(amount.get("value"))
            elif "cost" in value:
                total += _number(value.get("cost"))
            for item in value.values():
                walk(item)
            return
        if isinstance(value, list):
            for item in value:
                walk(item)

    walk(payload)
    return round(total, 6)


def _extract_credit_pair(payload: Any) -> tuple[float, float]:
    flat = _flatten_numbers(payload)
    total = (
        flat.get("monthly_limit")
        or flat.get("credit_limit")
        or flat.get("credits_limit")
        or flat.get("limit")
        or flat.get("total")
        or 0.0
    )
    remaining = (
        flat.get("credits_remaining")
        or flat.get("remaining_credits")
        or flat.get("remaining")
        or flat.get("available")
        or -1.0
    )
    used = _extract_usage_value(payload)
    if remaining < 0 and total > 0:
        remaining = max(total - used, 0)
    return float(total), float(remaining)


def _extract_usage_value(payload: Any) -> float:
    flat = _flatten_numbers(payload)
    return (
        flat.get("current_usage")
        or flat.get("usage")
        or flat.get("credits_used")
        or flat.get("used")
        or flat.get("requests")
        or 0.0
    )


def _flatten_numbers(payload: Any) -> dict[str, float]:
    values: dict[str, float] = {}

    def walk(value: Any, key_hint: str = "") -> None:
        if isinstance(value, dict):
            for key, item in value.items():
                walk(item, str(key).lower())
            return
        if isinstance(value, list):
            for item in value:
                walk(item, key_hint)
            return
        if key_hint:
            number = _number(value, default=float("nan"))
            if not math.isnan(number):
                values.setdefault(key_hint, number)

    walk(payload)
    return values
