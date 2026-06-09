"""Radar poller — основной worker-job для мониторинга новинок.

Что делает (Radar v2, 29.05.2026, план Александра):
  1. Для каждого селлера с активным radar_plan и approved-брендами:
     - Загружаем seller_models (один запрос на селлера в radar_price_models)
     - Для каждого approved-бренда, у которого last_wordstat_at старше N дней:
       a. Запрашивает Wordstat (через WordstatService — Yandex/XMLRiver+cache)
       b. Сохраняет history в radar_query_history
       c. Через wordstat_matcher.match_against_model_set сопоставляет фразы
          с моделями селлера:
            - model в прайсе → archived (селлер уже продаёт)
            - модели нет → new (новинка)
          Фильтр brand+model отсекает шумные фразы типа "dyson пылесос".
       d. Upsert в radar_queries

Логика статусов (упрощено vs v1):
  new:      Wordstat freq≥60, brand+model паттерн, модели НЕТ в прайсе селлера
  archived: то же что выше но модель уже есть в прайсе, ИЛИ
            автоархивация после 30 дней без активности, ИЛИ
            ручное действие пользователя
  watching: пользователь нажал звезду → is_favorite=true

Расписание:
  - Wordstat poll: каждые 3 дня для бренда (last_wordstat_at + 3 дня)
  - Запускается scheduler'ом раз в сутки в 06:00 UTC (= 09:00 МСК)

Что изменилось vs v1:
  - Убрали suggest WB/Ozon — Wordstat freq≥60 + matcher достаточно
  - Убрали статус 'early' — теперь только new/archived/watching
  - Убрали present_in_wb/present_in_ozon из payload (поля остаются в БД
    nullable для backward compat и возможной англоязычной версии)
"""
from __future__ import annotations

import logging
from datetime import date, datetime, timedelta, timezone
from typing import Any

from app.db import fetch_all, get_supabase
from app.radar.wordstat_matcher import (
    DEFAULT_MIN_FREQUENCY,
    match_against_model_set,
)
from app.radar.wordstat_provider import WordstatService

logger = logging.getLogger("veloseller.radar.poller")

# Минимальный интервал между Wordstat-запросами одного бренда (часов)
_WORDSTAT_POLL_INTERVAL_HOURS = 72  # 3 дня

# Сколько уточнений с одного бренда сохраняем после фильтра brand+model
_MAX_QUERIES_PER_BRAND = 30

# Автоархивация: если запрос не обновлялся N дней — переводим в archived
_AUTO_ARCHIVE_DAYS = 30


def _seller_eligible_for_radar(seller_row: dict) -> bool:
    """Проверяет что у селлера активный платный/trial Radar."""
    plan = seller_row.get("radar_plan") or "none"
    if plan == "none":
        return False
    active_until = seller_row.get("radar_active_until")
    if active_until:
        try:
            until = datetime.fromisoformat(active_until.replace("Z", "+00:00"))
            if until < datetime.now(timezone.utc):
                return False
        except Exception:
            pass
    return True


def _brand_needs_polling(brand: dict) -> bool:
    """Решает нужно ли дёргать Wordstat для этого бренда сейчас."""
    last = brand.get("last_wordstat_at")
    if not last:
        return True
    try:
        last_dt = datetime.fromisoformat(last.replace("Z", "+00:00"))
    except Exception:
        return True
    return (datetime.now(timezone.utc) - last_dt) >= timedelta(hours=_WORDSTAT_POLL_INTERVAL_HOURS)


def _load_seller_models(sb, seller_id: str) -> set[str]:
    """Загружает все модели селлера из radar_price_models в set.

    Используется matcher'ом для O(1) проверки наличия model в прайсе.
    Один SELECT на селлера независимо от количества брендов.
    """
    try:
        rows = fetch_all(
            sb.table("radar_price_models")
            .select("model_token")
            .eq("seller_id", seller_id)
        )
        return {r["model_token"] for r in rows if r.get("model_token")}
    except Exception:
        logger.exception("radar.poll: не удалось загрузить модели селлера %s", seller_id)
        return set()


