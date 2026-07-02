"""Veloseller worker — FastAPI приложение."""
from __future__ import annotations

import hmac
import logging
import re
import socket
from contextlib import asynccontextmanager
from datetime import datetime, timedelta, timezone
from typing import Callable, Optional

from fastapi import BackgroundTasks, Depends, FastAPI, File, Header, HTTPException, Request, UploadFile

from app.config import settings
from app.db import fetch_all, get_supabase
from app.jobs.recalc import recalc_all_sellers, recalc_seller, recalc_seller_all_periods
from app.jobs.scheduler import start_scheduler, stop_scheduler
from app.logger import JsonFormatter, setup_logger
from app.radar.api import router as radar_router
from app.cost_import_api import router as cost_import_router
from app.schemas import SnapshotInput, SourceType
from app.sources import csv_upload, feed as feed_src, google_sheet, ozon, shopify, wildberries
from app.telegram_link import verify_telegram_link_token
# Слой персистентности ингеста вынесен в отдельный модуль (разгрузка god-file).
# Реэкспортируем имена, чтобы /ingest-ручки и фоновые синки (ниже) их видели,
# а внешние импорты `from app.main import ...` и патчи тестов продолжали работать.
from app.ingest_persist import (
    _ozon_kind_from_warehouse,
    _ensure_products,
    _persist_snapshots,
    _send_sync_error_notifications,
    _mark_connection_synced,
    _try_acquire_sync_lock,
    _PRODUCTS_IN_BATCH,
    _INSERT_BATCH,
    _DEDUP_WINDOW_HOURS,
    SYNC_FAILURE_AUTO_PAUSE_THRESHOLD,
    SYNC_ERROR_NOTIFY_COOLDOWN_HOURS,
)

_root = logging.getLogger()
if not any(isinstance(h.formatter, JsonFormatter) for h in _root.handlers if h.formatter):
    _root.handlers.clear()
    import sys as _sys
    _h = logging.StreamHandler(_sys.stdout)
    _h.setFormatter(JsonFormatter())
    _root.addHandler(_h)
_root.setLevel(logging.INFO)

logger = setup_logger("veloseller.worker")


import os as _os


def _scrub_sentry_event(event: dict, hint=None) -> Optional[dict]:
    SENSITIVE_KEYS = {
        "api_key", "token", "client_id", "password", "secret", "x-worker-secret",
        "authorization", "stripe_subscription_id", "stripe_customer_id",
        "email", "telegram_chat_id", "chat_id",
    }

    def _scrub(obj):
        if isinstance(obj, dict):
            return {k: ("[REDACTED]" if k.lower() in SENSITIVE_KEYS else _scrub(v)) for k, v in obj.items()}
        if isinstance(obj, list):
            return [_scrub(i) for i in obj]
        return obj

    return _scrub(event)


_sentry_dsn = _os.environ.get("SENTRY_DSN")
if _sentry_dsn:
    try:
        import sentry_sdk
        from sentry_sdk.integrations.fastapi import FastApiIntegration
        from sentry_sdk.integrations.logging import LoggingIntegration

        init_kwargs = {
            "dsn": _sentry_dsn,
            "integrations": [
                FastApiIntegration(),
                LoggingIntegration(level=logging.INFO, event_level=logging.ERROR),
            ],
            "environment": _os.environ.get("SENTRY_ENV", "production"),
            "traces_sample_rate": 0.1,
            "release": _os.environ.get("SENTRY_RELEASE"),
            "send_default_pii": False,
            "before_send": _scrub_sentry_event,
        }
        import inspect as _inspect
        _sig = _inspect.signature(sentry_sdk.init)
        if "include_local_variables" in _sig.parameters:
            init_kwargs["include_local_variables"] = False
        elif "with_locals" in _sig.parameters:
            init_kwargs["with_locals"] = False

        sentry_sdk.init(**init_kwargs)
        logger.info("sentry initialized", extra={
            "env": _os.environ.get("SENTRY_ENV", "production"),
            "with_local_vars": False,
        })
    except ImportError:
        logger.warning("SENTRY_DSN set but sentry-sdk not installed — skipping")
    except Exception as _e:
        logger.warning("sentry init failed: %s", _e)


# In-memory dict для быстрого рунтайм-статуса в рамках этого worker-процесса.
# Сам лок и персистентный статус в БД (функции try_acquire_recalc_lock /
# mark_recalc_done / mark_recalc_error из миграции 0009).
_running_recalcs: dict[str, dict] = {}
_RECALC_STATE_TTL = timedelta(hours=24)
_WORKER_ID = f"{socket.gethostname()}:{_os.getpid()}"
_UUID_RE = re.compile(r"^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$", re.IGNORECASE)
_CSV_MAX_SIZE_BYTES = 20 * 1024 * 1024


