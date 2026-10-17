"""Criterion: guest gets a suggestion from POST /api/pathway/suggest without any
persistence — the persona's own /api/visit record (and personas/clinics data)
must stay untouched, since guests only get asked to sign in before anything
is saved server-side."""

import httpx

PERSONA = "alex"


def test_pathway_suggest_does_not_persist_to_visit(client: httpx.Client):
    # Baseline: reset then capture visit state for persona.
    reset_resp = client.post("/visit/reset", params={"persona": PERSONA})
    assert reset_resp.status_code == 200, reset_resp.text
    before = client.get("/visit", params={"persona": PERSONA})
    assert before.status_code == 200
    before_json = before.json()
    assert before_json["questionnaire"] is None
    assert before_json["booking"] is None

    body = {
        "main_concern": "tscheck-guest Dry cough that won't go away",
        "duration": "more than 3 weeks",
        "consulted_before": "no",
        "referral": "",
        "location": "Carlton VIC 3053",
        "preference": "in_person",
        "consent_reuse": True,
    }
    suggest_resp = client.post("/pathway/suggest", json=body)
    assert suggest_resp.status_code == 200, suggest_resp.text
    suggestion = suggest_resp.json()
    assert "service_name" in suggestion and suggestion["service_name"]

    # The persona's visit record must be unchanged by the guest call.
    after = client.get("/visit", params={"persona": PERSONA})
    assert after.status_code == 200
    after_json = after.json()
    assert after_json["questionnaire"] is None, "guest pathway suggestion leaked into persisted visit"
    assert after_json["booking"] is None
