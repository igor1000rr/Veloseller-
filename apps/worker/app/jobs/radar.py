"""Radar poller — основной worker-job для мониторинга новинок.

Что делает:
  1. Для каждого селлера с активным radar_plan и approved-брендами:
     - Для каждого approved-бренда, у которого last_wordstat_at старше N дней:
       a. Запрашивает Wordstat (через WordstatService — Yandex/XMLRiver+cache)
       b. Сохраняет history в radar_query_history
       c. Для каждого уточнения (related query):
          - Проверяет WB/OZON suggest (check_suggest_cached)
          - Решает статус: early / new / watching / archived
          - Upsert в radar_queries

Логика статусов:
  early:    Wordstat показывает рост, но НЕ в suggest ни в одном маркетплейсе
  new:      Wordstat показывает рост И есть в WB или OZON (или обоих)
  watching: пользователь нажал звезду → is_favorite=true
  archived: пользователь убрал в архив вручную, ИЛИ автоархивация после 30 дней
            без активности

Расписание:
  - Wordstat poll: каждые 3 дня для бренда (last_wordstat_at + 3 дня)
  - Suggest poll: каждый день (но кэш 1 день, так что повторные вызовы дёшевы)
  - Запускается scheduler'ом раз в сутки в 06:00 UTC (= 09:00 МСК)

Логирование: каждый бренд — отдельная строка в логах с метриками
(сколько запросов, сколько новых, сколько повышений до 'new').
"""
from __future__ import annotations

import logging
from datetime import date, datetime, timedelta, timezone
from typing import Any, Optional

from app.db import fetch_all, get_supabase
from app.radar.suggest_provider import check_suggest_cached
from app.radar.wordstat_provider import WordstatService

logger = logging.getLogger("veloseller.radar.poller")

# Минимальный интервал между Wordstat-запросами одного бренда (часов)
_WORDSTAT_POLL_INTERVAL_HOURS = 72  # 3 дня

# Минимальная частота запроса чтобы вообще сохранять (отсекаем мусор)
_MIN_FREQUENCY_TO_TRACK = 50

# Сколько уточнений с одного бренда сохраняем (top по частоте)
_MAX_RELATED_PER_BRAND = 30

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


def _decide_status(present_in_wb: bool, present_in_ozon: bool,
                   current_status: str, is_favorite: bool) -> str:
    """Решает в какой статус положить запрос на основе suggest-сигналов.

    Не меняет watching/archived если пользователь их выставил вручную.
    Auto-промоушн: early → new, как только появилось в любом маркетплейсе.
    """
    # Пользовательские статусы (выставленные вручную) не трогаем
    if current_status == "watching" and is_favorite:
        return "watching"
    if current_status == "archived":
        return "archived"

    # Авто-логика:
    if present_in_wb or present_in_ozon:
        return "new"  # подтверждение спроса → реальный сигнал
    return "early"   # только Wordstat, ещё не в магазинах


