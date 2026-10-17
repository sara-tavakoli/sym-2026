"""Criterion: Radius chips change result counts correctly; 20/50 km include
Parramatta Family Doctors (~12km from Macquarie Park); invalid radius_km rejected."""

import pytest


def test_radius_20_and_50_include_parramatta(client):
    for radius in (20, 50):
        resp = client.get("/clinics/nearby", params={"location": "Macquarie Park, NSW", "radius_km": radius})
        assert resp.status_code == 200, resp.text
        body = resp.json()
        names = [c["name"] for c in body["clinics"]]
        assert "Parramatta Family Doctors" in names, f"radius={radius} missing Parramatta: {names}"


def test_radius_5km_excludes_farther_clinics(client):
    resp = client.get("/clinics/nearby", params={"location": "Macquarie Park, NSW", "radius_km": 5})
    assert resp.status_code == 200, resp.text
    body = resp.json()
    names = [c["name"] for c in body["clinics"]]
    assert "Parramatta Family Doctors" not in names
    assert "St Leonards Skin Clinic" not in names, "8km clinic should be excluded at 5km radius"


@pytest.mark.parametrize("radius", [7, 1, 100])
def test_invalid_radius_rejected(client, radius):
    resp = client.get("/clinics/nearby", params={"location": "Sydney", "radius_km": radius})
    assert resp.status_code == 422, resp.text
    assert "radius_km" in resp.json()["detail"]
