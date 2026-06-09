"""CLI запуск бэкдейт-пересчёта истории метрик.

Наполняет временной ряд tvelo_metrics задним числом по уже имеющимся снапшотам,
чтобы графики Динамики (/dashboard/dynamics) не были пустыми. Алерты, changelog,
события и агрегаты склада НЕ трогаются. Снапшоты берутся только до каждой as_of.

Запуск на VPS из каталога воркера (с окружением воркера — SUPABASE_* из .env):
    cd /opt/veloseller/apps/worker
    python -m app.jobs.backfill_history --days 90
    python -m app.jobs.backfill_history --days 30 --seller <seller_id>
    python -m app.jobs.backfill_history --days 90 --periods 7,30,90

Долго (полный пересчёт за каждый день) — запускать в фоне:
    nohup python -m app.jobs.backfill_history --days 90 > /tmp/backfill.log 2>&1 &
"""
from __future__ import annotations

import argparse
import logging

from app.jobs.recalc import run_history_backfill


def main() -> None:
    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s %(levelname)s %(name)s %(message)s",
    )
    parser = argparse.ArgumentParser(description="Бэкдейт-пересчёт истории метрик")
    parser.add_argument("--days", type=int, default=90,
                        help="на сколько дней назад восстанавливать (по умолчанию 90)")
    parser.add_argument("--periods", type=str, default="7,30,90",
                        help="периоды метрик через запятую (по умолчанию 7,30,90)")
    parser.add_argument("--seller", type=str, default=None,
                        help="ограничить одним seller_id (по умолчанию все)")
    args = parser.parse_args()

    periods = tuple(int(x) for x in args.periods.split(",") if x.strip())
    result = run_history_backfill(
        days_back=args.days, periods=periods, only_seller=args.seller
    )
    print("Готово:", result)


if __name__ == "__main__":
    main()