# --- Пулы воркеров: глобальный потолок параллельных пересчётов и синков -------
# Пересчёт грузит в память всю историю продавца и считает на Python (GIL); ручные
# синки через /ingest/* уходят в anyio-threadpool (до 40 одновременно) и под залпом
# (синк всех складов разом) дают спайк RAM/CPU + пула соединений Postgres. Без
# потолка N параллельных задач разъедают RAM (риск OOM) и душат event-loop, из-за
# чего ingest начинает ловить таймауты. Решение: пул из N выделенных потоков +
# thread-safe очередь (см. app.task_queues.WorkerPool). Лишние задачи ждут в
# очереди (backpressure) — RAM/CPU ограничены, воркер живой, ingest отзывчив.
#
# Состояние очереди инкапсулировано в инстансе WorkerPool (НЕ module-глобал с
# реассайном) — иначе `from app.main import _recalc_queue` зафиксировал бы None
# навсегда и пул молча не активировался бы у импортёра. Пулы поднимаются в lifespan
# (прод под uvicorn); в юнит-тестах TestClient без `with` lifespan не стартует →
# active()==False → старый путь background_tasks.add_task (поведение 1:1, CI не меняется).
from app.task_queues import WorkerPool

_RECALC_CONCURRENCY = int(_os.environ.get("RECALC_CONCURRENCY", "3"))
_SYNC_CONCURRENCY = int(_os.environ.get("SYNC_CONCURRENCY", "4"))
_recalc_pool = WorkerPool("recalc", _RECALC_CONCURRENCY)
_sync_pool = WorkerPool("sync", _SYNC_CONCURRENCY)


def _run_sync_item(item: tuple[Callable[..., None], tuple]) -> None:
    """Хендлер пула синков: распаковывает (fn, args) и выполняет fn(*args)."""
    fn, args = item
    fn(*args)


def _dispatch_sync(background_tasks: BackgroundTasks, fn: Callable[..., None], *args) -> None:
    """Синк → в пул (если поднят в lifespan), иначе fallback в FastAPI background tasks.

    Пул держит глобальный потолок одновременных синков (SYNC_CONCURRENCY); очередь
    создаёт backpressure под залпом. Fallback (пул не активен) сохраняет прежнее
    поведение в юнит-тестах, где lifespan не запускается.
    """
    if _sync_pool.active():
        _sync_pool.enqueue((fn, args))
    else:
        background_tasks.add_task(fn, *args)


def _is_production() -> bool:
    """Сервер в проде? Проверяет ENV и SENTRY_ENV (fallback)."""
    env = _os.environ.get("ENV", _os.environ.get("SENTRY_ENV", "development")).lower()
    return env == "production"


def _try_acquire_recalc_lock(seller_id: str) -> bool:
    """Атомарный try-lock через БД-функцию public.try_acquire_recalc_lock.

    Возвращает True если лок взят (можно запускать recalc), False — если взят
    другим процессом и свежий (<1ч). Stale-локи БД перехватывает автоматически.

    При ошибке БД (функция не существует, сеть): в ПРОДЕ — fail-closed (False),
    чтобы при сбое лок-системы на нескольких репликах два recalc одного селлера
    НЕ пошли параллельно (драка за event-таблицы, дубли/пустые окна). В dev —
    оптимистично (True), чтобы локальная разработка без БД-функции не блокировалась.
    Раньше всегда возвращалось True — это и был fail-open баг.
    """
    try:
        sb = get_supabase()
        res = sb.rpc("try_acquire_recalc_lock", {
            "p_seller_id": seller_id,
            "p_worker_id": _WORKER_ID,
            "p_stale_after": "01:00:00",
        }).execute()
        return bool(getattr(res, "data", False))
    except Exception:
        logger.exception("try_acquire_recalc_lock RPC failed",
                         extra={"seller_id": seller_id})
        return not _is_production()


def _mark_recalc_done(seller_id: str, result: dict) -> None:
    try:
        sb = get_supabase()
        sb.rpc("mark_recalc_done", {
            "p_seller_id": seller_id, "p_result": result,
        }).execute()
    except Exception:
        logger.exception("mark_recalc_done RPC failed", extra={"seller_id": seller_id})


def _mark_recalc_error(seller_id: str, err: str) -> None:
    try:
        sb = get_supabase()
        sb.rpc("mark_recalc_error", {
            "p_seller_id": seller_id, "p_error_text": err,
        }).execute()
    except Exception:
        logger.exception("mark_recalc_error RPC failed", extra={"seller_id": seller_id})


