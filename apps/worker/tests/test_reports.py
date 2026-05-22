"""Тесты apps/worker/app/jobs/reports.py — диспетчер Excel-отчётов.

Покрытие: _build_xlsx (Excel-генерация), _build_telegram_caption (HTML caption),
dispatch_daily_reports (smoke + idempotency).
"""
from __future__ import annotations

import io
from unittest.mock import MagicMock, patch

import pytest


# ─── _build_xlsx ──────────────────────────────────────────────────────────────

class TestBuildXlsx:
    def test_returns_valid_zip_bytes(self):
        """XLSX = ZIP. Магическое число PK\\x03\\x04 в начале."""
        from app.jobs.reports import _build_xlsx
        result = _build_xlsx({"low_stock": [
            {"coverage_days": 3, "current_stock": 10, "adjusted_velocity": 2.5,
             "products": {"sku": "SKU-1", "product_name": "Товар 1"}},
        ]}, currency="RUB")
        assert isinstance(result, bytes)
        assert result[:2] == b"PK"
        assert len(result) > 500

    def test_skips_empty_kinds(self):
        """Пустые списки → лист не создаётся. Если ВСЕ пустые → лист 'Пусто'."""
        from openpyxl import load_workbook
        from app.jobs.reports import _build_xlsx

        result = _build_xlsx({"low_stock": [], "dead_inventory": []}, currency="RUB")
        wb = load_workbook(io.BytesIO(result))
        assert wb.sheetnames == ["Пусто"]

    def test_multiple_kinds_become_separate_sheets(self):
        """Несколько kinds → несколько листов, порядок стабильный (priority list)."""
        from openpyxl import load_workbook
        from app.jobs.reports import _build_xlsx

        rows_low = [{"coverage_days": 5, "current_stock": 20, "adjusted_velocity": 1.0,
                     "products": {"sku": "A", "product_name": "Товар A"}}]
        rows_dead = [{"coverage_days": 200, "adjusted_velocity": 0.1,
                      "frozen_inventory_value": 50000,
                      "products": {"sku": "B", "product_name": "Товар B"}}]

        result = _build_xlsx({
            "dead_inventory": rows_dead,
            "low_stock": rows_low,
        }, currency="RUB")
        wb = load_workbook(io.BytesIO(result))
        # Priority order: critical_stock, low_stock, repeated_stockout, ...
        # → low_stock первый, dead_inventory позже
        assert "Низкий остаток" in wb.sheetnames
        assert "Неликвид" in wb.sheetnames
        assert wb.sheetnames.index("Низкий остаток") < wb.sheetnames.index("Неликвид")

    def test_sync_error_sheet_columns(self):
        """sync_error kind: SKU не нужен, есть колонка Склад + Тип + Ошибка."""
        from openpyxl import load_workbook
        from app.jobs.reports import _build_xlsx

        rows = [{
            "name": "Ozon main", "marketplace": "ozon", "source": "marketplace_api",
            "last_error": "API timeout", "last_sync_at": "2026-05-22T10:30:00Z",
            "status": "error",
        }]
        result = _build_xlsx({"sync_error": rows}, currency="RUB")
        wb = load_workbook(io.BytesIO(result))
        ws = wb["Ошибки синхронизации"]
        assert ws["A1"].value == "Склад"
        assert ws["B1"].value == "Тип"
        assert ws["A2"].value == "Ozon main"
        assert ws["C2"].value == "API timeout"


# ─── _build_telegram_caption ──────────────────────────────────────────────────

class TestTelegramCaption:
    def test_includes_all_kinds_with_counts(self):
        from app.jobs.reports import _build_telegram_caption
        result = _build_telegram_caption(
            kinds=["low_stock", "dead_inventory"],
            sku_counts={"low_stock": 5, "dead_inventory": 10},
        )
        assert "Низкий остаток" in result
        assert "Неликвид" in result
        assert "<b>5</b>" in result
        assert "<b>10</b>" in result

    def test_skips_zero_counts(self):
        """Если SKU=0 в kind, его не показываем в caption (пустые листы и так пропущены)."""
        from app.jobs.reports import _build_telegram_caption
        result = _build_telegram_caption(
            kinds=["low_stock", "dead_inventory"],
            sku_counts={"low_stock": 5, "dead_inventory": 0},
        )
        assert "Низкий остаток" in result
        assert "Неликвид" not in result

    def test_caption_under_1024_chars(self):
        """Telegram caption лимит 1024. Проверка что у нас компактно."""
        from app.jobs.reports import _build_telegram_caption
        all_kinds = ["low_stock", "critical_stock", "dead_inventory",
                     "repeated_stockout", "underestimated_sku", "sync_error", "weekly_report"]
        result = _build_telegram_caption(
            kinds=all_kinds,
            sku_counts={k: 999 for k in all_kinds},
        )
        assert len(result) < 1024


