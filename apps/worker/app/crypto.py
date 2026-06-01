"""AES-256-GCM шифрование секретов (Ozon/WB API keys, WB token).

Совместимо с apps/web/lib/crypto.ts — оба используют одинаковый формат:
    base64( iv[12] || ciphertext || authTag[16] )
Ключ читается из ENV SECRET_ENCRYPTION_KEY (32 байта hex или base64).
"""
from __future__ import annotations

import base64
import logging
import os
from typing import Optional

from cryptography.hazmat.primitives.ciphers.aead import AESGCM

logger = logging.getLogger(__name__)

# iv(12) + минимум 1 байт ciphertext + GCM tag(16)
_MIN_BLOB_LEN = 12 + 1 + 16


def _master_key() -> bytes:
    raw = os.getenv("SECRET_ENCRYPTION_KEY") or ""
    if not raw:
        raise RuntimeError("SECRET_ENCRYPTION_KEY не задан в env")
    # Поддерживаем hex (64 символа) или base64
    if len(raw) == 64:
        try:
            return bytes.fromhex(raw)
        except ValueError:
            pass
    try:
        key = base64.b64decode(raw)
    except Exception as e:
        raise RuntimeError(f"SECRET_ENCRYPTION_KEY не парсится: {e}")
    if len(key) != 32:
        raise RuntimeError(f"SECRET_ENCRYPTION_KEY должен быть 32 байта, получено {len(key)}")
    return key


def encrypt(plaintext: str) -> str:
    """Шифрует plaintext, возвращает base64(iv||ciphertext||tag)."""
    if not plaintext:
        return ""
    key = _master_key()
    aesgcm = AESGCM(key)
    iv = os.urandom(12)
    # cryptography уже включает 16-байтный tag в конец ciphertext
    ct_with_tag = aesgcm.encrypt(iv, plaintext.encode("utf-8"), None)
    return base64.b64encode(iv + ct_with_tag).decode("ascii")


def decrypt(token: str) -> str:
    """Расшифровывает строку из encrypt()."""
    if not token:
        return ""
    key = _master_key()
    blob = base64.b64decode(token)
    iv = blob[:12]
    ct_with_tag = blob[12:]
    aesgcm = AESGCM(key)
    return aesgcm.decrypt(iv, ct_with_tag, None).decode("utf-8")


def _looks_encrypted(value: str) -> bool:
    """Эвристика: строка похожа на blob из encrypt() — корректный base64
    длиной не меньше iv+ciphertext+tag. Нужна, чтобы отличать зашифрованные
    значения от plaintext (локальный dev / немигрированные строки)."""
    try:
        blob = base64.b64decode(value, validate=True)
    except Exception:
        return False
    return len(blob) >= _MIN_BLOB_LEN


def decrypt_if_encrypted(value: Optional[str]) -> Optional[str]:
    """Расшифровывает значение, если оно похоже на зашифрованный blob.

    fail-closed: если значение выглядит зашифрованным, но расшифровать не удалось
    (неверный/ротированный ключ, повреждение, подмена) — бросаем исключение, а НЕ
    возвращаем шифротекст молча (иначе битый секрет тихо уедет в API-вызов и
    замаскирует проблему с ключом).

    Plaintext-значения (не base64 / короче blob) и режим без ключа (локальный dev)
    возвращаются как есть.
    """
    if not value:
        return value
    if not os.getenv("SECRET_ENCRYPTION_KEY"):
        return value
    if not _looks_encrypted(value):
        # Явно не зашифрованный blob — считаем plaintext, отдаём как есть.
        return value
    try:
        return decrypt(value)
    except Exception:
        logger.error(
            "decrypt_if_encrypted: значение похоже на зашифрованное, но расшифровка "
            "не удалась — проверь SECRET_ENCRYPTION_KEY (возможна ротация ключа или "
            "повреждение данных)."
        )
        raise
