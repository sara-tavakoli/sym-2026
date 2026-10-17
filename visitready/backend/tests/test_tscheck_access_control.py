"""Criterion: Access control — GET /api/visit?persona=<other user_id> without that
user's session must 404 (owner-only), GET /api/auth/me without a cookie must 401,
and POST /api/auth/forgot must return a generic message regardless of whether the
email is registered (never reveals account existence)."""

import httpx

from .conftest import attach_session

ORIGIN = "https://visit-ready-demo.preview.emergentagent.com"


def _signup(client: httpx.Client, email: str) -> dict:
    resp = client.post("/auth/signup", json={"email": email, "password": "Passw0rd1"})
    assert resp.status_code == 200, resp.text
    attach_session(resp, client)
    return resp.json()


def _get_a_slot(client: httpx.Client):
    clinics = client.get("/clinics")
    assert clinics.status_code == 200
    data = clinics.json()
    clinic = next(c for c in data if c["slots"])
    return clinic["id"], clinic["slots"][0]["id"], clinic["services"][0]


def test_visit_owner_only_404_for_others(client: httpx.Client):
    import time

    email = f"tscheck-access-{int(time.time() * 1000)}@example.com"
    user = _signup(client, email)
    user_id = user["user_id"]

    # Complete profile + make a booking so the account has a real visit doc.
    profile_resp = client.put(
        "/auth/profile",
        json={"full_name": "TS Access", "date_of_birth": "1990-01-01", "mobile": "0412345678",
              "preferred_name": "", "gender": ""},
    )
    assert profile_resp.status_code == 200, profile_resp.text
    clinic_id, slot_id, service_id = _get_a_slot(client)
    booking_resp = client.post(
        "/visit/booking",
        json={"clinic_id": clinic_id, "slot_id": slot_id, "service_id": service_id},
        params={"persona": user_id},
    )
    assert booking_resp.status_code == 200, booking_resp.text

    # Owner's own cookie-authenticated client can load their visit fine.
    own = client.get("/visit", params={"persona": user_id})
    assert own.status_code == 200, own.text

    # A fresh, unauthenticated caller must not be able to load this account's visit.
    with httpx.Client(base_url=client.base_url, timeout=30.0) as anon:
        resp = anon.get("/visit", params={"persona": user_id})
        assert resp.status_code == 404, resp.text


def test_auth_me_without_cookie_401(client: httpx.Client):
    with httpx.Client(base_url=client.base_url, timeout=30.0) as anon:
        resp = anon.get("/auth/me")
        assert resp.status_code == 401, resp.text


def test_forgot_password_generic_message_regardless_of_existence(client: httpx.Client):
    import time

    stamp = int(time.time() * 1000)
    email = f"tscheck-forgot-unknown-{stamp}@example.com"
    resp = client.post(
        "/auth/forgot",
        json={"email": email},
        headers={"Origin": ORIGIN},
    )
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert "if an account exists" in body["message"].lower()

    # Now for the seeded real account (delivered@resend.dev — the Resend test
    # inbox address, safe to actually email): message must be identical (no leak).
    resp2 = client.post(
        "/auth/forgot",
        json={"email": "delivered@resend.dev"},
        headers={"Origin": ORIGIN},
    )
    assert resp2.status_code == 200, resp2.text
    assert resp2.json()["message"] == body["message"]
