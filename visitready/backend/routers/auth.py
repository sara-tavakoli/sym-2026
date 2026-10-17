"""Patient sign-in / sign-up (email + password, or Emergent-managed Google), profile, password reset."""

import hashlib
import secrets
import time
from collections import defaultdict
from datetime import timedelta, timezone
from html import escape
from urllib.parse import urlparse

import httpx
from fastapi import APIRouter, Depends, HTTPException, Request, Response

from lib.auth import (
    COOKIE, check_password, hash_password, new_user_id, now, password_problem, require_user, start_session, to_public,
)
from lib.db import db
from lib.email import EMAIL_FROM_NAME, send_email
from models.auth import (
    ForgotRequest, GoogleSessionRequest, LoginRequest, OkResponse, ProfileUpdate, PublicUser, ResetRequest, SignupRequest,
)

router = APIRouter(prefix="/auth")

GOOGLE_SESSION_URL = "https://demobackend.emergentagent.com/auth/v1/env/oauth/session-data"
_failures: dict[str, list[float]] = defaultdict(list)  # simple per-email login throttle
MAX_FAILS, WINDOW = 5, 15 * 60


def _norm(email: str) -> str:
    return email.strip().lower()


def _throttled(email: str) -> bool:
    cutoff = time.time() - WINDOW
    _failures[email] = [t for t in _failures[email] if t > cutoff]
    return len(_failures[email]) >= MAX_FAILS


@router.post("/signup", response_model=PublicUser)
async def signup(body: SignupRequest, response: Response):
    email = _norm(body.email)
    if problem := password_problem(body.password):
        raise HTTPException(422, problem)
    if await db.users.find_one({"email": email}, {"_id": 0, "user_id": 1}):
        raise HTTPException(409, "An account with this email already exists. Try signing in instead.")
    doc = {"user_id": new_user_id(), "email": email, "name": "", "password_hash": hash_password(body.password),
           "auth_providers": ["password"], "profile": {}, "created_at": now()}
    await db.users.insert_one({**doc})
    await start_session(response, doc["user_id"])
    return to_public(doc)


@router.post("/login", response_model=PublicUser)
async def login(body: LoginRequest, response: Response):
    email = _norm(body.email)
    if _throttled(email):
        raise HTTPException(429, "Too many attempts. Please wait 15 minutes or reset your password.")
    user = await db.users.find_one({"email": email}, {"_id": 0})
    if not user or not check_password(body.password, user.get("password_hash")):
        _failures[email].append(time.time())
        if user and not user.get("password_hash"):
            raise HTTPException(401, "This account uses Google sign-in. Use 'Continue with Google' or reset your password.")
        raise HTTPException(401, "Email or password is incorrect")
    _failures.pop(email, None)
    await start_session(response, user["user_id"])
    return to_public(user)


@router.post("/google/session", response_model=PublicUser)
async def google_session(body: GoogleSessionRequest, response: Response):
    async with httpx.AsyncClient(timeout=15) as client:
        r = await client.get(GOOGLE_SESSION_URL, headers={"X-Session-ID": body.session_id})
    if r.status_code != 200:
        raise HTTPException(401, "Google sign-in failed. Please try again.")
    data = r.json()
    email = _norm(data["email"])
    user = await db.users.find_one({"email": email}, {"_id": 0})
    if user:
        providers = sorted(set(user.get("auth_providers", [])) | {"google"})
        await db.users.update_one({"user_id": user["user_id"]}, {"$set": {"auth_providers": providers, "picture": data.get("picture", "")}})
        user["auth_providers"] = providers
    else:
        user = {"user_id": new_user_id(), "email": email, "name": data.get("name", ""), "picture": data.get("picture", ""),
                "auth_providers": ["google"], "profile": {"full_name": data.get("name", "")}, "created_at": now()}
        await db.users.insert_one({**user})
    await start_session(response, user["user_id"], data.get("session_token"))
    return to_public(user)


@router.get("/me", response_model=PublicUser)
async def me(user: dict = Depends(require_user)):
    return to_public(user)


