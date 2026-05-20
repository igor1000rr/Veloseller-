"""XML/RSS feed source. Простой парсер YML/Google Merchant feed формата.

Поддерживаемые форматы (auto-detect):
  - YML (Yandex Market): <offer id="SKU"><name/><price/><param name="stock">N</param></offer>
  - Google Merchant: <item><g:id/><g:title/><g:price/><g:availability/></item>
  - Simple custom: <product><sku/><name/><price/><stock/></product>

БАГ 42 fix: используем defusedxml вместо ET — защита от XXE attacks.
БАГ 43 fix: блокируем private IP (SSRF protection) — пользователь не может
  использовать feed_url=http://169.254.169.254/ (AWS metadata) или localhost.
БАГ 44 fix: лимит на размер response 50 MB — защита от OOM при огромных feed'ах.
БАГ 45 fix: follow_redirects=False — иначе attacker через HTTP redirect мог
  перейти на private IP в обход проверки.
"""
from __future__ import annotations
import ipaddress
import logging
import socket
from datetime import datetime, timezone
from decimal import Decimal
from urllib.parse import urlparse
import re

# БАГ 42: defusedxml защищает от XXE, billion laughs, entity expansion bombs
import defusedxml.ElementTree as ET

import httpx

from app.schemas import SnapshotInput
from app.sources._http import with_retry

logger = logging.getLogger("veloseller.feed")

# БАГ 44: лимит на размер XML response (50MB). YML/Google Merchant feed реалистично
# никогда не превышает 10MB даже для крупных продавцов.
MAX_FEED_BYTES = 50 * 1024 * 1024


def _is_private_ip(host: str) -> bool:
    """Резолвит host и проверяет что IP не private/loopback/link-local.

    БАГ 43 SSRF protection: блокирует:
      - 10.0.0.0/8, 172.16.0.0/12, 192.168.0.0/16 (private)
      - 127.0.0.0/8 (loopback)
      - 169.254.0.0/16 (link-local, включая AWS metadata 169.254.169.254)
      - ::1 (IPv6 loopback)
      - fc00::/7 (IPv6 unique local)
    """
    try:
        # Резолвим все возможные IP (DNS rebinding защита частичная)
        infos = socket.getaddrinfo(host, None)
        for info in infos:
            ip_str = info[4][0]
            ip = ipaddress.ip_address(ip_str)
            if ip.is_private or ip.is_loopback or ip.is_link_local or ip.is_multicast or ip.is_reserved:
                return True
        return False
    except (socket.gaierror, ValueError):
        # Если не резолвится — лучше заблокировать
        return True


def _validate_feed_url(feed_url: str) -> None:
    """Валидация feed_url перед HTTP запросом.

    БАГ 43 SSRF: блокируем private IPs, localhost, file://, и другие схемы.
    """
    if not feed_url or not isinstance(feed_url, str):
        raise ValueError("feed_url пуст")
    parsed = urlparse(feed_url)
    if parsed.scheme not in ("http", "https"):
        raise ValueError(f"Поддерживаются только http/https URL, получено: {parsed.scheme}")
    host = parsed.hostname
    if not host:
        raise ValueError("feed_url без host")
    # Блок прямых IP (типа http://169.254.169.254/)
    if _is_private_ip(host):
        raise ValueError(f"Доступ к private/internal адресу запрещён: {host}")


def fetch_snapshots(feed_url: str) -> list[SnapshotInput]:
    """Загружает feed по URL и парсит все три формата."""
    _validate_feed_url(feed_url)

    def _do():
        # БАГ 45: follow_redirects=False, проверяем каждый redirect вручную
        with httpx.Client(timeout=120.0, follow_redirects=False) as cli:
            current_url = feed_url
            for _ in range(5):  # max 5 redirects
                _validate_feed_url(current_url)
                r = cli.get(current_url, headers={"User-Agent": "Veloseller-Bot/1.0"})
                if r.status_code in (301, 302, 303, 307, 308):
                    new_url = r.headers.get("Location")
                    if not new_url:
                        raise ValueError(f"Redirect без Location header (status={r.status_code})")
                    # Относительный redirect → абсолютный
                    if new_url.startswith("/"):
                        parsed = urlparse(current_url)
                        new_url = f"{parsed.scheme}://{parsed.netloc}{new_url}"
                    current_url = new_url
                    continue
                r.raise_for_status()
                # БАГ 44: проверяем размер response
                content = r.content
                if len(content) > MAX_FEED_BYTES:
                    raise ValueError(
                        f"Feed размер {len(content)} > лимит {MAX_FEED_BYTES} bytes (50 MB)"
                    )
                return content.decode("utf-8", errors="replace")
            raise ValueError("Слишком много redirect'ов (>5)")
    text = with_retry(_do)

    # Снимаем namespace для удобства
    text = re.sub(r'\sxmlns(:\w+)?="[^"]+"', "", text, count=0)
    # БАГ 42: defusedxml.ElementTree.fromstring безопасно парсит XML
    root = ET.fromstring(text)
    now = datetime.now(timezone.utc)

    snapshots: list[SnapshotInput] = []

    # YML
    for offer in root.iter("offer"):
        sku = offer.get("id") or offer.findtext("vendorCode") or ""
        name = offer.findtext("name") or sku
        price_str = offer.findtext("price") or "0"
        stock = 0
        has_explicit_stock = False
        for param in offer.iter("param"):
            if (param.get("name") or "").lower() in ("stock", "остаток", "наличие"):
                stock = int(float((param.text or "0").strip()))
                has_explicit_stock = True
                break
        if not has_explicit_stock and offer.get("available") == "true":
            stock = 1
        if sku:
            snapshots.append(_make(sku, name, stock, price_str, now))

    if snapshots:
        return snapshots

    # Google Merchant
    for item in root.iter("item"):
        sku = item.findtext("id") or item.findtext("g:id") or ""
        name = item.findtext("title") or item.findtext("g:title") or sku
        price_str = (item.findtext("price") or item.findtext("g:price") or "0").split()[0]
        avail_str = (item.findtext("availability") or item.findtext("g:availability") or "").lower()
        stock = 1 if "in_stock" in avail_str else 0
        if sku:
            snapshots.append(_make(sku, name, stock, price_str, now))

    if snapshots:
        return snapshots

    # Simple custom
    for prod in root.iter("product"):
        sku = prod.findtext("sku") or prod.findtext("id") or ""
        name = prod.findtext("name") or prod.findtext("title") or sku
        price_str = prod.findtext("price") or "0"
        stock = int(float(prod.findtext("stock") or prod.findtext("quantity") or "0"))
        if sku:
            snapshots.append(_make(sku, name, stock, price_str, now))

    return snapshots


def _make(sku: str, name: str, stock: int, price_str: str, ts: datetime) -> SnapshotInput:
    price_str = re.sub(r"[^\d.,]", "", str(price_str)).replace(",", ".")
    try:
        price = Decimal(price_str) if price_str else Decimal("0")
    except Exception:
        price = Decimal("0")
    return SnapshotInput(
        sku=sku.strip(), product_name=name.strip() or None,
        stock_quantity=max(0, stock), price=price, snapshot_time=ts,
    )
