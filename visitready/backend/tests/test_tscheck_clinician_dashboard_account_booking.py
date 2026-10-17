"""Criterion: Booking appears in My Journey and clinician dashboard — once an
account holder books, GET /api/clinician/dashboard must list that account
alongside the demo personas, with the same booking.reference ("appointment-ref-
<persona>" in the UI) and GET /api/clinician/visit?persona=<user_id> must open
their visit (the clinician demo endpoints can open any account visit)."""

import time

import httpx

from .conftest import attach_session


def _get_a_slot(client: httpx.Client):
    clinics = client.get("/clinics")
    assert clinics.status_code == 200
    data = clinics.json()
    clinic = next(c for c in data if c["slots"])
    return clinic["id"], clinic["slots"][0]["id"], clinic["services"][0]


def test_account_booking_shows_on_clinician_dashboard(client: httpx.Client):
    email = f"tscheck-clindash-{int(time.time() * 1000)}@example.com"
    signup = client.post("/auth/signup", json={"email": email, "password": "Passw0rd1"})
    assert signup.status_code == 200, signup.text
    attach_session(signup, client)
    user_id = signup.json()["user_id"]

    profile = client.put(
        "/auth/profile",
        json={"full_name": "TS ClinDash", "date_of_birth": "1990-01-01", "mobile": "0412345678",
              "preferred_name": "", "gender": ""},
    )
    assert profile.status_code == 200, profile.text

    clinic_id, slot_id, service_id = _get_a_slot(client)
    booking = client.post(
        "/visit/booking",
        json={"clinic_id": clinic_id, "slot_id": slot_id, "service_id": service_id},
        params={"persona": user_id},
    )
    assert booking.status_code == 200, booking.text
    reference = booking.json()["booking"]["reference"]

    dashboard = client.get("/clinician/dashboard")
    assert dashboard.status_code == 200, dashboard.text
    rows = dashboard.json()["appointments"]
    row = next((r for r in rows if r["persona"] == user_id), None)
    assert row is not None, f"account persona {user_id} missing from clinician dashboard: {rows}"
    assert row["booking"]["reference"] == reference

    # The clinician demo workspace can open this account's visit purely by persona.
    opened = client.get("/clinician/visit", params={"persona": user_id})
    assert opened.status_code == 200, opened.text
    assert opened.json()["patient"]["name"] == "TS ClinDash"
