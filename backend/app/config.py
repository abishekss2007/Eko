"""Runtime settings, read only from environment variables (never hard-coded)."""

from functools import lru_cache
from pathlib import Path

from pydantic import Field, SecretStr
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Application settings. See `.env.example` for every variable."""

    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    gemini_api_key: SecretStr | None = Field(default=None, description="Google AI Studio key; optional.")
    gemini_model: str = Field(default="gemini-2.5-flash", min_length=1, max_length=64)
    gemini_timeout_s: float = Field(default=12.0, gt=0, le=60)
    gemini_temperature: float = Field(default=0.3, ge=0, le=1)
    gemini_thinking_budget: int | None = Field(
        default=0, ge=0, description="0 disables thinking for low latency; unset for model default."
    )

    air_cache_ttl_s: int = Field(default=20 * 60, ge=0)
    geocode_cache_ttl_s: int = Field(default=24 * 60 * 60, ge=0)
    history_cache_ttl_s: int = Field(default=60 * 60, ge=0)
    archive_cache_ttl_s: int = Field(default=24 * 60 * 60, ge=0)
    archive_timeout_s: float = Field(
        default=120.0, gt=0, le=600, description="The 1991-today archive can take a minute; it loads in the background."
    )
    archive_retry_s: int = Field(
        default=10 * 60, ge=0, description="Wait this long before retrying a failed archive load."
    )
    ai_cache_ttl_s: int = Field(default=15 * 60, ge=0)
    upstream_timeout_s: float = Field(default=8.0, gt=0, le=30)

    ai_rate_limit: str = "20/minute"
    data_rate_limit: str = "60/minute"
    max_body_bytes: int = Field(default=16 * 1024, gt=0)

    auth_rate_limit: str = "10/minute"
    database_path: Path = Field(default=Path("data/saanssafe.db"), description="SQLite file for accounts.")
    session_days: int = Field(default=7, ge=1, le=90)
    cookie_secure: bool = Field(default=True, description="Send the session cookie over HTTPS only.")

    # A public, shared demo account (seeded with a sample family at every start) so judges can try
    # the signed-in features without signing up. Its password is shown on the log-in page on purpose.
    demo_account: bool = Field(default=True, description="Create and reset the shared demo account.")
    demo_email: str = Field(default="demo@saanssafe.app", max_length=254)
    demo_password: SecretStr = Field(default=SecretStr("SaansSafe-Demo-2026"), min_length=8)

    enable_api_docs: bool = False
    static_dir: Path | None = Field(default=None, description="Built frontend to serve at '/'.")

    @property
    def gemini_enabled(self) -> bool:
        """True when a non-empty Gemini key is configured."""
        return bool(self.gemini_api_key and self.gemini_api_key.get_secret_value().strip())


@lru_cache
def get_settings() -> Settings:
    """Settings are read once per process."""
    return Settings()
