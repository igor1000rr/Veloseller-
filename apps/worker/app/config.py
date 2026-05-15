"""Конфигурация worker."""
from __future__ import annotations
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    # Supabase
    supabase_url: str = ""
    supabase_service_role_key: str = ""
    database_url: str = ""

    # Auth Web -> Worker
    worker_secret: str = "dev-secret-replace-me"

    # Google Sheets
    google_application_credentials: str = "./secrets/gsa.json"

    # APScheduler (отключаем при тестах)
    enable_scheduler: bool = True

    # Расчётные константы из спеки
    anomaly_multiplier: float = 5.0
    initial_confidence: float = 95.0
    confidence_floor: float = 40.0
    median_window_days: int = 30


settings = Settings()
