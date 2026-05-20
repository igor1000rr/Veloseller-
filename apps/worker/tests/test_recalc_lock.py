"""БАГ 95 в стадии разработки — тесты временно сплющены до одного smoke-теста.

Модуль app.recalc_lock живёт в репо как deadcode — не используется в main.py/recalc.py.
Полные тесты будут добавлены когда БАГ 95 будет активирован.
"""
from __future__ import annotations
import os
os.environ["ENABLE_SCHEDULER"] = "false"


def test_recalc_lock_module_importable():
    """Smoke: модуль импортируется без ошибок."""
    from app import recalc_lock
    assert hasattr(recalc_lock, "try_acquire_recalc_lock")
    assert hasattr(recalc_lock, "mark_recalc_done")
    assert hasattr(recalc_lock, "mark_recalc_error")
    assert hasattr(recalc_lock, "get_recalc_state")
    assert hasattr(recalc_lock, "update_recalc_progress")
    assert hasattr(recalc_lock, "_json_safe")
