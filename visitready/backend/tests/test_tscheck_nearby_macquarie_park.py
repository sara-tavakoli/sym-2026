"""Criterion: Search Macquarie Park, NSW returns geographically appropriate clinics,
nearest-first, with straight-line distances, and no Melbourne clinics at 10km."""


def test_macquarie_park_nearest_first_10km(client):
    resp = client.get("/clinics/nearby", params={"location": "Macquarie Park, NSW", "radius_km": 10})
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["distance_method"] == "straight-line"
    names_and_dist = [(c["name"], c["distance_km"]) for c in body["clinics"]]
    expected_order = [
        "Macquarie Park Family Practice",
        "North Ryde Movement Physio",
        "Epping Smile Dental",
        "Chatswood Village GP",
        "St Leonards Skin Clinic",
    ]
    actual_names = [n for n, _ in names_and_dist]
    assert actual_names == expected_order, f"unexpected order/content: {actual_names}"
    # distances roughly match the briefing (within 0.5km tolerance)
    expected_dist = {
        "Macquarie Park Family Practice": 0.6,
        "North Ryde Movement Physio": 1.7,
        "Epping Smile Dental": 4.2,
        "Chatswood Village GP": 5.3,
        "St Leonards Skin Clinic": 8.0,
    }
    for name, dist in names_and_dist:
        assert abs(dist - expected_dist[name]) <= 0.5, f"{name} distance {dist} off from {expected_dist[name]}"
    # no Melbourne clinics present
    melbourne_ids = {"carlton-family", "fitzroy-health", "brunswick-dental"}
    returned_ids = {c["id"] for c in body["clinics"]}
    assert returned_ids.isdisjoint(melbourne_ids), f"unexpected Melbourne clinics: {returned_ids & melbourne_ids}"
