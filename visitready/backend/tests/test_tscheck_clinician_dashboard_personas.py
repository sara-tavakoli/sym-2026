"""Criterion: Clinician area still works — /api/clinician/dashboard must list
both personas (Alex & Priya) regardless of patient sign-in state, and
/api/visit?persona=<id> must load a visit even when the patient side is
signed out (clinician consult workspace loads by persona, not by patient
session)."""

import httpx

PERSONAS = {"alex", "priya"}


def test_dashboard_lists_both_personas(client: httpx.Client):
    resp = client.get("/clinician/dashboard")
    assert resp.status_code == 200, resp.text
    data = resp.json()
    assert "clinician" in data and data["clinician"]
    appt_personas = {row["persona"] for row in data["appointments"]}
    assert PERSONAS.issubset(appt_personas), f"dashboard missing personas: {data}"


def test_visit_loads_for_persona_without_patient_session(client: httpx.Client):
    # The clinician consult workspace loads a visit purely by persona id in the
    # URL/query param — there is no patient auth header involved.
    for persona in PERSONAS:
        resp = client.get("/visit", params={"persona": persona})
        assert resp.status_code == 200, resp.text
        assert resp.json()["patient"]["name"]


def test_unknown_persona_rejected(client: httpx.Client):
    resp = client.get("/visit", params={"persona": "tscheck-unknown-persona"})
    assert resp.status_code == 404