# ─── dispatch_daily_reports — smoke ───────────────────────────────────────────

class TestDispatchDailyReports:
    def test_no_subscriptions_does_nothing(self, monkeypatch):
        """Если в БД нет enabled подписок — лог + ранний выход."""
        mock_sb = MagicMock()
        monkeypatch.setattr("app.jobs.reports.get_supabase", lambda: mock_sb)
        monkeypatch.setattr("app.jobs.reports.fetch_all", lambda q: [])

        from app.jobs.reports import dispatch_daily_reports
        dispatch_daily_reports()  # не должно бросать

    def test_filters_subscriptions_by_today_dow(self, monkeypatch):
        """Подписки с params.day_of_week != сегодня — пропускаются.

        Подменяем datetime.now() чтобы isoweekday() возвращал нужное.
        """
        from datetime import datetime, timezone
        import app.jobs.reports as reports_mod

        # Пусть сегодня = понедельник (isoweekday=1)
        fake_today = datetime(2026, 5, 25, 9, 0, 0, tzinfo=timezone.utc)  # Mon
        assert fake_today.isoweekday() == 1

        class FakeDateTime(datetime):
            @classmethod
            def now(cls, tz=None):
                return fake_today

        monkeypatch.setattr(reports_mod, "datetime", FakeDateTime)

        # Две подписки: одна на пн (1) — должна попасть в обработку,
        # вторая на ср (3) — должна быть отфильтрована.
        subs = [
            {"seller_id": "s1", "kind": "low_stock", "channel": "email",
             "enabled": True, "params": {"day_of_week": 1, "coverage_days_threshold": 7}},
            {"seller_id": "s2", "kind": "low_stock", "channel": "email",
             "enabled": True, "params": {"day_of_week": 3, "coverage_days_threshold": 7}},
        ]
        monkeypatch.setattr(reports_mod, "fetch_all", lambda q: subs)

        # Мок sb: idempotency check возвращает 'не отправляли' (data=[]).
        # Запрос seller возвращает enrich data.
        # _fetch_sku_rows вернёт [], значит status='skipped' — но в группе будет 1 seller.
        groups_seen = {"sellers": set()}

        def fake_fetch_rows(sb, sid, kind, params):
            groups_seen["sellers"].add(sid)
            return []  # пусто → status='skipped', но dispatcher всё равно обработал.

        monkeypatch.setattr(reports_mod, "_fetch_sku_rows", fake_fetch_rows)
        monkeypatch.setattr(reports_mod, "_already_sent_today", lambda sb, sid, ch: False)
        monkeypatch.setattr(reports_mod, "_record_history",
                            lambda sb, *a, **kw: None)

        mock_sb = MagicMock()
        seller_single = MagicMock()
        seller_single.execute.return_value.data = {
            "id": "s1", "email": "a@b.com", "display_name": "A",
            "currency": "RUB", "telegram_chat_id": None,
            "notify_email": True, "notify_telegram": True,
        }
        mock_sb.table.return_value.select.return_value.eq.return_value.single.return_value = seller_single
        monkeypatch.setattr(reports_mod, "get_supabase", lambda: mock_sb)

        from app.jobs.reports import dispatch_daily_reports
        dispatch_daily_reports()

        # Только s1 (понедельник) попал в обработку, s2 (среда) отфильтрован
        assert groups_seen["sellers"] == {"s1"}

    def test_skipped_when_idempotency_check_hits(self, monkeypatch):
        """Если уже отправляли сегодня — fetcher не вызывается."""
        from datetime import datetime, timezone
        import app.jobs.reports as reports_mod

        fake_today = datetime(2026, 5, 25, 9, 0, 0, tzinfo=timezone.utc)

        class FakeDateTime(datetime):
            @classmethod
            def now(cls, tz=None):
                return fake_today

        monkeypatch.setattr(reports_mod, "datetime", FakeDateTime)

        subs = [{
            "seller_id": "s1", "kind": "low_stock", "channel": "email",
            "enabled": True, "params": {"day_of_week": 1, "coverage_days_threshold": 7},
        }]
        monkeypatch.setattr(reports_mod, "fetch_all", lambda q: subs)
        monkeypatch.setattr(reports_mod, "_already_sent_today", lambda sb, sid, ch: True)

        fetch_called = {"n": 0}
        monkeypatch.setattr(
            reports_mod, "_fetch_sku_rows",
            lambda sb, sid, kind, params: fetch_called.update(n=fetch_called["n"]+1) or [],
        )
        monkeypatch.setattr(reports_mod, "get_supabase", lambda: MagicMock())

        from app.jobs.reports import dispatch_daily_reports
        dispatch_daily_reports()

        # Если idempotency сработала, fetcher вообще не должен вызываться.
        assert fetch_called["n"] == 0
