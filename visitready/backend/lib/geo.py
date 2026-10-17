"""Geocoding (OpenStreetMap Nominatim, Australia only; optional Google fallback) + straight-line distance."""

import asyncio
import math
import os
import time

import httpx

from lib.db import db

NOMINATIM_URL = "https://nominatim.openstreetmap.org/search"
GOOGLE_URL = "https://maps.googleapis.com/maps/api/geocode/json"
USER_AGENT = "VisitReady-hackathon-demo/1.0 (fictional healthcare demo)"
_lock = asyncio.Lock()
_last_call = 0.0  # Nominatim usage policy: max 1 request per second


def haversine_km(lat1: float, lng1: float, lat2: float, lng2: float) -> float:
    r = 6371.0088
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dp, dl = p2 - p1, math.radians(lng2 - lng1)
    a = math.sin(dp / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return 2 * r * math.asin(math.sqrt(a))


def _normalise(q: str) -> str:
    return " ".join(q.lower().replace(",", " ").split())


async def _nominatim(q: str) -> dict | None:
    global _last_call
    async with _lock:
        wait = 1.0 - (time.monotonic() - _last_call)
        if wait > 0:
            await asyncio.sleep(wait)
        _last_call = time.monotonic()
        async with httpx.AsyncClient(timeout=10, headers={"User-Agent": USER_AGENT}) as client:
            r = await client.get(NOMINATIM_URL, params={"q": q, "countrycodes": "au", "format": "jsonv2", "limit": 1, "addressdetails": 0})
    r.raise_for_status()
    rows = r.json()
    if not rows:
        return None
    top = rows[0]
    return {"label": top.get("display_name", q), "lat": float(top["lat"]), "lng": float(top["lon"]), "source": "OpenStreetMap"}


async def _google(q: str) -> dict | None:
    key = os.environ.get("GOOGLE_MAPS_API_KEY")
    if not key:
        return None
    async with httpx.AsyncClient(timeout=10) as client:
        r = await client.get(GOOGLE_URL, params={"address": q, "components": "country:AU", "key": key})
    r.raise_for_status()
    res = r.json().get("results") or []
    if not res:
        return None
    loc = res[0]["geometry"]["location"]
    return {"label": res[0].get("formatted_address", q), "lat": float(loc["lat"]), "lng": float(loc["lng"]), "source": "Google"}


async def geocode(q: str) -> dict | None:
    """Returns {label, lat, lng, source} or None if not found. Raises RuntimeError if every provider failed.
    Results (including not-found) are cached by normalised query; the query is a place name, never the user's exact GPS."""
    key = _normalise(q)
    cached = await db.geocode_cache.find_one({"q": key}, {"_id": 0})
    if cached:
        return cached.get("result")
    providers = [_nominatim] + ([_google] if os.environ.get("GOOGLE_MAPS_API_KEY") else [])
    result, failed = None, 0
    for provider in providers:
        try:
            result = await provider(q)
        except (httpx.HTTPError, ValueError, KeyError):
            failed += 1
            continue
        if result:
            break
    if result is None and failed == len(providers):
        raise RuntimeError("geocoding unavailable")  # never cache outages
    await db.geocode_cache.update_one({"q": key}, {"$set": {"q": key, "result": result}}, upsert=True)
    return result