def _decide_status_for_matched(
    matched_status: str,
    current_status: str | None,
    is_favorite: bool,
) -> str:
    """Решает финальный status для записи в radar_queries.

    Пользовательские статусы (выставленные вручную) не перетираются:
    - watching/is_favorite=true — оставляем
    - archived вручную — оставляем
    Auto-статус из matcher применяется только если запись новая или
    в "natural" статусе.
    """
    if current_status == "watching" and is_favorite:
        return "watching"
    if current_status == "archived":
        # Если matcher теперь говорит archived (модель появилась в прайсе) —
        # подтверждаем; если new — оставляем archived (пользователь убрал
        # сознательно)
        return "archived"
    return matched_status  # "new" или "archived" из matcher'а


def poll_brand(
    sb,
    seller_id: str,
    brand: dict,
    wordstat: WordstatService,
    seller_models: set[str],
) -> dict[str, int]:
    """Обрабатывает один бренд.

    Возвращает метрики: {queries_processed, new_queries, matched_to_archived}.
    """
    brand_id = brand["id"]
    brand_name = brand["name"]
    metrics = {
        "queries_processed": 0,
        "new_queries": 0,
        "matched_to_archived": 0,
    }

    # 1. Wordstat: частота + до 50 уточнений + история (для бренда)
    result = wordstat.fetch(brand_name, with_history=True)
    if result is None:
        logger.warning("radar.poll: wordstat не вернул данных для %r (seller=%s)",
                       brand_name, seller_id)
        return metrics

    # Обновляем last_wordstat_at — даже если ничего нового, чтобы не дёргать
    # снова через минуту.
    try:
        sb.table("radar_brands").update({
            "last_wordstat_at": datetime.now(timezone.utc).isoformat(),
        }).eq("id", brand_id).execute()
    except Exception:
        logger.exception("radar.poll: не удалось обновить last_wordstat_at для бренда %s", brand_id)

    # 2. Преобразуем related в формат для matcher'а
    wordstat_phrases = [
        {"phrase": r.text, "frequency": r.frequency}
        for r in result.related
    ]

    # 3. Matcher: фильтр brand+model + сопоставление с seller_models
    matched = match_against_model_set(
        brand_name, wordstat_phrases, seller_models,
        min_frequency=DEFAULT_MIN_FREQUENCY,
    )
    # Сортируем по frequency убыванию (самые востребованные первыми)
    matched.sort(key=lambda m: m.frequency, reverse=True)
    matched = matched[:_MAX_QUERIES_PER_BRAND]

    # 4. Upsert каждой matched фразы в radar_queries
    now_iso = datetime.now(timezone.utc).isoformat()
    for mq in matched:
        try:
            existing = (
                sb.table("radar_queries")
                .select("id,status,is_favorite,current_frequency")
                .eq("seller_id", seller_id)
                .eq("brand_id", brand_id)
                .eq("query_normalized", mq.phrase.lower().strip())
                .limit(1)
                .execute()
            )
            existing_row = existing.data[0] if existing.data else None

            old_status = existing_row["status"] if existing_row else None
            is_favorite = bool(existing_row.get("is_favorite", False)) if existing_row else False
            new_status = _decide_status_for_matched(mq.status, old_status, is_favorite)

            old_freq = int(existing_row.get("current_frequency", 0) or 0) if existing_row else 0
            trend_pct = None
            if old_freq > 0:
                trend_pct = round((mq.frequency - old_freq) / old_freq * 100, 1)

            payload = {
                "seller_id": seller_id,
                "brand_id": brand_id,
                "query_text": mq.phrase,
                "query_normalized": mq.phrase.lower().strip(),
                "current_frequency": mq.frequency,
                "trend_pct": trend_pct,
                # present_in_wb/ozon оставлены NULL — не используем suggest в v2
                "status": new_status,
                "last_updated_at": now_iso,
            }

            if existing_row:
                sb.table("radar_queries").update(payload).eq("id", existing_row["id"]).execute()
                if new_status == "archived" and old_status != "archived":
                    metrics["matched_to_archived"] += 1
            else:
                payload["first_seen_at"] = now_iso
                sb.table("radar_queries").insert(payload).execute()
                metrics["new_queries"] += 1
                if new_status == "archived":
                    metrics["matched_to_archived"] += 1

            metrics["queries_processed"] += 1
        except Exception:
            logger.exception("radar.poll: ошибка для запроса %r бренда %r",
                             mq.phrase, brand_name)

    # 5. История бренда → radar_query_history
    if result.history:
        try:
            parent = (
                sb.table("radar_queries")
                .select("id")
                .eq("seller_id", seller_id)
                .eq("brand_id", brand_id)
                .eq("query_normalized", brand_name.lower().strip())
                .limit(1)
                .execute()
            )
            parent_id = parent.data["id"] if parent.data else None
            if parent_id:
                for point in result.history:
                    sb.table("radar_query_history").upsert({
                        "query_id": parent_id,
                        "period_year": point.year,
                        "period_month": point.month,
                        "frequency": point.frequency,
                        "captured_at": now_iso,
                    }, on_conflict="query_id,period_year,period_month").execute()
        except Exception:
            logger.warning("radar.poll: не удалось записать history для %r", brand_name)

    return metrics


