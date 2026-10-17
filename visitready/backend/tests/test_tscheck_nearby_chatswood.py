"""Criterion: Search Chatswood, NSW — 5km shows only Chatswood + St Leonards;
10km adds North Ryde, Macquarie Park, Town Hall, Epping in distance order."""


def test_chatswood_5km(client):
    resp = client.get("/clinics/nearby", params={"location": "Chatswood, NSW", "radius_km": 5})
    assert resp.status_code == 200, resp.text
    body = resp.json()
    names = [c["name"] for c in body["clinics"]]
    assert names == ["Chatswood Village GP", "St Leonards Skin Clinic"], names


def test_chatswood_10km_adds_more_in_distance_order(client):
    resp = client.get("/clinics/nearby", params={"location": "Chatswood, NSW", "radius_km": 10})
    assert resp.status_code == 200, resp.text
    body = resp.json()
    distances = [c["distance_km"] for c in body["clinics"]]
    assert distances == sorted(distances), f"clinics not sorted nearest-first: {distances}"
    names = [c["name"] for c in body["clinics"]]
    assert "Chatswood Village GP" in names
    for extra in ["North Ryde Movement Physio", "Macquarie Park Family Practice", "Town Hall Medical Centre", "Epping Smile Dental"]:
        assert extra in names, f"missing {extra} in 10km results: {names}"
