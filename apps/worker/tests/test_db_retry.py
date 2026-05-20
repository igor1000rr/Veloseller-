"""Тесты db.py — БАГ 84 + 91 + 92.

Покрываем:
  - _RetryingTransport: retry на RemoteProtocolError, max attempts, успех на 1-й
  - _force_http11_on_postgrest: успешный patch + graceful fallback
"""
from __future__ import annotations

from unittest.mock import MagicMock, patch

import httpx
import pytest


class TestRetryingTransport:
    def _make_request(self):
        return httpx.Request("GET", "https://example.com/x")

    def test_success_on_first_attempt_no_retry(self):
        """Если запрос успешен с 1-й попытки — никакого retry."""
        from app.db import _RetryingTransport

        transport = _RetryingTransport(http2=False)
        mock_response = httpx.Response(200, content=b"ok")

        call_count = {"n": 0}
        with patch.object(
            httpx.HTTPTransport, "handle_request",
            side_effect=lambda r: (call_count.__setitem__("n", call_count["n"] + 1), mock_response)[1]
        ):
            resp = transport.handle_request(self._make_request())

        assert resp.status_code == 200
        assert call_count["n"] == 1

    def test_retries_on_remote_protocol_error(self):
        """RemoteProtocolError на 1-й попытке → retry → успех на 2-й."""
        from app.db import _RetryingTransport

        transport = _RetryingTransport(http2=False)
        mock_response = httpx.Response(200, content=b"ok")

        call_count = {"n": 0}
        def fake(r):
            call_count["n"] += 1
            if call_count["n"] == 1:
                raise httpx.RemoteProtocolError("Server disconnected", request=r)
            return mock_response

        with patch.object(httpx.HTTPTransport, "handle_request", side_effect=fake), \
             patch("time.sleep"):
            resp = transport.handle_request(self._make_request())

        assert resp.status_code == 200
        assert call_count["n"] == 2

    def test_raises_after_max_retries(self):
        """3 неудачных попытки → raises RemoteProtocolError."""
        from app.db import _RetryingTransport

        transport = _RetryingTransport(http2=False)

        def fake(r):
            raise httpx.RemoteProtocolError("Server disconnected", request=r)

        with patch.object(httpx.HTTPTransport, "handle_request", side_effect=fake), \
             patch("time.sleep"):
            with pytest.raises(httpx.RemoteProtocolError):
                transport.handle_request(self._make_request())

    def test_does_not_retry_on_other_exceptions(self):
        """Другие exceptions (TimeoutException) пробрасываются без retry."""
        from app.db import _RetryingTransport

        transport = _RetryingTransport(http2=False)

        call_count = {"n": 0}
        def fake(r):
            call_count["n"] += 1
            raise httpx.ConnectTimeout("Connection timeout", request=r)

        with patch.object(httpx.HTTPTransport, "handle_request", side_effect=fake):
            with pytest.raises(httpx.ConnectTimeout):
                transport.handle_request(self._make_request())

        assert call_count["n"] == 1


class TestForceHttp11OnPostgrest:
    def test_patches_session_attribute(self):
        """Если у postgrest есть `session` — переоткрывает с HTTP/1.1."""
        from app.db import _force_http11_on_postgrest

        mock_client = MagicMock()
        old_session = httpx.Client(base_url="https://example.supabase.co",
                                    headers={"apikey": "x"}, http2=False)
        mock_client.postgrest.session = old_session

        _force_http11_on_postgrest(mock_client)

        new_session = mock_client.postgrest.session
        assert isinstance(new_session, httpx.Client)
        assert new_session is not old_session

    def test_graceful_fallback_no_session_attr(self):
        """Если у postgrest нет session/_session — лог warning, без exception."""
        from app.db import _force_http11_on_postgrest

        mock_client = MagicMock()
        mock_client.postgrest.session = None
        mock_client.postgrest._session = None

        _force_http11_on_postgrest(mock_client)

    def test_graceful_fallback_on_exception(self):
        """Любое exception внутри patch — ловится, тихий warning."""
        from app.db import _force_http11_on_postgrest

        mock_client = MagicMock()
        mock_client.postgrest = property(lambda s: (_ for _ in ()).throw(Exception("boom")))

        _force_http11_on_postgrest(mock_client)