def auto_archive_stale_queries(sb, seller_id: str) -> int:
    """Перемещает в archived запросы которые не обновлялись N дней.

    Не трогает is_favorite=true (это сознательное «наблюдение»).
    """
    cutoff = (datetime.now(timezone.utc) - timedelta(days=_AUTO_ARCHIVE_DAYS)).isoformat()
    try:
        result = (
            sb.table("radar_queries")
            .update({"status": "archived"})
            .eq("seller_id", seller_id)
            .neq("status", "archived")
            .eq("is_favorite", False)
            .lt("last_updated_at", cutoff)
            .execute()
        )
        return len(result.data or [])
    except Exception:
        logger.exception("radar.auto_archive failed for seller %s", seller_id)
        return 0


def poll_all_sellers() -> dict[str, Any]:
    """Главная точка входа scheduler'а.

    Перебирает всех селлеров с активным Radar и опрашивает их бренды.
    """
    sb = get_supabase()
    wordstat = WordstatService()

    sellers = fetch_all(
        sb.table("sellers")
        .select("id,email,radar_plan,radar_active_until,radar_brands_limit")
        .neq("radar_plan", "none")
    )

    total_brands_polled = 0
    total_queries_processed = 0
    total_new_queries = 0
    total_matched_to_archived = 0
    total_archived = 0
    sellers_processed = 0

    for seller in sellers:
        if not _seller_eligible_for_radar(seller):
            continue

        sellers_processed += 1
        seller_id = seller["id"]

        # Загружаем seller_models один раз — переиспользуем для всех брендов
        seller_models = _load_seller_models(sb, seller_id)
        if not seller_models:
            logger.info(
                "radar.poll: у селлера %s нет моделей в radar_price_models — "
                "все Wordstat фразы будут как new (надо загрузить прайс)",
                seller_id,
            )

        try:
            brands = fetch_all(
                sb.table("radar_brands")
                .select("*")
                .eq("seller_id", seller_id)
                .eq("status", "approved")
            )
        except Exception:
            logger.exception("radar.poll: не удалось получить бренды для %s", seller_id)
            continue

        for brand in brands:
            if not _brand_needs_polling(brand):
                continue
            try:
                m = poll_brand(sb, seller_id, brand, wordstat, seller_models)
                total_brands_polled += 1
                total_queries_processed += m["queries_processed"]
                total_new_queries += m["new_queries"]
                total_matched_to_archived += m["matched_to_archived"]
                logger.info(
                    "radar.poll: brand=%r queries=%d new=%d archived=%d",
                    brand["name"], m["queries_processed"], m["new_queries"],
                    m["matched_to_archived"],
                )
            except Exception:
                logger.exception(
                    "radar.poll: ошибка обработки бренда %r (seller=%s)",
                    brand.get("name"), seller_id,
                )

        archived = auto_archive_stale_queries(sb, seller_id)
        total_archived += archived

    summary = {
        "sellers_processed": sellers_processed,
        "brands_polled": total_brands_polled,
        "queries_processed": total_queries_processed,
        "new_queries": total_new_queries,
        "matched_to_archived": total_matched_to_archived,
        "auto_archived": total_archived,
    }
    logger.info("radar.poll_all_sellers done: %s", summary)
    return summary
