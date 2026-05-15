"""Тесты шифрования + проверка совместимости формата с Node."""
from __future__ import annotations

import base64
import os

import pytest


@pytest.fixture(autouse=True)
def _set_key(monkeypatch):
    """32-байтный ключ для тестов."""
    key = base64.b64encode(b"x" * 32).decode("ascii")
    monkeypatch.setenv("SECRET_ENCRYPTION_KEY", key)


def test_roundtrip():
    from app.crypto import encrypt, decrypt
    plaintext = "ozon-api-key-12345"
    token = encrypt(plaintext)
    assert token != plaintext
    assert decrypt(token) == plaintext


def test_empty():
    from app.crypto import encrypt, decrypt
    assert encrypt("") == ""
    assert decrypt("") == ""


def test_different_iv_each_time():
    from app.crypto import encrypt
    a = encrypt("same")
    b = encrypt("same")
    assert a != b  # IV случайный


def test_tampering_detected():
    from app.crypto import encrypt, decrypt
    token = encrypt("secret")
    # Меняем последний байт (часть authTag)
    blob = bytearray(base64.b64decode(token))
    blob[-1] ^= 0xFF
    bad_token = base64.b64encode(blob).decode("ascii")
    with pytest.raises(Exception):
        decrypt(bad_token)


def test_decrypt_if_encrypted_passthrough(monkeypatch):
    """Если SECRET_ENCRYPTION_KEY не задан — возвращает as-is."""
    monkeypatch.delenv("SECRET_ENCRYPTION_KEY", raising=False)
    from importlib import reload
    from app import crypto
    reload(crypto)
    assert crypto.decrypt_if_encrypted("plain-value") == "plain-value"


def test_hex_key_format(monkeypatch):
    """Поддержка hex-формата ключа (64 hex символа)."""
    monkeypatch.setenv("SECRET_ENCRYPTION_KEY", "a" * 64)
    from importlib import reload
    from app import crypto
    reload(crypto)
    token = crypto.encrypt("test")
    assert crypto.decrypt(token) == "test"