def poll_brand(
    sb,
    seller_id: str,
    brand: dict,
    wordstat: WordstatService,
) -> dict[str, int]:
    """Обрабатывает один бренд.

    Возвращает метрики: {queries_processed, new_queries, promoted_to_new}.
    """
    brand_id = brand["id"]
    brand_name = brand["name"]
    metrics = {"queries_processed": 0, "new_queries": 0, "promoted_to_new": 0}

    # 1. Wordstat: частота + до 50 уточнений + история (для бренда)
    result = wordstat.fetch(brand_name, with_history=True)
    if result is None:
        logger.warning("radar.poll: wordstat не вернул данных для %r (seller=%s)",
                       brand_name, seller_id)
        return metrics

    # Обновляем last_wordstat_at сразу — даже если ничего нового, чтобы не
    # дёргать снова через минуту.
    try:
        sb.table("radar_brands").update({
            "last_wordstat_at": datetime.now(timezone.utc).isoformat(),
        }).eq("id", brand_id).execute()
    except Exception:
        logger.exception("radar.poll: не удалось обновить last_wordstat_at для бренда %s", brand_id)

    # 2. Отбираем top-N уточнений
    related_sorted = sorted(result.related, key=lambda r: r.frequency, reverse=True)
    significant = [r for r in related_sorted if r.frequency >= _MIN_FREQUENCY_TO_TRACK]
    significant = significant[:_MAX_RELATED_PER_BRAND]

    # 3. Для каждого уточнения — suggest проверка + upsert
    for rel in significant:
        try:
            present_in_wb, present_in_ozon = check_suggest_cached(rel.text)

            # Существующий запрос?
            existing = (
                sb.table("radar_queries")
                .select("id,status,is_favorite,current_frequency")
                .eq("seller_id", seller_id)
                .eq("brand_id", brand_id)
                .eq("query_normalized", rel.text.lower().strip())
                .maybeSingle()
                .execute()
            )
            existing_row = existing.data

            old_status = existing_row["status"] if existing_row else "early"
            is_favorite = bool(existing_row.get("is_favorite", False)) if existing_row else False
            new_status = _decide_status(present_in_wb, present_in_ozon, old_status, is_favorite)

            old_freq = int(existing_row.get("current_frequency", 0) or 0) if existing_row else 0
            trend_pct = None
            if old_freq > 0:
                trend_pct = round((rel.frequency - old_freq) / old_freq * 100, 1)

            payload = {
                "seller_id": seller_id,
                "brand_id": brand_id,
                "query_text": rel.text,
                "query_normalized": rel.text.lower().strip(),
                "current_frequency": rel.frequency,
                "trend_pct": trend_pct,
                "present_in_wb": present_in_wb,
                "present_in_ozon": present_in_ozon,
                "suggest_checked_at": datetime.now(timezone.utc).isoformat(),
                "status": new_status,
                "last_updated_at": datetime.now(timezone.utc).isoformat(),
            }

            if existing_row:
                sb.table("radar_queries").update(payload).eq("id", existing_row["id"]).execute()
                if old_status == "early" and new_status == "new":
                    metrics["promoted_to_new"] += 1
            else:
                payload["first_seen_at"] = datetime.now(timezone.utc).isoformat()
                sb.table("radar_queries").insert(payload).execute()
                metrics["new_queries"] += 1
                if new_status == "new":
                    metrics["promoted_to_new"] += 1

            metrics["queries_processed"] += 1
        except Exception:
            logger.exception("radar.poll: ошибка для запроса %r бренда %r",
                             rel.text, brand_name)

    # 4. История бренда → radar_query_history (только для базовой фразы)
    # Историю сохраняем по brand_name, для UI график трендов бренда
    # NOTE: query_history привязан к query_id, но истории конкретно по
    # query_text от Wordstat мы не получаем (только по запросу к API на
    # тот же phrase). Поэтому history записываем для основной фразы бренда —
    # его представительный query, если есть.
    if result.history:
        try:
            # Пишем историю как привязанную к "родительскому" запросу = brand_name
            parent = (
                sb.table("radar_queries")
                .select("id")
                .eq("seller_id", seller_id)
                .eq("brand_id", brand_id)
                .eq("query_normalized", brand_name.lower().strip())
                .maybeSingle()
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
                        "captured_at": datetime.now(timezone.utc).isoformat(),
                    }, on_conflict="query_id,period_year,period_month").execute()
        except Exception:
            logger.warning("radar.poll: не удалось записать history для %r", brand_name)

    return metrics


def auto_archive_stale_queries(sb, seller_id: str) -> int:
    """Перемещает в archived запросы которые не обновлялись N дней.

    Не трогает is_favorite=true (это сознательное "наблюдение").
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
    total_promoted = 0
    total_archived = 0
    sellers_processed = 0

    for seller in sellers:
        if not _seller_eligible_for_radar(seller):
            continue

        sellers_processed += 1
        seller_id = seller["id"]

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
                m = poll_brand(sb, seller_id, brand, wordstat)
                total_brands_polled += 1
                total_queries_processed += m["queries_processed"]
                total_new_queries += m["new_queries"]
                total_promoted += m["promoted_to_new"]
                logger.info(
                    "radar.poll: brand=%r queries=%d new=%d promoted=%d",
                    brand["name"], m["queries_processed"], m["new_queries"], m["promoted_to_new"],
                )
            except Exception:
                logger.exception(
                    "radar.poll: ошибка обработки бренда %r (seller=%s)",
                    brand.get("name"), seller_id,
                )

        # Auto-archive в конце обработки селлера
        archived = auto_archive_stale_queries(sb, seller_id)
        total_archived += archived

    summary = {
        "sellers_processed": sellers_processed,
        "brands_polled": total_brands_polled,
        "queries_processed": total_queries_processed,
        "new_queries": total_new_queries,
        "promoted_to_new": total_promoted,
        "auto_archived": total_archived,
    }
    logger.info("radar.poll_all_sellers done: %s", summary)
    return summary
