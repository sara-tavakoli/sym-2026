"""Criterion: Explicit confirmation only, no duplicates — confirming the same
slot twice (the frontend's "Confirm booking" button is disabled while pending,
but a network retry or double-submit must still be safe) must produce exactly
one appointment with one stable reference, not two bookings."""

import time

import httpx

from .conftest import attach_session


def _get_a_slot(client: httpx.Client):
    clinics = client.get("/clinics")
    assert clinics.status_code == 200
    data = clinics.json()
    clinic = next(c for c in data if c["slots"])
    return clinic["id"], clinic["slots"][0]["id"], clinic["services"][0]


def test_repeated_confirm_is_idempotent(client: httpx.Client):
    email = f"tscheck-idempotent-{int(time.time() * 1000)}@example.com"
    signup = client.post("/auth/signup", json={"email": email, "password": "Passw0rd1"})
    assert signup.status_code == 200, signup.text
    attach_session(signup, client)
    user_id = signup.json()["user_id"]

    profile = client.put(
        "/auth/profile",
        json={"full_name": "TS Idempotent", "date_of_birth": "1990-01-01", "mobile": "0412345678",
              "preferred_name": "", "gender": ""},
    )
    assert profile.status_code == 200, profile.text

    clinic_id, slot_id, service_id = _get_a_slot(client)
    body = {"clinic_id": clinic_id, "slot_id": slot_id, "service_id": service_id}

    first = client.post("/visit/booking", json=body, params={"persona": user_id})
    assert first.status_code == 200, first.text
    ref1 = first.json()["booking"]["reference"]
    assert ref1

    # Explicit second "Confirm booking" for the exact same slot — must not create
    # a second appointment or change the reference.
    second = client.post("/visit/booking", json=body, params={"persona": user_id})
    assert second.status_code == 200, second.text
    ref2 = second.json()["booking"]["reference"]
    assert ref2 == ref1, "repeated confirm created a different/duplicate appointment reference"

    # The visit still shows exactly one booking (a single `booking` object, not a list).
    visit = client.get("/visit", params={"persona": user_id})
    assert visit.status_code == 200
    assert visit.json()["booking"]["reference"] == ref1
