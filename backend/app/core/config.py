from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    app_name: str = "CareerPilot API"
    environment: str = "local"
    backend_cors_origins: str = "http://localhost:5173"

    llm_dry_run: bool = True
    llm_provider: str = "deepseek"
    llm_model: str = "deepseek-chat"
    llm_base_url: str = "https://api.deepseek.com/v1"
    llm_api_key: str | None = None
    llm_timeout_seconds: float = 30
    llm_max_retries: int = 2

    judge_dry_run: bool = True
    judge_provider: str = "openai"
    judge_model: str = "gpt-4.1-mini"
    judge_base_url: str = "https://api.openai.com/v1"
    judge_api_key: str | None = None

    api_access_token: str | None = None
    rate_limit_requests_per_minute: int = 180
    security_headers_enabled: bool = True

    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    @property
    def cors_origins(self) -> list[str]:
        return [origin.strip() for origin in self.backend_cors_origins.split(",") if origin.strip()]


@lru_cache
def get_settings() -> Settings:
    return Settings()
