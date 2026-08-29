import os
from pathlib import Path
from typing import Any, Dict, Optional

from dotenv import load_dotenv
from supabase import Client, create_client


BASE_DIR = Path(__file__).resolve().parent
load_dotenv(BASE_DIR / ".env")

SUPABASE_URL = os.getenv("SUPABASE_URL") or "https://idistovgxuvvxxtwrbio.supabase.co"
SUPABASE_SERVICE_ROLE_KEY = os.getenv("SUPABASE_SERVICE_ROLE_KEY")


def get_supabase_client() -> Client:
    if not SUPABASE_URL or not SUPABASE_SERVICE_ROLE_KEY:
        raise ValueError("Supabase environment variables are not configured.")
    return create_client(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)


def save_jam_to_supabase(
    name: str,
    bpm: int = 120,
    beats_per_bar: int = 4,
    arrangement: Optional[Dict[str, Any]] = None,
    song_id: Optional[str] = None,
    user_id: Optional[str] = None,
):
    client = get_supabase_client()
    payload = {
        "name": name or "Untitled Jam",
        "bpm": bpm,
        "beats_per_bar": beats_per_bar,
        "arrangement": arrangement or {},
        "song_id": song_id,
        "user_id": user_id,
    }
    response = client.table("jams").insert(payload).execute()
    if getattr(response, "error", None):
        raise RuntimeError(str(response.error))
    return response.data


def load_jams_from_supabase(user_id: Optional[str] = None):
    client = get_supabase_client()
    query = client.table("jams")
    if user_id:
        query = query.filter("user_id", "eq", user_id)
    response = query.select("*").order("created_at", desc=True).execute()
    if getattr(response, "error", None):
        raise RuntimeError(str(response.error))
    return response.data
