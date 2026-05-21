"""Тесты для _job_expire_subscriptions: откат истёкших подписок в trial."""
from datetime import datetime, timezone, timedelta
from unittest.mock import MagicMock, patch


def test_expire_subscriptions_no_expired():
    """Если нет истёкших подписок — ничего не делаем."""
    mock_sb = MagicMock()
    chain = mock_sb.table.return_value.select.return_value
    chain.neq.return_value.not_.is_.return_value.lt.return_value.execute.return_value.data = []

    with patch("app.jobs.scheduler.get_supabase", return_value=mock_sb):
        from app.jobs.scheduler import _job_expire_subscriptions
        _job_expire_subscriptions()

    # Селлеры не обновлялись — был только SELECT, не UPDATE
    update_calls = [c for c in mock_sb.table.call_args_list if c.args == ("sellers",)]
    # Первый вызов — SELECT, больше не должно быть
    assert len(update_calls) == 1


def test_expire_subscriptions_rolls_back_expired_to_trial():
    """Истёкшие селлеры откатываются в trial с лимитом 15."""
    mock_sb = MagicMock()
    expired = [
        {"id": "u1", "email": "a@b.ru", "plan": "starter", "subscription_expires_at": "2026-04-01T00:00:00Z"},
        {"id": "u2", "email": "c@d.ru", "plan": "pro", "subscription_expires_at": "2026-04-15T00:00:00Z"},
    ]
    select_chain = mock_sb.table.return_value.select.return_value
    select_chain.neq.return_value.not_.is_.return_value.lt.return_value.execute.return_value.data = expired

    with patch("app.jobs.scheduler.get_supabase", return_value=mock_sb):
        from app.jobs.scheduler import _job_expire_subscriptions
        _job_expire_subscriptions()

    # Для каждого юзера должен быть вызван был update
    update_call = mock_sb.table.return_value.update.call_args
    assert update_call is not None
    update_args = update_call.args[0]
    assert update_args["plan"] == "trial"
    assert update_args["plan_warehouses_limit"] == 15
    assert update_args["subscription_expires_at"] is None


def test_expire_subscriptions_handles_exception_gracefully():
    """Один провальный update не валит весь job."""
    mock_sb = MagicMock()
    expired = [{"id": "u1", "email": "a@b.ru", "plan": "pro"}]
    chain = mock_sb.table.return_value.select.return_value
    chain.neq.return_value.not_.is_.return_value.lt.return_value.execute.return_value.data = expired
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
