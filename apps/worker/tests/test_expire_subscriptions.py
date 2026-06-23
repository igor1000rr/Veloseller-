"""Тесты для _job_expire_subscriptions: откат истёкших подписок Veloseller и Radar."""
from datetime import datetime, timezone, timedelta
from unittest.mock import MagicMock, patch


def _setup_mock_with_no_expired():
    """Mock supabase где оба SELECT (veloseller и radar) возвращают пусто.

    Структура запросов:
      1. sellers.select().neq("plan",..).not_.is_("subscription_expires_at",..).lt(..).execute() → veloseller expired
      2. sellers.select().neq("radar_plan",..).not_.is_("radar_active_until",..).lt(..).execute() → radar expired
    """
    mock_sb = MagicMock()
    chain = mock_sb.table.return_value.select.return_value
    chain.neq.return_value.not_.is_.return_value.lt.return_value.execute.return_value.data = []
    return mock_sb


def test_expire_subscriptions_no_expired():
    """Если нет истёкших подписок (ни Veloseller ни Radar) — ничего не делаем."""
    mock_sb = _setup_mock_with_no_expired()

    with patch("app.jobs.scheduler.get_supabase", return_value=mock_sb):
        from app.jobs.scheduler import _job_expire_subscriptions
        _job_expire_subscriptions()

    # Update не должен вызываться вообще
    assert not mock_sb.table.return_value.update.called


def test_expire_subscriptions_rolls_back_expired_veloseller_to_trial():
    """Истёкшие Veloseller подписки откатываются в trial с лимитом 15.

    Mock возвращает 1 expired veloseller, 0 expired radar.
    Проверяем что UPDATE вызывается с правильными полями.
    """
    mock_sb = MagicMock()

    # Два разных SELECT возвращают разные данные. Используем side_effect через
    # счётчик вызовов execute().
    expired_velo = [
        {"id": "u1", "email": "a@b.ru", "plan": "starter", "subscription_expires_at": "2026-04-01T00:00:00Z"},
    ]
    select_chain = mock_sb.table.return_value.select.return_value
    execute_results = [
        MagicMock(data=expired_velo),   # 1-й SELECT (veloseller)
        MagicMock(data=[]),              # 2-й SELECT (radar)
    ]
    select_chain.neq.return_value.not_.is_.return_value.lt.return_value.execute.side_effect = execute_results

    with patch("app.jobs.scheduler.get_supabase", return_value=mock_sb):
        from app.jobs.scheduler import _job_expire_subscriptions
        _job_expire_subscriptions()

    # Должен быть вызван UPDATE с plan=trial
    update_call = mock_sb.table.return_value.update.call_args
    assert update_call is not None
    update_args = update_call.args[0]
    assert update_args["plan"] == "trial"
    # Триал = 3 склада (совпадает с триггером update_warehouses_limit_on_plan_change).
    assert update_args["plan_warehouses_limit"] == 3
    assert update_args["subscription_expires_at"] is None


def test_expire_subscriptions_rolls_back_expired_radar():
    """Истёкшие Radar подписки откатываются в radar_plan='none'."""
    mock_sb = MagicMock()
    expired_radar = [
        {"id": "u1", "email": "a@b.ru", "radar_plan": "seller", "radar_active_until": "2026-04-01T00:00:00Z"},
    ]
    select_chain = mock_sb.table.return_value.select.return_value
    execute_results = [
        MagicMock(data=[]),              # 1-й SELECT (veloseller — пусто)
        MagicMock(data=expired_radar),   # 2-й SELECT (radar)
    ]
    select_chain.neq.return_value.not_.is_.return_value.lt.return_value.execute.side_effect = execute_results

    with patch("app.jobs.scheduler.get_supabase", return_value=mock_sb):
        from app.jobs.scheduler import _job_expire_subscriptions
        _job_expire_subscriptions()

    # UPDATE для radar
    update_call = mock_sb.table.return_value.update.call_args
    assert update_call is not None
    update_args = update_call.args[0]
    assert update_args["radar_plan"] == "none"
    assert update_args["radar_brands_limit"] == 0
    assert update_args["radar_active_until"] is None


def test_expire_subscriptions_handles_exception_gracefully():
    """Один провальный update не валит весь job."""
    mock_sb = MagicMock()
    expired = [{"id": "u1", "email": "a@b.ru", "plan": "pro"}]
    select_chain = mock_sb.table.return_value.select.return_value
    select_chain.neq.return_value.not_.is_.return_value.lt.return_value.execute.side_effect = [
        MagicMock(data=expired),   # veloseller
        MagicMock(data=[]),         # radar
    ]
    # update().eq().execute() падает
    mock_sb.table.return_value.update.return_value.eq.return_value.execute.side_effect = Exception("db error")

    # Не должно проброситься
    with patch("app.jobs.scheduler.get_supabase", return_value=mock_sb):
        from app.jobs.scheduler import _job_expire_subscriptions
        _job_expire_subscriptions()  # не падает


def test_expire_subscriptions_supabase_crash():
    """Если Supabase полностью недоступен — job не падает."""
    with patch("app.jobs.scheduler.get_supabase", side_effect=Exception("connection refused")):
        from app.jobs.scheduler import _job_expire_subscriptions
        _job_expire_subscriptions()  # не падает
