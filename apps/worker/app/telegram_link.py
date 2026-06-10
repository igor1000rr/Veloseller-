"""Проверка подписанного токена привязки Telegram.

Закрывает hijack: deep-link содержит подписанный токен (а не сырой UUID),
выдать который может только веб (тот же TELEGRAM_LINK_SECRET).

Формат токена (только hex + '_' + опц. метка инстанса, влезает в 64-символьный
лимит start-параметра Telegram):
    [<instance>_]<uuidHex32>_<expHex>_<sigHex16>
где
    instance  — 'r' (veloseller.ru) | 'c' (.com). Опционально; отсутствие = 'c'
                (обратная совместимость со старыми токенами без метки).
    uuidHex32 — seller_id без дефисов, lowercase (32 hex)
    expHex    — unix-время истечения в hex (lowercase, переменная длина)
    sigHex16  — HMAC_SHA256(подписываемая_строка, TELEGRAM_LINK_SECRET)[:16]

Подписываемая строка:
    с меткой:  "<instance>_<uuidHex>_<expHex>"
    без метки: "<uuidHex>_<expHex>"   (старый формат)

Единый бот (на EU) обслуживает оба инстанса: по метке EU-воркер решает, в чью
базу писать chat_id (см. app.main). Алгоритм ОБЯЗАН совпадать с
apps/web/lib/telegram-link.ts — только строковые операции, чтобы TS и Python
давали идентичный результат.
"""
from __future__ import annotations

import hashlib
import hmac
import os
import re
from datetime import datetime, timezone
from typing import Optional

# Метка инстанса опциональна: старые токены без неё трактуем как 'c'.
_TOKEN_RE = re.compile(r"^(?:([rc])_)?([0-9a-f]{32})_([0-9a-f]{1,12})_([0-9a-f]{16})$")
_SIG_LEN = 16


def verify_telegram_link_token(token: str) -> Optional[tuple[str, str]]:
    """Проверяет токен. Возвращает (instance, seller_id) или None.

    instance — 'r' | 'c' (по метке в токене; без метки → 'c').
    None — если: секрет не задан, формат неверен, токен просрочен или подпись
    не сходится. Никаких исключений наружу — невалидный токен это просто отказ.
    """
    secret = os.environ.get("TELEGRAM_LINK_SECRET")
    if not secret or not token:
        return None
    m = _TOKEN_RE.match(token.strip())
    if not m:
        return None
    raw_inst, uuid_hex, exp_hex, sig = m.group(1), m.group(2), m.group(3), m.group(4)

    # Срок действия
    try:
        exp = int(exp_hex, 16)
    except ValueError:
        return None
    if exp < int(datetime.now(timezone.utc).timestamp()):
        return None  # истёк

    # Подпись считается над теми же байтами, что в токене (с меткой или без).
    msg = f"{raw_inst}_{uuid_hex}_{exp_hex}" if raw_inst else f"{uuid_hex}_{exp_hex}"
    expected = hmac.new(
        secret.encode("utf-8"), msg.encode("utf-8"), hashlib.sha256
    ).hexdigest()[:_SIG_LEN]
    if not hmac.compare_digest(expected, sig):
        return None

    instance = raw_inst or "c"
    seller_id = f"{uuid_hex[0:8]}-{uuid_hex[8:12]}-{uuid_hex[12:16]}-{uuid_hex[16:20]}-{uuid_hex[20:32]}"
    return (instance, seller_id)