@router.post("/logout", response_model=OkResponse)
async def logout(request: Request, response: Response):
    tok = request.cookies.get(COOKIE)
    if tok:
        await db.user_sessions.delete_many({"session_token": tok})
    response.delete_cookie(COOKIE, path="/", secure=True, samesite="none")
    return OkResponse()


@router.put("/profile", response_model=PublicUser)
async def update_profile(body: ProfileUpdate, user: dict = Depends(require_user)):
    profile = body.model_dump()  # whitelisted fields only
    await db.users.update_one({"user_id": user["user_id"]}, {"$set": {"profile": profile, "name": profile["full_name"]}})
    user["profile"] = profile
    return to_public(user)


def _app_origin(request: Request) -> str:
    """Reset links must point at this app only (G3): accept the caller's origin only if it is one of our hosts."""
    origin = request.headers.get("origin") or ""
    host = urlparse(origin).hostname or ""
    if origin.startswith("https://") and (host.endswith(".emergentagent.com") or host.endswith(".emergent.host")):
        return origin.rstrip("/")
    raise HTTPException(400, "Password reset must be requested from the VisitReady app")


@router.post("/forgot", response_model=OkResponse)
async def forgot_password(body: ForgotRequest, request: Request):
    origin = _app_origin(request)
    generic = OkResponse(message="If an account exists for that email, we've sent a reset link. It expires in 1 hour.")
    user = await db.users.find_one({"email": _norm(body.email)}, {"_id": 0})
    if not user:
        return generic  # never reveal whether an email is registered
    token = secrets.token_urlsafe(32)
    await db.password_resets.insert_one({"token_hash": hashlib.sha256(token.encode()).hexdigest(), "user_id": user["user_id"],
                                         "expires_at": now() + timedelta(hours=1), "used": False, "created_at": now()})
    link = f"{origin}/patient/reset-password?token={token}"
    html = (
        '<table role="presentation" width="100%"><tr><td style="padding:24px;font-family:Arial,sans-serif;color:#1C2421">'
        f'<h2 style="margin:0 0 12px;color:#0D5C4D">Reset your {escape(EMAIL_FROM_NAME)} password</h2>'
        '<p>We received a request to reset the password for your account.</p>'
        f'<p><a href="{escape(link)}" style="display:inline-block;background:#0D5C4D;color:#ffffff;padding:12px 20px;'
        'border-radius:999px;text-decoration:none">Choose a new password</a></p>'
        '<p style="font-size:13px;color:#555">This link expires in 1 hour and can be used once. If you didn\'t ask for this, you can ignore this email.</p>'
        f'<p style="font-size:12px;color:#888">Sent by {escape(EMAIL_FROM_NAME)}, a fictional healthcare demo. We never ask for your password by email.</p>'
        '</td></tr></table>'
    )
    await send_email(to=user["email"], subject=f"Reset your {EMAIL_FROM_NAME} password", html=html)
    return generic


@router.post("/reset", response_model=OkResponse)
async def reset_password(body: ResetRequest):
    if problem := password_problem(body.password):
        raise HTTPException(422, problem)
    h = hashlib.sha256(body.token.encode()).hexdigest()
    rec = await db.password_resets.find_one({"token_hash": h, "used": False}, {"_id": 0})
    exp = rec and rec["expires_at"]
    if exp is not None and exp.tzinfo is None:
        exp = exp.replace(tzinfo=timezone.utc)
    if not rec or exp < now():
        raise HTTPException(400, "This reset link is invalid or has expired. Please request a new one.")
    user = await db.users.find_one({"user_id": rec["user_id"]}, {"_id": 0})
    providers = sorted(set(user.get("auth_providers", [])) | {"password"})
    await db.users.update_one({"user_id": rec["user_id"]}, {"$set": {"password_hash": hash_password(body.password), "auth_providers": providers}})
    await db.password_resets.update_one({"token_hash": h}, {"$set": {"used": True}})
    await db.user_sessions.delete_many({"user_id": rec["user_id"]})  # sign out everywhere after a reset
    return OkResponse(message="Password updated. You can now sign in.")
