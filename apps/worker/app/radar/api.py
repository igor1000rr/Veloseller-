"""Radar HTTP endpoints для worker'а.

Сейчас один endpoint:
  POST /radar/extract-brands — принимает прайс XLSX/CSV, вызывает OpenRouter,
       создаёт бренды в БД через radar_price_uploads + radar_brands.

Вызывается из /api/radar/upload (Next.js → Worker).
Аутентификация — X-Worker-Secret (как у /jobs/*).

Решение делать через worker (а не Node.js):
  - openpyxl уже в зависимостях worker'а
  - не нужен xlsx-parser в Node
  - тяжёлая AI-обработка асинхронная, не блокирует UI
  - retry/backoff на стороне worker'а удобнее централизованно
"""
from __future__ import annotations

import logging
from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile

from app.db import get_supabase
from app.radar.brand_extractor import extract_brands_from_price

logger = logging.getLogger("veloseller.worker.radar_api")

router = APIRouter(prefix="/radar", tags=["radar"])


@router.post("/extract-brands")
async def extract_brands(
    seller_id: str = Form(...),
    upload_id: str = Form(...),
    file: UploadFile = File(...),
) -> dict:
    """Извлечь бренды из прайса.

    Workflow:
    1. Читаем файл (bytes)
    2. extract_brands_from_price → AI делает работу
    3. Обновляем radar_price_uploads (status, metrics)
    4. Создаём radar_brands (status=approved) — пользователь потом может
       исключить ненужные
    5. Возвращаем {brands_count, brands_approved, ai_cost_usd}

    Лимит брендов уважается: если у селлера тариф на 10 брендов и AI
    нашёл 25 — записываем только топ-10 по sku_count. Остальные пишутся
    как excluded (пользователь может перевести в approved вручную).

    Идемпотентность: если этот upload уже processed (status=completed),
    повторный вызов вернёт текущий результат без перерасчёта.
    """
    sb = get_supabase()

    # 0. Проверка лимита тарифа
    seller_res = (
        sb.table("sellers")
        .select("radar_plan,radar_brands_limit,radar_active_until")
        .eq("id", seller_id)
        .maybeSingle()
        .execute()
    )
    seller = seller_res.data
    if not seller:
        raise HTTPException(404, "Seller not found")
    plan = (seller.get("radar_plan") or "none")
    if plan == "none":
        raise HTTPException(403, "Radar plan not active")
    brands_limit = int(seller.get("radar_brands_limit") or 0)

    # 1. Идемпотентность
    upload_res = (
        sb.table("radar_price_uploads").select("*").eq("id", upload_id)
        .eq("seller_id", seller_id).maybeSingle().execute()
    )
    upload = upload_res.data
    if not upload:
        raise HTTPException(404, "Upload not found")
    if upload.get("status") == "completed":
        return {
            "uploadId": upload_id,
            "status": "completed",
            "brandsExtracted": upload.get("brands_extracted", 0),
            "brandsApproved": upload.get("brands_approved", 0),
            "message": "Уже обработано ранее",
        }

    # 2. Извлечение брендов через AI
    file_bytes = await file.read()
    file_name = file.filename or "upload.xlsx"

    logger.info("radar.extract_brands start",
                extra={"seller_id": seller_id, "upload_id": upload_id,
                       "file_name": file_name, "size": len(file_bytes)})

    result = extract_brands_from_price(file_bytes, file_name)

    # 3. Подсчёт rows_total для записи в upload (даже если AI упал)
    try:
        from app.radar.brand_extractor import parse_price_file
        rows = parse_price_file(file_bytes, file_name)
        rows_total = len(rows)
    except Exception:
        rows_total = 0

    if result.error:
        # AI упал — отмечаем failed
        try:
            sb.table("radar_price_uploads").update({
                "status": "failed",
                "error_message": result.error[:500],
                "rows_total": rows_total,
                "completed_at": datetime.now(timezone.utc).isoformat(),
            }).eq("id", upload_id).execute()
        except Exception:
            logger.exception("failed to mark upload as failed", extra={"upload_id": upload_id})
        logger.warning("radar.extract_brands AI failed: %s", result.error,
                       extra={"seller_id": seller_id, "upload_id": upload_id})
        raise HTTPException(500, f"AI extraction failed: {result.error}")

    # 4. Запись брендов
    # Считаем сколько уже есть approved у селлера
    current_approved = (
        sb.table("radar_brands").select("id", count="exact", head=True)
        .eq("seller_id", seller_id).eq("status", "approved").execute()
    )
    current_approved_count = getattr(current_approved, "count", 0) or 0
    available_slots = max(0, brands_limit - current_approved_count)

    brands_inserted = 0
    brands_marked_excluded = 0
    for i, brand in enumerate(result.brands):
        normalized = brand.name.lower().strip()
        # Если уже есть в БД — пропускаем (upsert обновит sku_count)
        status = "approved" if i < available_slots else "excluded"
        try:
            sb.table("radar_brands").upsert({
                "seller_id": seller_id,
                "name": brand.name,
                "name_normalized": normalized,
                "source": "ai",
                "status": status,
                "sku_count": brand.sku_count,
            }, on_conflict="seller_id,name_normalized").execute()
            if status == "approved":
                brands_inserted += 1
            else:
                brands_marked_excluded += 1
        except Exception:
            logger.exception("radar_brands upsert failed",
                             extra={"seller_id": seller_id, "brand": brand.name})

    # 5. Обновление upload
    try:
        sb.table("radar_price_uploads").update({
            "status": "completed",
            "rows_total": rows_total,
            "ai_provider": "openrouter",
            "ai_model": result.ai_model,
            "ai_input_tokens": result.ai_input_tokens,
            "ai_output_tokens": result.ai_output_tokens,
            "ai_cost_usd": round(result.ai_cost_usd, 6),
            "brands_extracted": len(result.brands),
            "brands_approved": brands_inserted,
            "completed_at": datetime.now(timezone.utc).isoformat(),
        }).eq("id", upload_id).execute()
    except Exception:
        logger.exception("radar_price_uploads update failed", extra={"upload_id": upload_id})

    logger.info("radar.extract_brands done",
                extra={"seller_id": seller_id, "upload_id": upload_id,
                       "ai_model": result.ai_model,
                       "tokens_in": result.ai_input_tokens,
                       "tokens_out": result.ai_output_tokens,
                       "cost_usd": result.ai_cost_usd,
                       "brands_total": len(result.brands),
                       "brands_approved": brands_inserted,
                       "brands_excluded": brands_marked_excluded})

    return {
        "uploadId": upload_id,
        "status": "completed",
        "brandsExtracted": len(result.brands),
        "brandsApproved": brands_inserted,
        "brandsExcluded": brands_marked_excluded,
        "aiCostUsd": round(result.ai_cost_usd, 4),
        "rowsTotal": rows_total,
    }


@router.post("/poll")
async def trigger_poll() -> dict:
    """Ручной триггер radar poller'а (только для отладки/админки).

    В production вызывается scheduler'ом раз в сутки. Доступ через
    X-Worker-Secret (обёрнут на уровне роутера в main.py).
    """
    from app.jobs.radar import poll_all_sellers
    return poll_all_sellers()