def _db_get_recalc_state(seller_id: str) -> Optional[dict]:
    """Читает состояние recalc job из recalc_jobs. Используется /status endpointом
    когда in-memory пуст (после рестарта worker'а) и при дедупликации в job_recalc_seller.

    БД хранит ошибку в колонке error_text, наружу отдаём как error (для UI).
    Возвращает None если записи нет или ошибка БД.
    """
    try:
        sb = get_supabase()
        res = (sb.table("recalc_jobs")
               .select("status, started_at, finished_at, result, error_text, progress")
               .eq("seller_id", seller_id)
               .maybe_single()
               .execute())
        data = getattr(res, "data", None)
        if not data or not isinstance(data, dict):
            return None
        return {
            "status": data.get("status"),
            "started_at": data.get("started_at"),
            "finished_at": data.get("finished_at"),
            "result": data.get("result"),
            "error": data.get("error_text"),
            "progress": data.get("progress"),
        }
    except Exception:
        return None


def _cleanup_old_recalcs() -> None:
    """Чистика in-memory dict от старых done/error записей + БД от завершённых >7д.

    Stale running-записи не трогаем — их перехватит try_acquire_recalc_lock
    в следующий раз. БД записи старше 7 дней больше не полезны.
    """
    cutoff = datetime.now(timezone.utc) - _RECALC_STATE_TTL
    stale = []
    for sid, state in _running_recalcs.items():
        if state.get("status") in ("done", "error"):
            finished = state.get("finished_at")
            if finished:
                try:
                    if datetime.fromisoformat(finished.replace("Z", "+00:00")) < cutoff:
                        stale.append(sid)
                except (ValueError, AttributeError):
                    stale.append(sid)
    for sid in stale:
        del _running_recalcs[sid]
    if stale:
        logger.info("cleaned up stale recalc states (memory)", extra={"count": len(stale)})

    try:
        db_cutoff = (datetime.now(timezone.utc) - timedelta(days=7)).isoformat()
        sb = get_supabase()
        (sb.table("recalc_jobs")
         .delete()
         .lt("started_at", db_cutoff)
         .in_("status", ["done", "error"])
         .execute())
    except Exception:
        pass


@asynccontextmanager
async def lifespan(app: FastAPI):
    if settings.enable_scheduler:
        start_scheduler()
        logger.info("scheduler started", extra={"event": "lifecycle"})
    _recalc_pool.start(_run_recalc_bg)
    _sync_pool.start(_run_sync_item)
    yield
    _sync_pool.stop()
    _recalc_pool.stop()
    if settings.enable_scheduler:
        stop_scheduler()
        logger.info("scheduler stopped", extra={"event": "lifecycle"})


app = FastAPI(title="Veloseller Worker", version="0.1.0", lifespan=lifespan)


def require_worker_secret(x_worker_secret: Optional[str] = Header(None)) -> None:
    """Аутентификация Web → Worker через X-Worker-Secret."""
    secret = settings.worker_secret
    is_dev_default = (not secret) or secret == "dev-secret-replace-me"

    if is_dev_default:
        if _is_production():
            raise HTTPException(500, "Server misconfigured: worker secret not set")
        return

    if not x_worker_secret or not hmac.compare_digest(x_worker_secret, secret):
        raise HTTPException(401, "Invalid worker secret")


# Подключаем Radar роутер. /radar/* endpoints защищены через
# require_worker_secret на уровне роутера (передаём dependency).
app.include_router(radar_router, dependencies=[Depends(require_worker_secret)])
# Импорт себестоимости (массовая загрузка из карточки товара) — тот же worker-secret.
app.include_router(cost_import_router, dependencies=[Depends(require_worker_secret)])


@app.get("/health")
def health() -> dict:
    return {"status": "ok", "ts": datetime.now(timezone.utc).isoformat()}




def _run_ozon_sync_bg(
    connection_id: str,
    seller_id: str,
    client_id: str,
    api_key: str,
    warehouse_kind: Optional[str] = None,
) -> None:
    sb = get_supabase()
    try:
        kind = _ozon_kind_from_warehouse(warehouse_kind)
        snapshots = ozon.fetch_snapshots(client_id, api_key, kind=kind)
        inserted = _persist_snapshots(seller_id, connection_id, SourceType.MARKETPLACE_API, snapshots)
        _mark_connection_synced(sb, connection_id)
        logger.info("ozon synced (bg)", extra={
            "connection_id": connection_id, "warehouse_kind": warehouse_kind,
            "kind": kind, "inserted": inserted, "fetched_skus": len(snapshots),
        })
    except Exception as e:
        _mark_connection_synced(sb, connection_id, error=str(e)[:500])
        logger.exception("ozon sync failed (bg)", extra={"connection_id": connection_id})


