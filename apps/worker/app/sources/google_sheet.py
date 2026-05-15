"""Google Sheets source.

Service Account JSON путь — settings.google_application_credentials.
Лист должен иметь шапку: sku, product_name (optional), stock_quantity, price.
"""
from __future__ import annotations
from datetime import datetime, timezone
from decimal import Decimal
from app.schemas import SnapshotInput
from app.config import settings


def fetch_snapshots(sheet_url_or_id: str, worksheet_index: int = 0) -> list[SnapshotInput]:
    """Загрузить snapshot-ы из Google Sheet. Лень-импорт google-libs."""
    import gspread
    from google.oauth2.service_account import Credentials

    scopes = ["https://www.googleapis.com/auth/spreadsheets.readonly"]
    creds = Credentials.from_service_account_file(
        settings.google_application_credentials, scopes=scopes
    )
    gc = gspread.authorize(creds)

    # gspread понимает и URL, и ключ
    if sheet_url_or_id.startswith("http"):
        sh = gc.open_by_url(sheet_url_or_id)
    else:
        sh = gc.open_by_key(sheet_url_or_id)
    ws = sh.get_worksheet(worksheet_index)
    rows = ws.get_all_records()  # list[dict]

    now = datetime.now(timezone.utc)
    out: list[SnapshotInput] = []
    for r in rows:
        norm = {str(k).strip().lower(): v for k, v in r.items()}
        out.append(SnapshotInput(
            sku=str(norm["sku"]).strip(),
            product_name=str(norm.get("product_name") or "").strip() or None,
            stock_quantity=int(float(norm["stock_quantity"])),
            price=Decimal(str(norm["price"]).replace(",", ".")),
            snapshot_time=now,
        ))
    return out
