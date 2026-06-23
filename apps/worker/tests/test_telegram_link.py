"""Тесты verify_telegram_link_token — подписанный deep-link токен Telegram.

Закрывает hijack привязки: сырой UUID больше не принимается. Подпись — 80 бит
(20 hex), синхронно с apps/web/lib/telegram-link.ts::SIG_LEN.
"""
from __future__ import annotations

import hashlib
import hmac
from datetime import datetime, timezone

from app.telegram_link import verify_telegram_link_token, _SIG_LEN

SECRET = "test-telegram-link-secret"
SELLER = "1234abcd-5678-90ab-cdef-1234567890ab"


def _make_token(uuid_str=SELLER, exp_offset=600, secret=SECRET, sig_len=_SIG_LEN):
    uuid_hex = uuid_str.replace("-", "").lower()
    exp = int(datetime.now(timezone.utc).timestamp()) + exp_offset
    exp_hex = format(exp, "x")
    msg = f"{uuid_hex}_{exp_hex}"
    sig = hmac.new(secret.encode(), msg.encode(), hashlib.sha256).hexdigest()[:sig_len]
    return f"{msg}_{sig}"


def test_signature_is_80_bit():
    # 20 hex = 80 бит; ОБЯЗАН совпадать с web SIG_LEN.
    assert _SIG_LEN == 20


def test_valid_token_returns_seller_id(monkeypatch):
    monkeypatch.setenv("TELEGRAM_LINK_SECRET", SECRET)
    assert verify_telegram_link_token(_make_token()) == SELLER


def test_token_fits_telegram_64_char_limit():
    # start-параметр Telegram ограничен 64 символами.
    assert len(_make_token()) <= 64


def test_tampered_signature_rejected(monkeypatch):
    monkeypatch.setenv("TELEGRAM_LINK_SECRET", SECRET)
    tok = _make_token()
    bad = tok[:-1] + ("0" if tok[-1] != "0" else "1")
    assert verify_telegram_link_token(bad) is None


def test_wrong_secret_rejected(monkeypatch):
    monkeypatch.setenv("TELEGRAM_LINK_SECRET", SECRET)
    assert verify_telegram_link_token(_make_token(secret="other-secret")) is None


def test_expired_token_rejected(monkeypatch):
    monkeypatch.setenv("TELEGRAM_LINK_SECRET", SECRET)
    assert verify_telegram_link_token(_make_token(exp_offset=-10)) is None


def test_legacy_64bit_signature_rejected(monkeypatch):
    # Старый 16-hex (64-бит) формат больше не принимается (regex {20}).
    monkeypatch.setenv("TELEGRAM_LINK_SECRET", SECRET)
    assert verify_telegram_link_token(_make_token(sig_len=16)) is None


def test_no_secret_returns_none(monkeypatch):
    monkeypatch.delenv("TELEGRAM_LINK_SECRET", raising=False)
    assert verify_telegram_link_token(_make_token()) is None


def test_raw_uuid_rejected(monkeypatch):
    # Сырой UUID (старый hijack-вектор) не проходит формат.
    monkeypatch.setenv("TELEGRAM_LINK_SECRET", SECRET)
    assert verify_telegram_link_token(SELLER) is None