def _run_wb_sync_bg(
    connection_id: str,
    seller_id: str,
    token: str,
    warehouse_kind: Optional[str] = None,
) -> None:
    sb = get_supabase()
    try:
        if warehouse_kind == "wb_fbs":
            snapshots = wildberries.fetch_fbs_snapshots(token)
            wb_flow = "fbs"
        else:
            snapshots = wildberries.fetch_snapshots(token)
            wb_flow = "fbo"
        inserted = _persist_snapshots(seller_id, connection_id, SourceType.MARKETPLACE_API, snapshots)
        _mark_connection_synced(sb, connection_id)
        logger.info("wb synced (bg)", extra={
            "connection_id": connection_id, "warehouse_kind": warehouse_kind,
            "wb_flow": wb_flow, "inserted": inserted, "fetched_skus": len(snapshots),
        })
    except Exception as e:
        _mark_connection_synced(sb, connection_id, error=str(e)[:500])
        logger.exception("wb sync failed (bg)", extra={"connection_id": connection_id})


def _run_google_sheet_sync_bg(connection_id: str, seller_id: str, sheet: str, worksheet_index: int) -> None:
    sb = get_supabase()
    try:
        snapshots = google_sheet.fetch_snapshots(sheet, worksheet_index)
        inserted = _persist_snapshots(seller_id, connection_id, SourceType.GOOGLE_SHEET, snapshots)
        _mark_connection_synced(sb, connection_id)
        logger.info("google sheet synced (bg)", extra={"connection_id": connection_id, "inserted": inserted})
    except Exception as e:
        _mark_connection_synced(sb, connection_id, error=str(e)[:500])
        logger.exception("google sheet sync failed (bg)", extra={"connection_id": connection_id})


def _run_feed_sync_bg(connection_id: str, seller_id: str, feed_url: str) -> None:
    sb = get_supabase()
    try:
        snapshots = feed_src.fetch_snapshots(feed_url)
        inserted = _persist_snapshots(seller_id, connection_id, SourceType.FEED, snapshots)
        _mark_connection_synced(sb, connection_id)
        logger.info("feed synced (bg)", extra={"connection_id": connection_id, "inserted": inserted})
    except Exception as e:
        _mark_connection_synced(sb, connection_id, error=str(e)[:500])
        logger.exception("feed sync failed (bg)", extra={"connection_id": connection_id})


def _run_shopify_sync_bg(connection_id: str, seller_id: str, shop: str, access_token: str) -> None:
    sb = get_supabase()
    try:
        snapshots = shopify.fetch_snapshots(shop, access_token)
        inserted = _persist_snapshots(seller_id, connection_id, SourceType.MARKETPLACE_API, snapshots)
        _mark_connection_synced(sb, connection_id)
        logger.info("shopify synced (bg)", extra={
            "connection_id": connection_id, "inserted": inserted, "fetched_skus": len(snapshots),
        })
    except Exception as e:
        _mark_connection_synced(sb, connection_id, error=str(e)[:500])
        logger.exception("shopify sync failed (bg)", extra={"connection_id": connection_id})


