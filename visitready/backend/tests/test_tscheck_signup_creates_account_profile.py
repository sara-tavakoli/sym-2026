"""Criterion: Sign up creates a real account and asks for profile — POST
/api/auth/signup rejects a weak password, creates a real user + session for a
strong one, and the profile is genuinely incomplete (missing_fields) until PUT
/api/auth/profile supplies full name, DOB and mobile; a bad mobile is rejected."""

import time

import httpx

from .conftest import attach_session


def test_weak_password_rejected(client: httpx.Client):
    email = f"tscheck-weak-{int(time.time() * 1000)}@example.com"
    resp = client.post("/auth/signup", json={"email": email, "password": "abc"})
    assert resp.status_code == 422, resp.text


def test_signup_then_profile_requires_valid_fields(client: httpx.Client):
    email = f"tscheck-signup-{int(time.time() * 1000)}@example.com"
    resp = client.post("/auth/signup", json={"email": email, "password": "Passw0rd1"})
    assert resp.status_code == 200, resp.text
    attach_session(resp, client)
    user = resp.json()
    assert user["email"] == email
    assert user["profile_complete"] is False
    assert set(user["missing_fields"]) == {"full_name", "date_of_birth", "mobile"}

    # Bad mobile is rejected by the API too (not just client-side).
    bad = client.put(
        "/auth/profile",
        json={"full_name": "TS Signup", "date_of_birth": "1990-01-01", "mobile": "123",
              "preferred_name": "", "gender": ""},
    )
    assert bad.status_code == 422, bad.text

    good = client.put(
        "/auth/profile",
        json={"full_name": "TS Signup", "date_of_birth": "1990-01-01", "mobile": "0412345678",
              "preferred_name": "", "gender": ""},
    )
    assert good.status_code == 200, good.text
    saved = good.json()
    assert saved["profile_complete"] is True
    assert saved["profile"]["full_name"] == "TS Signup"

    me = client.get("/auth/me")
    assert me.status_code == 200
    assert me.json()["profile"]["mobile"] == "0412345678"
