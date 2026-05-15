"""Edge cases для app/crypto.py — невалидные ключи, отсутствие env."""
import os
import pytest
from unittest.mock import patch


def test_encrypt_empty_returns_empty():
    from app.crypto import encrypt
    assert encrypt("") == ""


def test_decrypt_empty_returns_empty():
    from app.crypto import decrypt
    assert decrypt("") == ""


def test_master_key_missing_raises(monkeypatch):
    monkeypatch.delenv("SECRET_ENCRYPTION_KEY", raising=False)
    from app.crypto import encrypt
    with pytest.raises(RuntimeError, match="не задан"):
        encrypt("data")


def test_master_key_hex_64_chars(monkeypatch):
    monkeypatch.setenv("SECRET_ENCRYPTION_KEY", "a" * 64)
    from app.crypto import encrypt, decrypt
    ct = encrypt("hello")
    assert ct and ct != "hello"
    assert decrypt(ct) == "hello"


def test_master_key_wrong_length_raises(monkeypatch):
    import base64
    monkeypatch.setenv("SECRET_ENCRYPTION_KEY", base64.b64encode(b"short").decode())
    from app.crypto import encrypt
    with pytest.raises(RuntimeError, match="32"):
        encrypt("data")


def test_master_key_unparsable_raises(monkeypatch):
    monkeypatch.setenv("SECRET_ENCRYPTION_KEY", "!!!not-valid-base64@@@")
    from app.crypto import encrypt
    with pytest.raises(RuntimeError, match="парсится"):
        encrypt("data")


def test_decrypt_if_encrypted_no_key(monkeypatch):
    monkeypatch.delenv("SECRET_ENCRYPTION_KEY", raising=False)
    from app.crypto import decrypt_if_encrypted
    assert decrypt_if_encrypted("some-plain-value") == "some-plain-value"


def test_decrypt_if_encrypted_none():
    from app.crypto import decrypt_if_encrypted
    assert decrypt_if_encrypted(None) is None
    assert decrypt_if_encrypted("") == ""


def test_decrypt_if_encrypted_plain_value_passes_through(monkeypatch):
    import base64
    monkeypatch.setenv("SECRET_ENCRYPTION_KEY", base64.b64encode(b"x" * 32).decode())
    from app.crypto import decrypt_if_encrypted
    assert decrypt_if_encrypted("plain-client-id") == "plain-client-id"


def test_decrypt_if_encrypted_roundtrip(monkeypatch):
    import base64
    monkeypatch.setenv("SECRET_ENCRYPTION_KEY", base64.b64encode(b"x" * 32).decode())
    from app.crypto import encrypt, decrypt_if_encrypted
    ct = encrypt("secret-api-key")
    assert decrypt_if_encrypted(ct) == "secret-api-key"