@app.post("/ingest/csv/{connection_id}", dependencies=[Depends(require_worker_secret)])
async def ingest_csv(connection_id: str, file: UploadFile = File(...)) -> dict:
    """Загрузка остатков/цен CSV-файлом в склад типа csv.

    Синхронно (файл уже в памяти): parse_csv → _persist_snapshots(csv_upload).
    seller_id берём из записи склада, а не из запроса — не доверяем клиенту.
    Каждая загрузка = новый набор снапшотов; движок сам считает движение
    остатков (sales_like/replenishment_like) между загрузками, как и у API-складов.
    """
    sb = get_supabase()
    conn = sb.table("data_connections").select("*").eq("id", connection_id).single().execute()
    if not conn.data:
        raise HTTPException(404, "Connection not found")
    seller_id = conn.data["seller_id"]

    raw = await file.read()
    if not raw:
        raise HTTPException(400, "Файл пустой")
    filename = (file.filename or "").lower()
    try:
        if filename.endswith(".xlsx"):
            snapshots = csv_upload.parse_xlsx(raw)
        elif filename.endswith(".xls"):
            raise HTTPException(400, "Старый формат .xls не поддерживается — сохраните как .xlsx или CSV.")
        else:
            snapshots = csv_upload.parse_csv(raw)
    except HTTPException:
        raise
    except UnicodeDecodeError:
        raise HTTPException(
            400,
            "Не удалось прочитать файл как текст. Если это Excel — сохраните как .xlsx или CSV (UTF-8) и загрузите снова.",
        )
    except ValueError as e:
        raise HTTPException(400, str(e))
    except Exception:
        logger.exception("csv/xlsx parse failed", extra={"connection_id": connection_id})
        raise HTTPException(400, "Не удалось прочитать файл. Проверьте формат (CSV или XLSX).")

    if not _try_acquire_sync_lock(sb, connection_id):
        return {"started": False, "status": "running", "message": "Загрузка уже идёт или склад на паузе"}
    try:
        inserted = _persist_snapshots(seller_id, connection_id, SourceType.CSV_UPLOAD, snapshots)
        _mark_connection_synced(sb, connection_id)
    except Exception as e:
        _mark_connection_synced(sb, connection_id, error=str(e)[:500])
        logger.exception("csv ingest failed", extra={"connection_id": connection_id})
        raise HTTPException(500, "Не удалось сохранить данные из файла")
    logger.info("csv ingested", extra={
        "connection_id": connection_id, "parsed": len(snapshots), "inserted": inserted,
    })
    return {"ok": True, "parsed": len(snapshots), "inserted": inserted}


@app.post("/ingest/manual/{connection_id}", dependencies=[Depends(require_worker_secret)])
async def ingest_manual(connection_id: str, request: Request) -> dict:
    """Ручной режим: приём остатков/цен, введённых в кабинете вручную.

    Тело: {"items": [{"sku","product_name"?,"stock_quantity","price"}...]}.
    Персистим как снапшоты source=manual — тот же движок движения остатков.
    Правки «Продажи −N / Пополнения +N» веб-слой превращает в новый остаток и
    шлёт сюда обычным набором items (никакой отдельной таблицы движений — дельты
    выводятся из соседних снапшотов, как и везде).
    """
    sb = get_supabase()
    conn = sb.table("data_connections").select("*").eq("id", connection_id).single().execute()
    if not conn.data:
        raise HTTPException(404, "Connection not found")
    seller_id = conn.data["seller_id"]

    try:
        body = await request.json()
    except Exception:
        raise HTTPException(400, "Невалидный JSON")
    items = (body or {}).get("items")
    if not isinstance(items, list) or not items:
        raise HTTPException(400, "Поле items обязательно (непустой список товаров)")
    if len(items) > 50_000:
        raise HTTPException(400, "Слишком много позиций за один запрос (максимум 50 000)")

    from decimal import Decimal, InvalidOperation
    snapshots: list[SnapshotInput] = []
    seen: dict[str, SnapshotInput] = {}
    for i, it in enumerate(items):
        if not isinstance(it, dict):
            raise HTTPException(400, f"Позиция {i}: ожидается объект")
        sku = str(it.get("sku") or "").strip()
        if not sku:
            raise HTTPException(400, f"Позиция {i}: пустой sku")
        try:
            stock = int(it.get("stock_quantity"))
        except (TypeError, ValueError):
            raise HTTPException(400, f"Позиция {sku}: невалидный stock_quantity")
        if stock < 0:
            raise HTTPException(400, f"Позиция {sku}: отрицательный остаток")
        price_raw = it.get("price")
        try:
            price = Decimal(str(price_raw)) if price_raw not in (None, "") else Decimal("0")
        except (InvalidOperation, ValueError):
            raise HTTPException(400, f"Позиция {sku}: невалидная цена")
        if price < 0:
            raise HTTPException(400, f"Позиция {sku}: отрицательная цена")
        name = str(it.get("product_name") or "").strip() or None
        # Дедуп внутри запроса — последняя запись по sku побеждает.
        seen[sku] = SnapshotInput(sku=sku, product_name=name, stock_quantity=stock, price=price)
    snapshots = list(seen.values())

    if not _try_acquire_sync_lock(sb, connection_id):
        return {"started": False, "status": "running", "message": "Обновление уже идёт или склад на паузе"}
    try:
        inserted = _persist_snapshots(seller_id, connection_id, SourceType.MANUAL, snapshots)
        _mark_connection_synced(sb, connection_id)
    except Exception as e:
        _mark_connection_synced(sb, connection_id, error=str(e)[:500])
        logger.exception("manual ingest failed", extra={"connection_id": connection_id})
        raise HTTPException(500, "Не удалось сохранить данные")
    logger.info("manual ingested", extra={
        "connection_id": connection_id, "items": len(snapshots), "inserted": inserted,
    })
    return {"ok": True, "parsed": len(snapshots), "inserted": inserted}


