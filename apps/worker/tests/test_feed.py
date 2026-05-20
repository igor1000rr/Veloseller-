"""Тесты feed parser + SSRF protection (БАГ 42/43/44/45)."""
import pytest
from unittest.mock import patch, MagicMock

from app.sources.feed import _make, fetch_snapshots, _validate_feed_url, _is_private_ip


def test_yml_parsing(monkeypatch):
    yml = '''<?xml version="1.0"?><yml_catalog><shop><offers>
<offer id="A1" available="true"><name>Item A</name><price>100.50</price>
<param name="stock">25</param></offer>
<offer id="B2" available="true"><name>Item B</name><price>50</price>
<param name="stock">0</param></offer>
</offers></shop></yml_catalog>'''
    monkeypatch.setattr("app.sources.feed.with_retry", lambda f: yml)
    snaps = fetch_snapshots("http://example.com/yml")
    assert len(snaps) == 2
    assert snaps[0].sku == "A1"
    assert snaps[0].stock_quantity == 25
    assert float(snaps[0].price) == 100.50
    assert snaps[1].stock_quantity == 0


def test_google_merchant_parsing(monkeypatch):
    gm = '''<?xml version="1.0"?><rss><channel>
<item><id>P1</id><title>Prod 1</title><price>299.99 USD</price><availability>in_stock</availability></item>
<item><id>P2</id><title>Prod 2</title><price>49.00</price><availability>out_of_stock</availability></item>
</channel></rss>'''
    monkeypatch.setattr("app.sources.feed.with_retry", lambda f: gm)
    snaps = fetch_snapshots("http://example.com/gm")
    assert len(snaps) == 2
    assert snaps[0].sku == "P1"
    assert snaps[0].stock_quantity == 1
    assert snaps[1].stock_quantity == 0


def test_simple_custom(monkeypatch):
    xml = '''<?xml version="1.0"?><catalog>
<product><sku>X1</sku><name>X</name><price>10</price><stock>5</stock></product>
</catalog>'''
    monkeypatch.setattr("app.sources.feed.with_retry", lambda f: xml)
    snaps = fetch_snapshots("http://example.com/x")
    assert len(snaps) == 1
    assert snaps[0].sku == "X1"
    assert snaps[0].stock_quantity == 5


# ============================================================================
# БАГ 43: SSRF protection
# ============================================================================


class TestSsrfProtection:
    """_validate_feed_url блокирует private IPs / localhost / неподдерживаемые схемы."""

    def test_blocks_aws_metadata_ip(self, monkeypatch):
        """169.254.169.254 — AWS metadata, link-local IP."""
        # Симулируем что getaddrinfo возвращает 169.254.169.254
        monkeypatch.setattr("socket.getaddrinfo",
                            lambda h, p: [(0, 0, 0, "", ("169.254.169.254", 0))])
        with pytest.raises(ValueError, match="private/internal"):
            _validate_feed_url("http://metadata.attacker.com/")

    def test_blocks_localhost(self, monkeypatch):
        """127.0.0.1 — loopback."""
        monkeypatch.setattr("socket.getaddrinfo",
                            lambda h, p: [(0, 0, 0, "", ("127.0.0.1", 0))])
        with pytest.raises(ValueError, match="private/internal"):
            _validate_feed_url("http://localhost/")

    def test_blocks_private_10(self, monkeypatch):
        """10.x.x.x — private."""
        monkeypatch.setattr("socket.getaddrinfo",
                            lambda h, p: [(0, 0, 0, "", ("10.0.0.5", 0))])
        with pytest.raises(ValueError, match="private/internal"):
            _validate_feed_url("http://internal.attacker.com/")

    def test_blocks_private_192_168(self, monkeypatch):
        monkeypatch.setattr("socket.getaddrinfo",
                            lambda h, p: [(0, 0, 0, "", ("192.168.1.10", 0))])
        with pytest.raises(ValueError, match="private/internal"):
            _validate_feed_url("http://router.local/")

    def test_blocks_file_scheme(self):
        """file:// scheme — атакер может прочитать локальные файлы."""
        with pytest.raises(ValueError, match="http/https"):
            _validate_feed_url("file:///etc/passwd")

    def test_blocks_ftp_scheme(self):
        with pytest.raises(ValueError, match="http/https"):
            _validate_feed_url("ftp://evil.com/feed.xml")

    def test_blocks_empty_url(self):
        with pytest.raises(ValueError):
            _validate_feed_url("")

    def test_allows_public_https(self, monkeypatch):
        """example.com резолвится в public IP — должно проходить."""
        monkeypatch.setattr("socket.getaddrinfo",
                            lambda h, p: [(0, 0, 0, "", ("93.184.216.34", 0))])
        # Не должен бросать exception
        _validate_feed_url("https://example.com/feed.xml")

    def test_unresolvable_host_blocked(self, monkeypatch):
        """Если DNS не резолвится — лучше блокировать (paranoid)."""
        import socket as _socket
        def fake_getaddrinfo(h, p):
            raise _socket.gaierror("Name resolution failure")
        monkeypatch.setattr("socket.getaddrinfo", fake_getaddrinfo)
        with pytest.raises(ValueError, match="private/internal"):
            _validate_feed_url("http://unresolvable.invalid/")


class TestIsPrivateIp:
    """_is_private_ip правильно классифицирует IP-адреса."""

    def test_loopback(self, monkeypatch):
        monkeypatch.setattr("socket.getaddrinfo",
                            lambda h, p: [(0, 0, 0, "", ("127.0.0.1", 0))])
        assert _is_private_ip("localhost") is True

    def test_link_local(self, monkeypatch):
        monkeypatch.setattr("socket.getaddrinfo",
                            lambda h, p: [(0, 0, 0, "", ("169.254.169.254", 0))])
        assert _is_private_ip("metadata") is True

    def test_public_ip(self, monkeypatch):
        monkeypatch.setattr("socket.getaddrinfo",
                            lambda h, p: [(0, 0, 0, "", ("8.8.8.8", 0))])
        assert _is_private_ip("dns.google") is False
