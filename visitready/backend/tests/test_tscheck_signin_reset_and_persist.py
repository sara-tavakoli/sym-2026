"""Criteria: 'Sign-in carries over and starts fresh' + 'Fresh sign-in without
guest data'. Each sign-in calls POST /api/visit/reset for that persona, so a
persona's visit record starts empty, then a real questionnaire+booking
(what the sign-in flow performs under the hood) persists correctly, and a
subsequent reset clears it again — proving the reset/persist contract the
frontend relies on for both carry-over and fresh sign-in."""

import httpx

PERSONA = "priya"


def _get_a_slot(client: httpx.Client):
    clinics = client.get("/clinics")
    assert clinics.status_code == 200
    data = clinics.json()
    clinic = next(c for c in data if c["slots"])
    slot = clinic["slots"][0]
    service_id = clinic["services"][0]
    return clinic["id"], slot["id"], service_id


def test_reset_gives_empty_visit(client: httpx.Client):
    resp = client.post("/visit/reset", params={"persona": PERSONA})
    assert resp.status_code == 200, resp.text
    v = resp.json()
    assert v["questionnaire"] is None
    assert v["booking"] is None
    assert v["brief"] is None
    assert v["tasks"] == []


def test_questionnaire_and_booking_persist_then_reset_clears(client: httpx.Client):
    # Start clean.
    client.post("/visit/reset", params={"persona": PERSONA})

    q_body = {
        "main_concern": "tscheck-carryover A mole on my back looks darker",
        "duration": "several months",
        "consulted_before": "no",
        "referral": "",
        "location": "Brunswick VIC 3056",
        "preference": "in_person",
        "consent_reuse": True,
    }
    q_resp = client.post("/visit/questionnaire", json=q_body, params={"persona": PERSONA})
    assert q_resp.status_code == 200, q_resp.text
    assert q_resp.json()["questionnaire"]["main_concern"] == q_body["main_concern"]

    clinic_id, slot_id, service_id = _get_a_slot(client)
    booking_resp = client.post(
        "/visit/booking",
        json={"clinic_id": clinic_id, "slot_id": slot_id, "service_id": service_id},
        params={"persona": PERSONA},
    )
    assert booking_resp.status_code == 200, booking_resp.text
    booked = booking_resp.json()
    assert booked["booking"]["slot_id"] == slot_id

    # Carry-over: data really persisted server-side for this persona.
    fetched = client.get("/visit", params={"persona": PERSONA})
    assert fetched.status_code == 200
    assert fetched.json()["booking"]["slot_id"] == slot_id
    assert fetched.json()["questionnaire"]["main_concern"] == q_body["main_concern"]

    # Fresh sign-in: reset wipes it again, proving the empty-state guarantee.
    reset_again = client.post("/visit/reset", params={"persona": PERSONA})
    assert reset_again.status_code == 200
    cleared = reset_again.json()
    assert cleared["booking"] is None
    assert cleared["questionnaire"] is None
