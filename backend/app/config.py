"""Settings, read from environment variables or backend/.env."""
from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    # SQLite for local development. In production use PostgreSQL, e.g.
    # postgresql+psycopg://user:password@host:5432/dbname
    database_url: str = "sqlite:///./shop.db"

    # Used to sign staff login tokens. MUST be changed in production.
    secret_key: str = "change-me-in-production"
    token_minutes: int = 8 * 60

    # Comma-separated list of frontend origins allowed to call the API.
    cors_origins: str = "http://localhost:5173,http://127.0.0.1:5173"

    # The public HTTPS address of the deployed website. The QR code points here.
    public_site_url: str = ""

    # Stock rules
    near_expiry_days: int = 90

    # Shop's local time zone: decides "today" for expiry, bill numbers and daily totals
    timezone: str = "Asia/Kolkata"

    env: str = "development"

    # First start only: create this admin if there are no users yet (useful on hosts
    # without a shell). Remove the password from the host's settings after logging in.
    bootstrap_admin_username: str = ""
    bootstrap_admin_password: str = ""

    @property
    def cors_list(self) -> list[str]:
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]

    @property
    def is_production(self) -> bool:
        return self.env.lower() == "production"


@lru_cache
def get_settings() -> Settings:
    return Settings()
