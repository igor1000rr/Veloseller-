"""Radar HTTP endpoints для worker'а.

Сейчас один endpoint:
  POST /radar/extract-brands — принимает прайс XLSX/CSV, вызывает
       brand_detector (частотный анализ), создаёт бренды в БД через
       radar_price_uploads + radar_brands.

Вызывается из /api/radar/upload (Next.js → Worker).
Аутентификация — X-Worker-Secret (как у /jobs/*).

29.05.2026: AI-парсинг (DeepSeek) заменён на простой частотный
анализ. Александр: это оверкилл для задачи которая решается
словарём стоп-слов и регуляркой.
"""
from __future__ import annotations

import logging
from datetime import datetime, timezone

from fastapi import APIRouter, File, Form, HTTPException, UploadFile

from app.db import get_supabase
from app.radar.brand_detector import detect_brands_from_price
from app.radar.price_parser import parse_price_file

logger = logging.getLogger("veloseller.worker.radar_api")

router = APIRouter(prefix="/radar", tags=["radar"])


@router.post("/extract-brands")
async def extract_brands(
    seller_id: str = Form(...),
    upload_id: str = Form(...),
    file: UploadFile = File(...),
) -> dict:
    """Извлечь бренды из прайса через частотный анализ.

    Workflow:
    1. Читаем файл (bytes) → parse_price_file → list[dict]
    2. detect_brands_from_price — частотный анализ без AI
    3. Обновляем radar_price_uploads (status, metrics)
    4. Создаём radar_brands (status=approved в пределах лимита тарифа)
    5. Остальные пишутся как excluded — в UI показываются в FOMO-тизере
    6. Возвращаем {brands_count, brands_approved}

    Идемпотентность: если upload уже processed (status=completed),
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

    # 2. Парсинг файла + частотный анализ
    file_bytes = await file.read()
    file_name = file.filename or "upload.xlsx"

    logger.info("radar.extract_brands start",
                extra={"seller_id": seller_id, "upload_id": upload_id,
                       "file_name": file_name, "size": len(file_bytes)})

    try:
        rows = parse_price_file(file_bytes, file_name)
    except Exception as e:
        logger.exception("price parse failed", extra={"upload_id": upload_id})
        try:
            sb.table("radar_price_uploads").update({
                "status": "failed",
                "error_message": f"Парсинг файла: {e}"[:500],
                "completed_at": datetime.now(timezone.utc).isoformat(),
            }).eq("id", upload_id).execute()
        except Exception:
            logger.exception("failed to mark upload as failed")
        raise HTTPException(400, f"Не удалось прочитать прайс: {e}")

    detection = detect_brands_from_price(rows, min_repetitions=3)

    if detection.error or not detection.brands:
        try:
            sb.table("radar_price_uploads").update({
                "status": "failed",
                "error_message": (detection.error or "Не найдено ни одного бренда с повторяемостью ≥3 раз")[:500],
                "rows_total": detection.rows_total,
                "completed_at": datetime.now(timezone.utc).isoformat(),
            }).eq("id", upload_id).execute()
        except Exception:
            logger.exception("failed to mark upload as failed")
        raise HTTPException(
            422,
            detection.error or "Не найдено ни одного бренда с повторяемостью ≥3. Проверьте что в прайсе есть названия товаров с латинскими брендами.",
        )

    # 3. Запись брендов в БД
    # Считаем сколько уже есть approved у селлера
    current_approved = (
        sb.table("radar_brands").select("id", count="exact", head=True)
        .eq("seller_id", seller_id).eq("status", "approved").execute()
    )
    current_approved_count = getattr(current_approved, "count", 0) or 0
    available_slots = max(0, brands_limit - current_approved_count)

    brands_inserted = 0
    brands_marked_excluded = 0
    for i, brand in enumerate(detection.brands):
        # До лимита — approved, остальные — excluded (FOMO-тизер в UI)
        status = "approved" if i < available_slots else "excluded"
        try:
            sb.table("radar_brands").upsert({
                "seller_id": seller_id,
                "name": brand.name,
                "name_normalized": brand.name_normalized,
                "source": "price",  # раньше было "ai", теперь это не AI
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

    # 4. Обновление upload — ai_provider теперь "internal", cost = 0
    try:
        sb.table("radar_price_uploads").update({
            "status": "completed",
            "rows_total": detection.rows_total,
            "ai_provider": "internal",
            "ai_model": "frequency-analyzer-v1",
            "ai_input_tokens": 0,
            "ai_output_tokens": 0,
            "ai_cost_usd": 0,
            "brands_extracted": len(detection.brands),
            "brands_approved": brands_inserted,
            "completed_at": datetime.now(timezone.utc).isoformat(),
        }).eq("id", upload_id).execute()
    except Exception:
        logger.exception("radar_price_uploads update failed", extra={"upload_id": upload_id})

    logger.info("radar.extract_brands done",
                extra={"seller_id": seller_id, "upload_id": upload_id,
                       "rows_total": detection.rows_total,
                       "rows_analyzed": detection.rows_analyzed,
                       "brands_total": len(detection.brands),
                       "brands_approved": brands_inserted,
                       "brands_excluded": brands_marked_excluded})

    return {
        "uploadId": upload_id,
        "status": "completed",
        "brandsExtracted": len(detection.brands),
        "brandsApproved": brands_inserted,
        "brandsExcluded": brands_marked_excluded,
        "rowsTotal": detection.rows_total,
        "rowsAnalyzed": detection.rows_analyzed,
        "aiCostUsd": 0,
    }


@router.post("/poll")
async def trigger_poll() -> dict:
    """Ручной триггер radar poller'а (только для отладки/админки).

    В production вызывается scheduler'ом раз в сутки. Доступ через
    X-Worker-Secret (обёрнут на уровне роутера в main.py).
    """
    from app.jobs.radar import poll_all_sellers
    return poll_all_sellers()
