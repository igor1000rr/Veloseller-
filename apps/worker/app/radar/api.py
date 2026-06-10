"""Radar HTTP endpoints для worker'а.

Сейчас один endpoint:
  POST /radar/extract-brands — принимает прайс XLSX/CSV, вызывает
       brand_detector (частотный анализ), создаёт бренды в БД через
       radar_price_uploads + radar_brands, и заодно сохраняет модели
       в radar_price_models для будущего сопоставления с Wordstat.

Вызывается из /api/radar/upload (Next.js → Worker).
Аутентификация — X-Worker-Secret (как у /jobs/*).

29.05.2026: AI-парсинг (DeepSeek) заменён на простой частотный
анализ. Александр: это оверкилл для задачи которая решается
словарём стоп-слов и регуляркой. Также теперь при upload'е
сохраняются модели прайса (V11, GBH2-26 и т.п.) в radar_price_models
для wordstat_matcher.
"""
from __future__ import annotations

import logging
from datetime import datetime, timezone

from fastapi import APIRouter, File, Form, HTTPException, UploadFile

from app.db import get_supabase
from app.radar.brand_detector import (
    detect_brands_from_price,
    detect_models_from_price,
)
from app.radar.price_parser import parse_price_file

logger = logging.getLogger("veloseller.worker.radar_api")

router = APIRouter(prefix="/radar", tags=["radar"])


def _save_seller_models(sb, seller_id: str, models: set[str]) -> int:
    """Сохраняет модели селлера в radar_price_models с upsert.

    Старые модели не удаляются — last_seen_at просто не обновляется для
    моделей которых нет в новом прайсе. Это нужно чтобы между upload'ами
    селлер не потерял отслеживание моделей которые он временно вывел из
    прайса (например распродажа).

    Если потребуется ручная чистка — будет миграция/задача отдельно.
    """
    if not models:
        return 0
    now = datetime.now(timezone.utc).isoformat()
    rows = [
        {
            "seller_id": seller_id,
            "model_token": model,
            "last_seen_at": now,
        }
        for model in models
    ]
    try:
        sb.table("radar_price_models").upsert(
            rows, on_conflict="seller_id,model_token"
        ).execute()
        return len(rows)
    except Exception:
        logger.exception("radar_price_models upsert failed", extra={"seller_id": seller_id})
        return 0


@router.post("/extract-brands")
async def extract_brands(
    seller_id: str = Form(...),
    upload_id: str = Form(...),
    file: UploadFile = File(...),
) -> dict:
    """Извлечь бренды И модели из прайса через частотный анализ.

    Workflow:
    1. Читаем файл (bytes) → parse_price_file → list[dict]
    2. detect_brands_from_price — частотный анализ без AI
    3. detect_models_from_price — извлечение моделей (V11, GBH2-26)
    4. Сохраняем модели в radar_price_models (для wordstat_matcher)
    5. Обновляем radar_price_uploads (status, metrics)
    6. Создаём radar_brands — ВСЕ извлечённые как excluded (на ревью).
       Пользователь сам восстановит нужные; лимит проверяется при восстановлении.
    7. Возвращаем {brands_count, brands_approved, models_saved}

    Идемпотентность: если upload уже processed (status=completed),
    повторный вызов вернёт текущий результат без перерасчёта.
    """
    sb = get_supabase()

    # 0. Проверка лимита тарифа
    seller_res = (
        sb.table("sellers")
        .select("radar_plan,radar_brands_limit,radar_active_until")
        .eq("id", seller_id)
        .limit(1)
        .execute()
    )
    seller = seller_res.data[0] if seller_res.data else None
    if not seller:
        raise HTTPException(404, "Seller not found")
    plan = (seller.get("radar_plan") or "none")
    if plan == "none":
        raise HTTPException(403, "Radar plan not active")
    brands_limit = int(seller.get("radar_brands_limit") or 0)

    # 1. Идемпотентность
    upload_res = (
        sb.table("radar_price_uploads").select("*").eq("id", upload_id)
        .eq("seller_id", seller_id).limit(1).execute()
    )
    upload = upload_res.data[0] if upload_res.data else None
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

    # 2. Парсинг файла
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

    # 3. Частотный анализ + извлечение моделей за один проход по rows
    detection = detect_brands_from_price(rows, min_repetitions=3)
    models = detect_models_from_price(rows)

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

    # 4. Сохраняем модели в radar_price_models (для wordstat_matcher)
    models_saved = _save_seller_models(sb, seller_id, models)
    logger.info("radar.models_saved", extra={
        "seller_id": seller_id,
        "models_count": models_saved,
        "sample": list(models)[:5],
    })

    # 5. Запись брендов в БД — ВСЕ извлечённые попадают в excluded (на ревью).
    # Пользователь сам восстановит те, что хочет отслеживать (правка Александра:
    # ИИ неидеален, финальный отбор за человеком). Лимит тарифа проверяется при
    # восстановлении бренда в approved, а не здесь.
    brands_inserted = 0
    brands_marked_excluded = 0
    for brand in detection.brands:
        try:
            sb.table("radar_brands").upsert({
                "seller_id": seller_id,
                "name": brand.name,
                "name_normalized": brand.name_normalized,
                "source": "price",
                "status": "excluded",
                "sku_count": brand.sku_count,
            }, on_conflict="seller_id,name_normalized").execute()
            brands_marked_excluded += 1
        except Exception:
            logger.exception("radar_brands upsert failed",
                             extra={"seller_id": seller_id, "brand": brand.name})

    # 6. Обновление upload
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
                       "brands_excluded": brands_marked_excluded,
                       "models_saved": models_saved})

    return {
        "uploadId": upload_id,
        "status": "completed",
        "brandsExtracted": len(detection.brands),
        "brandsApproved": brands_inserted,
        "brandsExcluded": brands_marked_excluded,
        "modelsSaved": models_saved,
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
