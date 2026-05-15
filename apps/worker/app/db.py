"""Supabase admin (service_role) client."""
from __future__ import annotations
from supabase import Client, create_client
from app.config import settings

_client: Client | None = None


def get_supabase() -> Client:
    global _client
    if _client is None:
        if not settings.supabase_url or not settings.supabase_service_role_key:
            raise RuntimeError("SUPABASE_URL или SUPABASE_SERVICE_ROLE_KEY не заданы")
        _client = create_client(settings.supabase_url, settings.supabase_service_role_key)
    return _client
