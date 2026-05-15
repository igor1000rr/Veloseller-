"""Тесты feed parser."""
import xml.etree.ElementTree as ET
from unittest.mock import patch

from app.sources.feed import _make, fetch_snapshots


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
