"""Criterion: Geocoding failure is clear — unresolvable location returns 404 with a
helpful message (no misleading clinic list), and an invalid radius_km returns 422."""


def test_unresolvable_location_returns_404(client):
    resp = client.get("/clinics/nearby", params={"location": "zzqqxx nowhere"})
    assert resp.status_code == 404, resp.text
    detail = resp.json()["detail"]
    assert "zzqqxx nowhere" in detail
    assert "Australia" in detail


def test_unresolvable_location_with_bad_radius_still_422_on_radius(client):
    # radius validation and location validation are independent; invalid radius is rejected
    # regardless of location resolvability.
    resp = client.get("/clinics/nearby", params={"location": "zzqqxx nowhere", "radius_km": 7})
    assert resp.status_code == 422, resp.text
    assert "radius_km" in resp.json()["detail"]
