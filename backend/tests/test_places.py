"""Worldwide place search: query parsing, both geocoders, merging and failure handling."""

from typing import Any

import httpx

from app.schemas.air import GeocodeResult
from app.services import places
from tests.helpers import api_client


def _om(name: str, lat: float, lon: float, **extra: Any) -> dict[str, Any]:
    return {"name": name, "latitude": lat, "longitude": lon, **extra}


def _photon(name: str, lat: float, lon: float, **props: Any) -> dict[str, Any]:
    return {"geometry": {"coordinates": [lon, lat]}, "properties": {"name": name, **props}}


def test_split_query() -> None:
    assert places.split_query("Andheri West, Mumbai, India") == ("Andheri West", ["mumbai", "india"])
    assert places.split_query("Pune") == ("Pune", [])
    assert places.split_query(", Delhi") == ("Delhi", ["delhi"])


def test_from_open_meteo_skips_bad_items_and_keeps_district() -> None:
    data = {
        "results": [
            _om("Dwarka", 28.59, 77.05, admin2="South West Delhi", admin1="Delhi", country="India"),
            _om("Delhi", 28.65, 77.23, admin2="Delhi"),  # area equal to name is dropped
            {"name": "No coords"},
            _om("Bad", 95.0, 0.0),
            _om("Flag", True, 0.0),
            "junk",
        ]
    }
    results = places.from_open_meteo(data)
    assert [r.name for r in results] == ["Dwarka", "Delhi"]
    assert results[0].area == "South West Delhi"
    assert results[1].area is None


def test_from_photon_reads_lon_lat_and_falls_back_to_street() -> None:
    data = {
        "features": [
            _photon("India Gate", 28.6129, 77.2295, city="New Delhi", state="Delhi", country="India"),
            {"geometry": {"coordinates": [72.83, 18.93]}, "properties": {"street": "Marine Drive", "city": "Mumbai"}},
            {"geometry": {"coordinates": [1]}, "properties": {"name": "Short"}},
            {"geometry": {"coordinates": [0, 0]}, "properties": {}},
            "junk",
        ]
    }
    results = places.from_photon(data)
    assert [(r.name, r.area) for r in results] == [("India Gate", "New Delhi"), ("Marine Drive", "Mumbai")]
    assert results[0].latitude == 28.6129 and results[0].longitude == 77.2295


def test_partition_by_qualifier() -> None:
    a = GeocodeResult(name="Aurangabad", admin1="Maharashtra", country="India", latitude=19.9, longitude=75.3)
    b = GeocodeResult(name="Aurangabad", admin1="Bihar", country="India", latitude=24.8, longitude=84.4)
    hits, rest = places.partition([a, b], ["bihar"])
    assert hits == [b] and rest == [a]


def test_merge_drops_near_duplicates_and_caps() -> None:
    delhi = GeocodeResult(name="Delhi", latitude=28.65, longitude=77.23)
    delhi_osm = GeocodeResult(name="delhi", latitude=28.66, longitude=77.22)
    delhi_ontario = GeocodeResult(name="Delhi", latitude=42.85, longitude=-80.5)
    assert places.merge([delhi], [delhi_osm, delhi_ontario]) == [delhi, delhi_ontario]
    many = [GeocodeResult(name=f"P{i}", latitude=i, longitude=0) for i in range(20)]
    assert len(places.merge(many)) == places.MAX_RESULTS


async def test_geocode_merges_both_sources() -> None:
    async with api_client() as client:
        response = await client.get("/api/geocode", params={"q": "Connaught Place"})
    names = [r["name"] for r in response.json()]
    # Open-Meteo's Delhi first, Photon's Connaught Place added, Photon's own Delhi deduplicated.
    assert names == ["Delhi", "Connaught Place"]
    assert response.json()[1]["area"] == "New Delhi"


def _transport(om: httpx.Response | None, photon: httpx.Response | None, calls: list[httpx.Request]) -> Any:
    def handler(request: httpx.Request) -> httpx.Response:
        calls.append(request)
        response = om if request.url.host.startswith("geocoding") else photon
        if response is None:
            raise httpx.ConnectError("down")
        return response

    return httpx.MockTransport(handler)


async def test_geocode_survives_one_provider_down_and_uses_qualifiers() -> None:
    calls: list[httpx.Request] = []
    om = httpx.Response(
        200,
        json={
            "results": [
                _om("Aurangabad", 19.88, 75.34, admin1="Maharashtra", country="India"),
                _om("Aurangabad", 24.75, 84.37, admin1="Bihar", country="India"),
            ]
        },
    )
    async with api_client(transport=_transport(om, None, calls)) as client:
        response = await client.get("/api/geocode", params={"q": "Aurangabad, Bihar"})
    assert response.status_code == 200
    assert [r["admin1"] for r in response.json()] == ["Bihar", "Maharashtra"]
    om_call = next(c for c in calls if c.url.host.startswith("geocoding"))
    assert om_call.url.params["name"] == "Aurangabad"


async def test_geocode_fails_only_when_both_providers_fail() -> None:
    calls: list[httpx.Request] = []
    async with api_client(transport=_transport(None, httpx.Response(500), calls)) as client:
        response = await client.get("/api/geocode", params={"q": "Nowhere"})
    assert response.status_code == 502


async def test_geocode_is_cached_case_and_space_insensitive() -> None:
    calls: list[httpx.Request] = []
    ok = httpx.Response(200, json={"results": [_om("Pune", 18.52, 73.86)]})
    async with api_client(transport=_transport(ok, httpx.Response(200, json={"features": []}), calls)) as client:
        await client.get("/api/geocode", params={"q": "Pune"})
        await client.get("/api/geocode", params={"q": "  pune "})
    assert len(calls) == 2  # one call per provider, then the cache


async def test_geocode_accepts_landmark_punctuation() -> None:
    async with api_client() as client:
        response = await client.get("/api/geocode", params={"q": "IIT (Delhi) & Hauz Khas/Green Park"})
    assert response.status_code == 200
