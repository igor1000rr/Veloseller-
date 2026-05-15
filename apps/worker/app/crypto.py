"""AES-256-GCM шифрование секретов."""
from __future__ import annotations
import base64
import os
from typing import Optional
from cryptography.hazmat.primitives.ciphers.aead import AESGCM


def _master_key() -> bytes:
    raw = os.getenv("SECRET_ENCRYPTION_KEY") or ""
    if not raw:
        raise RuntimeError("SECRET_ENCRYPTION_KEY не задан в env")
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
    if not plaintext:
        return ""
    key = _master_key()
    aesgcm = AESGCM(key)
    iv = os.urandom(12)
    ct_with_tag = aesgcm.encrypt(iv, plaintext.encode("utf-8"), None)
    return base64.b64encode(iv + ct_with_tag).decode("ascii")


def decrypt(token: str) -> str:
    if not token:
        return ""
    key = _master_key()
    blob = base64.b64decode(token)
    iv = blob[:12]
    ct_with_tag = blob[12:]
    aesgcm = AESGCM(key)
    return aesgcm.decrypt(iv, ct_with_tag, None).decode("utf-8")


def decrypt_if_encrypted(value: Optional[str]) -> Optional[str]:
    if not value:
        return value
    if not os.getenv("SECRET_ENCRYPTION_KEY"):
        return value
    try:
        return decrypt(value)
    except Exception:
        return value
