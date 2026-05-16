"""Structured logger для worker.

Использует stdlib logging с JSON-форматтером. Логи идут в stdout/stderr,
где systemd journalctl/Coolify их подбирает. Это база для подключения Sentry/Loki позже.

Использование:
    from app.logger import logger
    logger.info("recalc started", extra={"seller_id": sid, "period_days": 30})
    logger.warning("data gap detected", extra={"product_id": pid, "gap_hours": 36})
    logger.error("sync failed", extra={"connection_id": cid}, exc_info=True)
"""
from __future__ import annotations
import json
import logging
import os
import sys
import traceback
from datetime import datetime, timezone
from typing import Any


class JsonFormatter(logging.Formatter):
    """Сериализует LogRecord в JSON."""

    # Стандартные атрибуты LogRecord которые не нужно дублировать в extra
    STANDARD_ATTRS = {
        "name", "msg", "args", "levelname", "levelno", "pathname", "filename",
        "module", "exc_info", "exc_text", "stack_info", "lineno", "funcName",
        "created", "msecs", "relativeCreated", "thread", "threadName",
        "processName", "process", "message", "asctime", "taskName",
    }

    def format(self, record: logging.LogRecord) -> str:
        out: dict[str, Any] = {
            "timestamp": datetime.fromtimestamp(record.created, tz=timezone.utc).isoformat(),
            "level": record.levelname,
            "logger": record.name,
            "message": record.getMessage(),
        }
        if record.exc_info:
            out["exception"] = "".join(traceback.format_exception(*record.exc_info)).strip()

        # Добавляем extra поля (обязательно исключая стандартные)
        for key, value in record.__dict__.items():
            if key in self.STANDARD_ATTRS:
                continue
            if key.startswith("_"):
                continue
            try:
                json.dumps(value)  # проверить сериализуемость
                out[key] = value
            except (TypeError, ValueError):
                out[key] = str(value)
        return json.dumps(out, ensure_ascii=False)


def setup_logger(name: str = "veloseller", level: str | None = None) -> logging.Logger:
    """Настраивает логгер с JsonFormatter.

    Уровень логирования: из LOG_LEVEL env (дефолт INFO).
    В тестах используется WARNING ⑇тобы не засорять вывод.
    """
    log_level = level or os.environ.get("LOG_LEVEL", "INFO").upper()
    logger = logging.getLogger(name)
    logger.setLevel(getattr(logging, log_level, logging.INFO))

    # Не добавляем handler повторно при реимпорте
    if not logger.handlers:
        handler = logging.StreamHandler(sys.stdout)
        handler.setFormatter(JsonFormatter())
        logger.addHandler(handler)
        logger.propagate = False

    return logger


# Основной логгер worker
logger = setup_logger("veloseller")
