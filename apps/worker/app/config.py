"""Конфигурация worker.

БАГ 56 fix: fail-fast при старте если критичные env не заданы. Раньше worker
стартовал нормально, а потом падал на первом же запросе с непонятной ошибкой
типа "URL is empty".
"""
from __future__ import annotations
import os
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

    # --- Деплой-конфиг (мультиверсия: РФ veloseller.ru vs *.com) ------------
    # Дефолты = поведение РФ-прода. .com задаёт значения явно в своём .env.
    # Пока поля только хранятся; вшивание в поведение (локаль писем, гейтинг
    # radar-джоб в scheduler) делается в следующих фазах. Зеркало web/lib/features.ts.
    locale: str = "ru"
    enabled_marketplaces: str = "ozon,wildberries"  # CSV; .com задаст "amazon,shopify"
    radar_enabled: bool = True

    @property
    def enabled_marketplaces_list(self) -> list[str]:
        return [m.strip().lower() for m in self.enabled_marketplaces.split(",") if m.strip()]


settings = Settings()


def _validate_production_env() -> None:
    """БАГ 56: проверка критичных env только в production.

    В тестах/dev этот блок пропускается (ENV != production).
    """
    env = os.getenv("ENV", "development").lower()
    if env != "production":
        return

    errors = []
    if not settings.supabase_url:
        errors.append("SUPABASE_URL не задан")
    if not settings.supabase_service_role_key:
        errors.append("SUPABASE_SERVICE_ROLE_KEY не задан")
    if settings.worker_secret == "dev-secret-replace-me":
        errors.append("WORKER_SECRET использует dev-значение в production")
    if not os.getenv("SECRET_ENCRYPTION_KEY"):
        errors.append("SECRET_ENCRYPTION_KEY не задан — API ключи маркетплейсов будут храниться в открытом виде")
    if not os.getenv("TELEGRAM_WEBHOOK_SECRET"):
        errors.append("TELEGRAM_WEBHOOK_SECRET не задан — Telegram webhook без верификации (БАГ 52)")
    # APP_URL не критичен (дефолт veloseller.ru), но желателен

    if errors:
        msg = "Production env проверка не пройдена:\n  - " + "\n  - ".join(errors)
        raise RuntimeError(msg)


_validate_production_env()