@app.post("/ingest/google-sheet/{connection_id}", dependencies=[Depends(require_worker_secret)])
def ingest_google_sheet(connection_id: str, background_tasks: BackgroundTasks) -> dict:
    sb = get_supabase()
    conn = sb.table("data_connections").select("*").eq("id", connection_id).single().execute()
    if not conn.data:
        raise HTTPException(404, "Connection not found")
    cfg = conn.data.get("config") or {}
    sheet = cfg.get("sheet_url") or cfg.get("sheet_id")
    if not sheet:
        raise HTTPException(400, "config.sheet_url или config.sheet_id обязателен")
    if not _try_acquire_sync_lock(sb, connection_id):
        return {"started": False, "status": "running", "message": "Sync уже идёт или склад на паузе"}
    _dispatch_sync(background_tasks, _run_google_sheet_sync_bg, connection_id, conn.data["seller_id"], sheet, cfg.get("worksheet_index", 0))
    return {"started": True, "status": "running", "message": "Sync запущен в фоне"}


@app.post("/ingest/ozon/{connection_id}", dependencies=[Depends(require_worker_secret)])
def ingest_ozon(connection_id: str, background_tasks: BackgroundTasks) -> dict:
    sb = get_supabase()
    conn = sb.table("data_connections").select("*").eq("id", connection_id).single().execute()
    if not conn.data:
        raise HTTPException(404, "Connection not found")
    cfg = conn.data.get("config") or {}
    client_id = cfg.get("client_id")
    api_key = cfg.get("api_key")
    from app.crypto import decrypt_if_encrypted
    client_id = decrypt_if_encrypted(client_id)
    api_key = decrypt_if_encrypted(api_key)
    if not client_id or not api_key:
        raise HTTPException(400, "config.client_id и config.api_key обязательны")
    if not _try_acquire_sync_lock(sb, connection_id):
        return {"started": False, "status": "running", "message": "Sync уже идёт или склад на паузе"}
    warehouse_kind = conn.data.get("warehouse_kind")
    _dispatch_sync(
        background_tasks, _run_ozon_sync_bg,
        connection_id, conn.data["seller_id"], client_id, api_key, warehouse_kind,
    )
    return {"started": True, "status": "running", "message": "Sync запущен в фоне"}


@app.post("/ingest/wb/{connection_id}", dependencies=[Depends(require_worker_secret)])
def ingest_wb(connection_id: str, background_tasks: BackgroundTasks) -> dict:
    sb = get_supabase()
    conn = sb.table("data_connections").select("*").eq("id", connection_id).single().execute()
    if not conn.data:
        raise HTTPException(404, "Connection not found")
    cfg = conn.data.get("config") or {}
    token = cfg.get("token") or cfg.get("api_key")
    from app.crypto import decrypt_if_encrypted
    token = decrypt_if_encrypted(token)
    if not token:
        raise HTTPException(400, "config.token обязателен")
    if not _try_acquire_sync_lock(sb, connection_id):
        return {"started": False, "status": "running", "message": "Sync уже идёт или склад на паузе"}
    warehouse_kind = conn.data.get("warehouse_kind")
    _dispatch_sync(
        background_tasks, _run_wb_sync_bg,
        connection_id, conn.data["seller_id"], token, warehouse_kind,
    )
    return {"started": True, "status": "running", "message": "Sync запущен в фоне"}


@app.post("/ingest/feed/{connection_id}", dependencies=[Depends(require_worker_secret)])
def ingest_feed(connection_id: str, background_tasks: BackgroundTasks) -> dict:
    sb = get_supabase()
    conn = sb.table("data_connections").select("*").eq("id", connection_id).single().execute()
    if not conn.data:
        raise HTTPException(404, "Connection not found")
    cfg = conn.data.get("config") or {}
    feed_url = cfg.get("feed_url")
    if not feed_url:
        raise HTTPException(400, "config.feed_url обязателен")
    if not _try_acquire_sync_lock(sb, connection_id):
        return {"started": False, "status": "running", "message": "Sync уже идёт или склад на паузе"}
    _dispatch_sync(background_tasks, _run_feed_sync_bg, connection_id, conn.data["seller_id"], feed_url)
    return {"started": True, "status": "running", "message": "Sync запущен в фоне"}


