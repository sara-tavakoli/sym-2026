"""Patient accounts: bcrypt passwords, server-side sessions in an httpOnly cookie, ownership checks.

Scope (per backend-authorization Step 0): private user-owned records -> object/ownership layer only.
- Fictional demo personas (alex, priya) are open demo data.
- Real accounts own exactly one visit, addressed as persona=<user_id>; anyone else gets 404.
"""

import re
import secrets
import uuid
from datetime import datetime, timedelta, timezone

import bcrypt
from fastapi import HTTPException, Query, Request, Response

from lib import demo_data as D
from lib.db import db
from models.auth import REQUIRED_PROFILE_FIELDS, PublicUser, UserProfile

COOKIE = "session_token"
SESSION_DAYS = 7


def now() -> datetime:
    return datetime.now(timezone.utc)


def hash_password(pw: str) -> str:
    return bcrypt.hashpw(pw.encode(), bcrypt.gensalt()).decode()


def check_password(pw: str, hashed: str | None) -> bool:
    if not hashed:
        return False
    try:
        return bcrypt.checkpw(pw.encode(), hashed.encode())
    except ValueError:
        return False


def password_problem(pw: str) -> str | None:
    if len(pw) < 8:
        return "Password must be at least 8 characters"
    if not re.search(r"[A-Za-z]", pw) or not re.search(r"\d", pw):
        return "Password must include at least one letter and one number"
    return None


def new_user_id() -> str:
    return f"user_{uuid.uuid4().hex[:12]}"


def to_public(doc: dict) -> PublicUser:
    profile = UserProfile(**(doc.get("profile") or {}))
    missing = [f for f in REQUIRED_PROFILE_FIELDS if not getattr(profile, f)]
    return PublicUser(
        user_id=doc["user_id"], email=doc["email"], name=profile.preferred_name or profile.full_name or doc.get("name", ""),
        auth_providers=doc.get("auth_providers", []), profile=profile, profile_complete=not missing, missing_fields=missing,
    )


async def start_session(response: Response, user_id: str, token: str | None = None) -> str:
    token = token or secrets.token_urlsafe(32)
    await db.user_sessions.insert_one({"user_id": user_id, "session_token": token, "expires_at": now() + timedelta(days=SESSION_DAYS), "created_at": now()})
    response.set_cookie(COOKIE, token, httponly=True, secure=True, samesite="none", path="/", max_age=SESSION_DAYS * 86400)
    return token


def _token(request: Request) -> str | None:
    tok = request.cookies.get(COOKIE)
    if tok:
        return tok
    auth = request.headers.get("authorization", "")
    return auth[7:] if auth.lower().startswith("bearer ") else None


async def optional_user(request: Request) -> dict | None:
    tok = _token(request)
    if not tok:
        return None
    sess = await db.user_sessions.find_one({"session_token": tok}, {"_id": 0})
    if not sess:
        return None
    exp = sess["expires_at"]
    if isinstance(exp, str):
        exp = datetime.fromisoformat(exp)
    if exp.tzinfo is None:
        exp = exp.replace(tzinfo=timezone.utc)
    if exp < now():
        return None
    return await db.users.find_one({"user_id": sess["user_id"]}, {"_id": 0})


async def require_user(request: Request) -> dict:
    user = await optional_user(request)
    if not user:
        raise HTTPException(401, "Please sign in to continue")
    return user


def is_account(persona: str) -> bool:
    return persona.startswith("user_")


async def patient_persona(request: Request, persona: str = Query("alex", description="Demo persona id or your user_id")) -> str:
    """Patient-side access: demo personas are open fictional data; a real account's visit is owner-only."""
    if persona in D.PERSONAS:
        return persona
    if is_account(persona):
        user = await optional_user(request)
        if user and user["user_id"] == persona:
            return persona
    raise HTTPException(404, "Visit not found")


async def clinician_persona(persona: str = Query("alex", description="Patient whose visit the demo clinician opens")) -> str:
    """Clinician workspace (demo, no clinician login): any demo persona or any existing patient account."""
    if persona in D.PERSONAS:
        return persona
    if is_account(persona) and await db.users.find_one({"user_id": persona}, {"_id": 0, "user_id": 1}):
        return persona
    raise HTTPException(404, "Visit not found")
