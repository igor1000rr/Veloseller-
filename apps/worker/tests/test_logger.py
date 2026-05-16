"""Тесты structured logger."""
from __future__ import annotations
import json
import logging
from io import StringIO

import pytest

from app.logger import JsonFormatter, setup_logger


class TestJsonFormatter:
    def test_basic_message(self):
        record = logging.LogRecord(
            name="test", level=logging.INFO, pathname="", lineno=0,
            msg="hello", args=(), exc_info=None,
        )
        out = JsonFormatter().format(record)
        data = json.loads(out)
        assert data["message"] == "hello"
        assert data["level"] == "INFO"
        assert data["logger"] == "test"
        assert "timestamp" in data

    def test_extra_fields_included(self):
        record = logging.LogRecord(
            name="test", level=logging.INFO, pathname="", lineno=0,
            msg="test", args=(), exc_info=None,
        )
        record.seller_id = "uuid-123"
        record.action = "recalc"
        out = JsonFormatter().format(record)
        data = json.loads(out)
        assert data["seller_id"] == "uuid-123"
        assert data["action"] == "recalc"

    def test_exception_serialized(self):
        try:
            raise ValueError("boom")
        except ValueError:
            import sys
            record = logging.LogRecord(
                name="test", level=logging.ERROR, pathname="", lineno=0,
                msg="caught", args=(), exc_info=sys.exc_info(),
            )
            out = JsonFormatter().format(record)
            data = json.loads(out)
            assert "exception" in data
            assert "ValueError" in data["exception"]
            assert "boom" in data["exception"]

    def test_non_serializable_falls_back_to_str(self):
        class CustomObj:
            def __str__(self): return "custom-obj"
        record = logging.LogRecord(
            name="test", level=logging.INFO, pathname="", lineno=0,
            msg="x", args=(), exc_info=None,
        )
        record.obj = CustomObj()
        out = JsonFormatter().format(record)
        data = json.loads(out)
        assert data["obj"] == "custom-obj"

    def test_unicode_preserved(self):
        record = logging.LogRecord(
            name="test", level=logging.INFO, pathname="", lineno=0,
            msg="Привет мир", args=(), exc_info=None,
        )
        out = JsonFormatter().format(record)
        # ensure_ascii=False — вывод без \uXXXX escapes
        assert "Привет мир" in out
        data = json.loads(out)
        assert data["message"] == "Привет мир"

    def test_standard_attrs_excluded(self):
        """Стандартные атрибуты LogRecord не дублируются в JSON."""
        record = logging.LogRecord(
            name="test", level=logging.INFO, pathname="/x.py", lineno=42,
            msg="y", args=(), exc_info=None,
        )
        out = JsonFormatter().format(record)
        data = json.loads(out)
        # pathname, lineno, msg не должны быть в top-level
        assert "pathname" not in data
        assert "lineno" not in data
        # Остаются только timestamp/level/logger/message
        assert set(data.keys()) == {"timestamp", "level", "logger", "message"}


class TestSetupLogger:
    def test_creates_logger_with_json_handler(self):
        log = setup_logger("test-setup-1", level="DEBUG")
        assert log.level == logging.DEBUG
        assert len(log.handlers) == 1
        assert isinstance(log.handlers[0].formatter, JsonFormatter)

    def test_no_duplicate_handlers_on_reimport(self):
        log1 = setup_logger("test-setup-2")
        log2 = setup_logger("test-setup-2")
        assert log1 is log2
        assert len(log1.handlers) == 1

    def test_default_level_info(self, monkeypatch):
        monkeypatch.delenv("LOG_LEVEL", raising=False)
        log = setup_logger("test-setup-3")
        assert log.level == logging.INFO

    def test_log_level_from_env(self, monkeypatch):
        monkeypatch.setenv("LOG_LEVEL", "WARNING")
        log = setup_logger("test-setup-4")
        assert log.level == logging.WARNING

    def test_invalid_level_falls_back_to_info(self, monkeypatch):
        monkeypatch.setenv("LOG_LEVEL", "NONSENSE")
        log = setup_logger("test-setup-5")
        assert log.level == logging.INFO
