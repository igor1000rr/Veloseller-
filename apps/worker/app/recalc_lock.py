"""БАГ 95: DB-based recalc lock для multi-worker safety.

Заменяет in-memory _running_recalcs dict (per-worker memory → race при 2+ uvicorn workers).
Использует таблицу recalc_jobs + RPC функции (migration add_recalc_jobs_table_and_lock_functions).

API:
  try_acquire_recalc_lock(sb, seller_id, worker_id=None) -> bool
  mark_recalc_done(sb, seller_id, result: dict) -> None
  mark_recalc_error(sb, seller_id, error_text: str) -> None
  update_recalc_progress(sb, seller_id, progress: dict) -> None
  get_recalc_state(sb, seller_id) -> Optional[dict]

Помещён в отдельный модуль (не main.py / не jobs/recalc.py) — оба используют
без циркулярных import'ов.
"""
from __future__ import annotations

import logging
import os
import socket
from datetime import date, datetime
from typing import Any, Optional

logger = logging.getLogger("veloseller.recalc_lock")


def _worker_id_default() -> str:
    """Уникальный идентификатор для дебага (видно какой worker взял lock)."""
    try:
        return f"{socket.gethostname()}:{os.getpid()}"
    except Exception:
        return f"unknown:{os.getpid()}"


def _json_safe(obj: Any) -> Any:
    """Конвертирует datetime/date в isoformat для JSONB колонок.

    supabase-py при .execute() не всегда сериализует datetime/date.
    Этот helper рекурсивно проходит dict/list.
    """
    if isinstance(obj, dict):
        return {k: _json_safe(v) for k, v in obj.items() if not k.startswith("_")}
    if isinstance(obj, list):
        return [_json_safe(i) for i in obj]
    if isinstance(obj, (datetime, date)):
        return obj.isoformat()
    return obj


def try_acquire_recalc_lock(
    sb,
    seller_id: str,
    worker_id: Optional[str] = None,
) -> bool:
    """Атомарно берёт recalc lock через PostgreSQL UPSERT с conditional WHERE.

    Returns:
        True — lock получен, можно начинать recalc.
        False — другой worker уже держит lock (status='running' и не stuck).

    Stale recovery: если status='running' старше 1 часа, считается что worker
    умер и можно перехватить lock.
    """
    wid = worker_id or _worker_id_default()
    try:
        res = sb.rpc("try_acquire_recalc_lock", {
            "p_seller_id": seller_id,
            "p_worker_id": wid,
        }).execute()
        return bool(res.data)
    except Exception:
        logger.exception("recalc lock acquire failed", extra={"seller_id": seller_id})
        return False


def mark_recalc_done(sb, seller_id: str, result: dict) -> None:
    """Помечает job как 'done' и сохраняет результат."""
    try:
        sb.rpc("mark_recalc_done", {
            "p_seller_id": seller_id,
            "p_result": _json_safe(result),
        }).execute()
    except Exception:
        logger.exception("mark_recalc_done failed", extra={"seller_id": seller_id})


def mark_recalc_error(sb, seller_id: str, error_text: str) -> None:
    """Помечает job как 'error' и сохраняет текст ошибки (LEFT 500 chars в RPC)."""
    try:
        sb.rpc("mark_recalc_error", {
            "p_seller_id": seller_id,
            "p_error_text": str(error_text)[:500],
        }).execute()
    except Exception:
        logger.exception("mark_recalc_error failed", extra={"seller_id": seller_id})


def update_recalc_progress(sb, seller_id: str, progress: dict) -> None:
    """Best-effort обновление progress JSONB. Не критично если падает.

    Используется только в running state — RPC сам проверяет status='running'.
    """
    try:
        sb.rpc("update_recalc_progress", {
            "p_seller_id": seller_id,
            "p_progress": _json_safe(progress),
        }).execute()
    except Exception:
        # Тихо: progress не критичен для корректности recalc
        pass


def get_recalc_state(sb, seller_id: str) -> Optional[dict]:
    """Текущий state из recalc_jobs или None если ни разу не запускался."""
    try:
        res = sb.table("recalc_jobs").select("*").eq("seller_id", seller_id).execute()
        if res.data and len(res.data) > 0:
            return res.data[0]
        return None
    except Exception:
        logger.exception("get_recalc_state failed", extra={"seller_id": seller_id})
        return None
