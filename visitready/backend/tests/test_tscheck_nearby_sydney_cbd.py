"""Criterion: Search Sydney CBD, NSW — 5km shows Town Hall, Surry Hills, Bondi Junction;
10km adds St Leonards and Chatswood."""


def test_sydney_cbd_5km(client):
    resp = client.get("/clinics/nearby", params={"location": "Sydney CBD, NSW", "radius_km": 5})
    assert resp.status_code == 200, resp.text
    body = resp.json()
    names = [c["name"] for c in body["clinics"]]
    assert names == ["Town Hall Medical Centre", "Surry Hills Mind & Body", "Bondi Junction Health"], names


def test_sydney_cbd_10km_adds_st_leonards_and_chatswood(client):
    resp = client.get("/clinics/nearby", params={"location": "Sydney CBD, NSW", "radius_km": 10})
    assert resp.status_code == 200, resp.text
    body = resp.json()
    names = [c["name"] for c in body["clinics"]]
    for extra in ["St Leonards Skin Clinic", "Chatswood Village GP"]:
        assert extra in names, f"missing {extra} in 10km results: {names}"