@app.post("/ingest/shopify/{connection_id}", dependencies=[Depends(require_worker_secret)])
def ingest_shopify(connection_id: str, background_tasks: BackgroundTasks) -> dict:
    sb = get_supabase()
    conn = sb.table("data_connections").select("*").eq("id", connection_id).single().execute()
    if not conn.data:
        raise HTTPException(404, "Connection not found")
    cfg = conn.data.get("config") or {}
    from app.crypto import decrypt_if_encrypted
    shop = cfg.get("shop") or cfg.get("shop_domain")
    access_token = decrypt_if_encrypted(cfg.get("access_token"))
    if not shop or not access_token:
        raise HTTPException(400, "config.shop и config.access_token обязательны")
    if not _try_acquire_sync_lock(sb, connection_id):
        return {"started": False, "status": "running", "message": "Sync уже идёт или склад на паузе"}
    _dispatch_sync(
        background_tasks, _run_shopify_sync_bg,
        connection_id, conn.data["seller_id"], shop, access_token,
    )
    return {"started": True, "status": "running", "message": "Sync запущен в фоне"}


def _run_recalc_bg(seller_id: str) -> None:
    """Background расчёт всех периодов для селлера.

    Лок уже взят в job_recalc_seller через try_acquire_recalc_lock RPC.
    Здесь только выполняем работу и фиксируем итог через mark_recalc_done/error.

    Состояние пишется в два места:
      - in-memory _running_recalcs[seller_id] — быстрый runtime status для этого процесса
      - БД recalc_jobs через RPC — история, выживает рестарт
    """
    progress: dict = {
        "phase": "starting", "processed": 0, "total": 0, "period_days": 30,
        "current_period_index": 0, "total_periods": 3,
    }
    started_iso = datetime.now(timezone.utc).isoformat()
    _running_recalcs[seller_id] = {
        "started_at": started_iso,
        "status": "running", "result": None, "error": None, "progress": progress,
    }

    try:
        result = recalc_seller_all_periods(seller_id, progress=progress)
        finished_iso = datetime.now(timezone.utc).isoformat()
        _running_recalcs[seller_id].update({
            "status": "done", "finished_at": finished_iso, "result": result,
        })
        _mark_recalc_done(seller_id, result)
        logger.info("recalc done (bg)", extra={
            "seller_id": seller_id,
            **{k: v for k, v in result.items() if isinstance(v, (int, float))},
        })
    except Exception as e:
        finished_iso = datetime.now(timezone.utc).isoformat()
        err = str(e)[:500]
        _running_recalcs[seller_id].update({
            "status": "error", "finished_at": finished_iso, "error": err,
        })
        _mark_recalc_error(seller_id, err)
        logger.exception("recalc failed (bg)", extra={"seller_id": seller_id})


@app.post("/jobs/recalc/{seller_id}", dependencies=[Depends(require_worker_secret)])
def job_recalc_seller(seller_id: str, background_tasks: BackgroundTasks, sync: bool = False) -> dict:
    _cleanup_old_recalcs()

    # Быстрый путь: этот процесс уже считает. БД-лок бы всё равно отклонил, но без RPC быстрее.
    existing = _running_recalcs.get(seller_id)
    if existing and existing.get("status") == "running":
        return {
            "started": False, "status": "running",
            "started_at": existing.get("started_at"),
            "message": "Расчёт уже идёт, дождитесь завершения",
        }

    # Атомарный БД-лок. Обрабатывает stale running (>1ч — перехват) сам.
    if not _try_acquire_recalc_lock(seller_id):
        db_state = _db_get_recalc_state(seller_id)
        return {
            "started": False, "status": "running",
            "started_at": db_state.get("started_at") if db_state else None,
            "message": "Расчёт уже идёт в другом процессе, дождитесь завершения",
        }

    if sync:
        # Sync режим: лок взят, выполняем напрямую и фиксируем результат.
        try:
            result = recalc_seller_all_periods(seller_id)
            _mark_recalc_done(seller_id, result)
            return result
        except Exception as e:
            _mark_recalc_error(seller_id, str(e)[:500])
            raise

    if _recalc_pool.active():
        # Ставим running-плейсхолдер сразу (до того как воркер-поток заберёт
        # задачу из очереди), чтобы /status и дедуп видели расчёт без гонки.
        _running_recalcs[seller_id] = {
            "started_at": datetime.now(timezone.utc).isoformat(),
            "status": "running", "result": None, "error": None,
            "progress": {"phase": "queued"},
        }
        _recalc_pool.enqueue(seller_id)
    else:
        background_tasks.add_task(_run_recalc_bg, seller_id)
    return {
        "started": True, "status": "running",
        "started_at": datetime.now(timezone.utc).isoformat(),
        "message": "Расчёт запущен в фоне, цифры появятся через несколько минут",
    }


