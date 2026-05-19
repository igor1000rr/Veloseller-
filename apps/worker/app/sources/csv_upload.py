"""CSV upload source.

Формат: колонки sku, product_name (опционально), stock_quantity, price.

БАГ 56 fix: лимит на 50K строк (защита от OOM).
БАГ 59 fix: per-row error handling — одна битая строка не валит весь impport.
БАГ 60 fix: дедупликация SKU внутри одного файла (последняя запись побеждает).
"""
from __future__ import annotations
import csv
import io
import logging
from datetime import datetime, timezone
from decimal import Decimal, InvalidOperation
from typing import Iterable
from app.schemas import SnapshotInput

logger = logging.getLogger("veloseller.csv")

# 50K SKU — больше чем у любого реального селлера. Защита от OOM.
MAX_ROWS = 50_000


def parse_csv(content: bytes | str) -> list[SnapshotInput]:
    text = content.decode("utf-8") if isinstance(content, bytes) else content
    reader = csv.DictReader(io.StringIO(text))
    required = {"sku", "stock_quantity", "price"}
    if not required.issubset({h.strip().lower() for h in (reader.fieldnames or [])}):
        raise ValueError(f"CSV должен содержать колонки {required}")

    now = datetime.now(timezone.utc)
    seen_skus: dict[str, SnapshotInput] = {}  # sku → snapshot (последняя запись побеждает)
    errors: list[str] = []
    row_count = 0
    for row_idx, row in enumerate(reader, start=2):  # start=2 потому что строка 1 — заголовок
        row_count += 1
        if row_count > MAX_ROWS:
            raise ValueError(f"CSV содержит более {MAX_ROWS} строк — слишком большой файл")

        try:
            norm = {k.strip().lower(): v for k, v in row.items() if k}
            sku = norm["sku"].strip()
            if not sku:
                errors.append(f"строка {row_idx}: пустой SKU")
                continue

            stock_raw = norm["stock_quantity"].strip() if norm["stock_quantity"] else ""
            if not stock_raw:
                errors.append(f"строка {row_idx} ({sku}): пустой stock_quantity")
                continue

            try:
                stock = int(float(stock_raw))
            except (ValueError, TypeError):
                errors.append(f"строка {row_idx} ({sku}): невалидный stock_quantity '{stock_raw}'")
                continue
            if stock < 0:
                errors.append(f"строка {row_idx} ({sku}): отрицательный stock {stock}")
                continue

            price_raw = (norm["price"] or "").strip().replace(",", ".")
            try:
                price = Decimal(price_raw) if price_raw else Decimal("0")
            except (InvalidOperation, ValueError):
                errors.append(f"строка {row_idx} ({sku}): невалидная цена '{price_raw}'")
                continue
            if price < 0:
                errors.append(f"строка {row_idx} ({sku}): отрицательная цена {price}")
                continue

            seen_skus[sku] = SnapshotInput(
                sku=sku,
                product_name=(norm.get("product_name") or "").strip() or None,
                stock_quantity=stock,
                price=price,
                snapshot_time=now,
            )
        except Exception as e:
            errors.append(f"строка {row_idx}: {e}")
            continue

    if errors:
        # Логируем первые 10 ошибок, чтобы было что показать пользователю
        logger.warning("CSV parsing had errors", extra={
            "errors_count": len(errors),
            "first_errors": errors[:10],
            "successful_rows": len(seen_skus),
        })

    if not seen_skus:
        raise ValueError(
            f"Из {row_count} строк ни одна не прошла валидацию. "
            f"Первые ошибки: {'; '.join(errors[:5])}"
        )

    return list(seen_skus.values())
