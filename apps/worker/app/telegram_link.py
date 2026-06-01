"""Проверка подписанного токена привязки Telegram.

Закрывает hijack: раньше /start <seller_uuid> биндил telegram_chat_id любого
селлера по сырому UUID из deep-link. Теперь deep-link содержит подписанный
токен, который умеет выдать только веб (тот же TELEGRAM_LINK_SECRET).

Формат токена (только hex + '_', влезает в 64-символьный лимит start-параметра):
    <uuidHex32>_<expHex>_<sigHex16>
где
    uuidHex32 — seller_id без дефисов, lowercase (32 hex)
    expHex    — unix-время истечения в hex (lowercase, переменная длина)
    sigHex16  — HMAC_SHA256("<uuidHex32>_<expHex>", TELEGRAM_LINK_SECRET), первые 16 hex

Алгоритм ОБЯЗАН совпадать с apps/web/lib/telegram-link.ts (тот же секрет,
та же ASCII-строка, тот же HMAC-SHA256, та же обрезка до 16 hex). Никакой
бинарной упаковки — только строковые операции, чтобы TS и Python давали
идентичный результат.
"""
from __future__ import annotations

import hashlib
import hmac
import os
import re
from datetime import datetime, timezone
from typing import Optional

_TOKEN_RE = re.compile(r"^([0-9a-f]{32})_([0-9a-f]{1,12})_([0-9a-f]{16})$")
_SIG_LEN = 16


def verify_telegram_link_token(token: str) -> Optional[str]:
    """Проверяет токен. Возвращает seller_id (каноничный UUID) или None.

    None — если: секрет не задан, формат неверный, токен просрочен или подпись
    не сходится. Никаких исключений наружу — невалидный токен это просто отказ.
    """
    secret = os.environ.get("TELEGRAM_LINK_SECRET")
    if not secret or not token:
        return None
    m = _TOKEN_RE.match(token.strip())
    if not m:
        return None
    uuid_hex, exp_hex, sig = m.group(1), m.group(2), m.group(3)

    # Срок действия
    try:
        exp = int(exp_hex, 16)
    except ValueError:
        return None
    if exp < int(datetime.now(timezone.utc).timestamp()):
        return None  # истёк

    # Подпись считается ровно над "<uuidHex>_<expHex>" (теми же байтами, что в токене)
    msg = f"{uuid_hex}_{exp_hex}"
    expected = hmac.new(
        secret.encode("utf-8"), msg.encode("utf-8"), hashlib.sha256
    ).hexdigest()[:_SIG_LEN]
    if not hmac.compare_digest(expected, sig):
        return None

    # uuidHex32 → каноничный UUID
    return f"{uuid_hex[0:8]}-{uuid_hex[8:12]}-{uuid_hex[12:16]}-{uuid_hex[16:20]}-{uuid_hex[20:32]}"