@app.get("/jobs/recalc/{seller_id}/status", dependencies=[Depends(require_worker_secret)])
def job_recalc_status(seller_id: str) -> dict:
    """Сначала in-memory (свежий progress), потом БД (история), иначе idle."""
    state = _running_recalcs.get(seller_id)
    if state:
        return state
    db_state = _db_get_recalc_state(seller_id)
    if db_state:
        return db_state
    return {
        "status": "idle", "started_at": None,
        "finished_at": None, "result": None, "error": None, "progress": None,
    }


@app.post("/jobs/recalc-all", dependencies=[Depends(require_worker_secret)])
def job_recalc_all() -> dict:
    logger.info("recalc-all start")
    result = recalc_all_sellers()
    logger.info("recalc-all done", extra=result)
    return result


@app.post("/telegram/webhook")
async def telegram_webhook(request: Request, x_telegram_bot_api_secret_token: Optional[str] = Header(None)) -> dict:
    from app.telegram import send_message

    expected_secret = _os.environ.get("TELEGRAM_WEBHOOK_SECRET")
    if not expected_secret:
        raise HTTPException(500, "Server misconfigured: TELEGRAM_WEBHOOK_SECRET not set")
    if not x_telegram_bot_api_secret_token or not hmac.compare_digest(
        x_telegram_bot_api_secret_token, expected_secret
    ):
        raise HTTPException(403, "Forbidden")

    try:
        update = await request.json()
    except Exception:
        return {"ok": False}
    msg = update.get("message") or update.get("edited_message") or {}
    text = (msg.get("text") or "").strip()
    chat = msg.get("chat") or {}
    chat_id = str(chat.get("id") or "")
    if not chat_id or not text:
        return {"ok": True}
    if text.startswith("/start"):
        parts = text.split(maxsplit=1)
        # Привязываем ТОЛЬКО по подписанному токену (см. app.telegram_link).
        # Сырой UUID больше не принимаем — это закрывает hijack чужой привязки:
        # раньше любой, кто знал seller_id, мог перенаправить чужие уведомления
        # себе через /start <uuid>.
        seller_id = verify_telegram_link_token(parts[1].strip()) if len(parts) == 2 and parts[1] else None
        if seller_id:
            try:
                sb = get_supabase()
                # Single-use / anti-rebind: привязываем ТОЛЬКО если у селлера ещё НЕТ
                # привязанного чата (telegram_chat_id IS NULL). Токен сам по себе
                # stateless и реиграбелен 30 мин; этот фильтр не даёт перехваченной
                # deep-ссылке переключить уведомления АКТИВНОГО пользователя на чужой
                # чат (кража отчётов). Повтор тем же чатом — идемпотентный успех.
                # Перепривязка к новому чату — после авто-сброса telegram_chat_id при
                # «мёртвом» чате (clear_dead_telegram) или ручного отключения.
                res = sb.table("sellers").update({
                    "telegram_chat_id": chat_id, "notify_telegram": True,
                }).eq("id", seller_id).is_("telegram_chat_id", "null").execute()
                if res.data:
                    send_message(chat_id, "✅ <b>Telegram подключён!</b>\n\nТеперь вы будете получать ежедневный digest по важным уведомлениям.")
                    return {"ok": True, "linked": True}
                # 0 строк обновлено: у селлера уже есть привязанный чат. Различаем
                # «тот же чат» (идемпотентно ок) и «другой чат» (отказ — анти-hijack).
                cur = sb.table("sellers").select("telegram_chat_id").eq("id", seller_id).limit(1).execute()
                cur_chat = str((cur.data or [{}])[0].get("telegram_chat_id") or "") if cur.data else ""
                if cur_chat and cur_chat == chat_id:
                    send_message(chat_id, "✅ <b>Telegram уже подключён</b> к этому аккаунту.")
                    return {"ok": True, "linked": True}
                if cur_chat:
                    send_message(chat_id, "⚠️ К этому аккаунту уже подключён другой Telegram-чат. Отключите его в настройках Veloseller и подключите заново.")
                    return {"ok": True, "linked": False}
            except Exception:
                logger.exception("telegram linking failed", extra={"chat_id": chat_id})
        send_message(chat_id, "Привет! Я бот <b>Veloseller</b>. Чтобы подключить уведомления, откройте Veloseller и нажмите кнопку «Подключить Telegram» в настройках.")
        return {"ok": True, "linked": False}
    return {"ok": True}
