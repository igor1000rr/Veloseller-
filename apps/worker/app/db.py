"""Supabase client (service role — bypass RLS, для worker)."""
from __future__ import annotations
from functools import lru_cache
from supabase import create_client, Client
from app.config import settings


@lru_cache(maxsize=1)
def get_supabase() -> Client:
    if not settings.supabase_url or not settings.supabase_service_role_key:
        raise RuntimeError("SUPABASE_URL и SUPABASE_SERVICE_ROLE_KEY должны быть заданы в .env")
    return create_client(settings.supabase_url, settings.supabase_service_role_key)
