"""Тесты ЖИВОГО recalc-лока — main._try_acquire_recalc_lock.

Лок берётся атомарной RPC public.try_acquire_recalc_lock (таблица recalc_jobs).
Раньше здесь был только smoke-импорт отдельного модуля app/recalc_lock.py — он
оказался мёртвым дублёром (нигде не импортировался) с ПРОТИВОПОЛОЖНОЙ семантикой
ошибки и удалён. Тестируем реальный путь, включая fail-closed в проде.
"""
from __future__ import annotations
import os
os.environ["ENABLE_SCHEDULER"] = "false"

from unittest.mock import MagicMock

import app.main as m


def _fake_sb(data):
    sb = MagicMock()
    sb.rpc.return_value.execute.return_value = MagicMock(data=data)
    return sb


def _boom():
    raise RuntimeError("db down")


def test_acquire_true_when_rpc_grants(monkeypatch):
    monkeypatch.setattr(m, "get_supabase", lambda: _fake_sb(True))
    assert m._try_acquire_recalc_lock("s1") is True


def test_acquire_false_when_lock_held(monkeypatch):
    monkeypatch.setattr(m, "get_supabase", lambda: _fake_sb(False))
    assert m._try_acquire_recalc_lock("s1") is False


def test_fail_closed_in_production_on_rpc_error(monkeypatch):
    """В проде сбой RPC → лок НЕ берём (иначе параллельный recalc на репликах)."""
    monkeypatch.setattr(m, "get_supabase", _boom)
    monkeypatch.setenv("ENV", "production")
    assert m._try_acquire_recalc_lock("s1") is False


def test_fail_open_in_dev_on_rpc_error(monkeypatch):
    """В dev сбой RPC → оптимистично True, чтобы не блокировать локалку без БД-функции."""
    monkeypatch.setattr(m, "get_supabase", _boom)
    monkeypatch.delenv("ENV", raising=False)
    monkeypatch.delenv("SENTRY_ENV", raising=False)
    assert m._try_acquire_recalc_lock("s1") is True
