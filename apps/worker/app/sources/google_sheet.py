"""Google Sheets source.

Service Account JSON путь — settings.google_application_credentials.
Лист должен иметь шапку: sku, product_name (optional), stock_quantity, price.

БАГ 62 fix: per-row error handling + дедупликация SKU + лимит строк.
БАГ 64 fix: явная ошибка если credentials path не задан.
"""
from __future__ import annotations
import logging
from datetime import datetime, timezone
from decimal import Decimal, InvalidOperation
from app.schemas import SnapshotInput
from app.config import settings

logger = logging.getLogger("veloseller.google_sheet")

# Защита от загрузки очень больших листов.
MAX_ROWS = 50_000


def fetch_snapshots(sheet_url_or_id: str, worksheet_index: int = 0) -> list[SnapshotInput]:
    """Загрузить snapshot-ы из Google Sheet. Лень-импорт google-libs."""
    import gspread
    from google.oauth2.service_account import Credentials

    creds_path = settings.google_application_credentials
    if not creds_path:
        raise RuntimeError(
            "GOOGLE_APPLICATION_CREDENTIALS не задан в env. "
            "Нужен путь к service account JSON."
        )

    scopes = ["https://www.googleapis.com/auth/spreadsheets.readonly"]
    creds = Credentials.from_service_account_file(creds_path, scopes=scopes)
    gc = gspread.authorize(creds)

    if sheet_url_or_id.startswith("http"):
        sh = gc.open_by_url(sheet_url_or_id)
    else:
        sh = gc.open_by_key(sheet_url_or_id)
    ws = sh.get_worksheet(worksheet_index)
    rows = ws.get_all_records()

    if len(rows) > MAX_ROWS:
        raise ValueError(f"Лист содержит более {MAX_ROWS} строк — слишком большой")

    now = datetime.now(timezone.utc)
    seen_skus: dict[str, SnapshotInput] = {}
    errors: list[str] = []

    for row_idx, r in enumerate(rows, start=2):
        try:
            norm = {str(k).strip().lower(): v for k, v in r.items()}
            sku = str(norm.get("sku", "")).strip()
            if not sku:
                errors.append(f"строка {row_idx}: пустой SKU")
                continue

            stock_raw = str(norm.get("stock_quantity", "")).strip()
            if not stock_raw:
                errors.append(f"строка {row_idx} ({sku}): пустой stock_quantity")
                continue
            try:
                stock = int(float(stock_raw))
            except (ValueError, TypeError):
                errors.append(f"строка {row_idx} ({sku}): невалидный stock '{stock_raw}'")
                continue
            if stock < 0:
                errors.append(f"строка {row_idx} ({sku}): отрицательный stock {stock}")
                continue

            price_raw = str(norm.get("price", "")).strip().replace(",", ".")
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
                product_name=str(norm.get("product_name") or "").strip() or None,
                stock_quantity=stock,
                price=price,
                snapshot_time=now,
            )
        except Exception as e:
            errors.append(f"строка {row_idx}: {e}")
            continue

    if errors:
        logger.warning("Google Sheet parsing had errors", extra={
            "errors_count": len(errors),
            "first_errors": errors[:10],
            "successful_rows": len(seen_skus),
        })

    if not seen_skus:
        raise ValueError(
            f"Из {len(rows)} строк ни одна не прошла валидацию. "
            f"Первые ошибки: {'; '.join(errors[:5])}"
        )

    return list(seen_skus.values())
