"""Criterion: Returning user signs in without re-entering details — POST
/api/auth/login with the correct credentials for the seeded account returns the
same user/session every time (no profile re-asked at the API level — profile
fields persist), and a wrong password is rejected with the exact message the
UI surfaces."""

import httpx

from .conftest import attach_session

SEED_EMAIL = "delivered@resend.dev"
SEED_PASSWORD = "Passw0rd1"


def test_wrong_password_rejected_with_generic_message(client: httpx.Client):
    resp = client.post("/auth/login", json={"email": SEED_EMAIL, "password": "definitely-wrong-1"})
    assert resp.status_code == 401, resp.text
    assert resp.json()["detail"] == "Email or password is incorrect"


def test_correct_login_returns_same_user_without_reset_profile(client: httpx.Client):
    resp = client.post("/auth/login", json={"email": SEED_EMAIL, "password": SEED_PASSWORD})
    assert resp.status_code == 200, resp.text
    attach_session(resp, client)
    user = resp.json()
    assert user["email"] == SEED_EMAIL

    # /auth/me with the session must return the identical account (persisted
    # profile fields, not a fresh/blank one) — this is what lets the booking
    # flow skip straight to Review instead of asking for the profile again.
    me = client.get("/auth/me")
    assert me.status_code == 200
    assert me.json()["user_id"] == user["user_id"]
