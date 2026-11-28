"""Browser relay: when a provider refuses the server, the visitor's browser fetches for it."""

import json
from typing import Any

import httpx
import pytest

from app.services import history_service
from app.services.relay import ProviderRequest, RelayHub
from tests.helpers import api_client, make_settings, mock_transport, open_meteo_payloads
from tests.test_history import NOW, archive_payload, transport

PLACE = {"lat": 28.61, "lon": 77.21}


def refusing(calls: list[httpx.Request]) -> httpx.MockTransport:
    def handler(request: httpx.Request) -> httpx.Response:
        calls.append(request)
        return httpx.Response(429, json={"reason": "Minutely API request limit exceeded"})

    return httpx.MockTransport(handler)


def answers(relay: list[dict[str, Any]], live: httpx.MockTransport) -> list[dict[str, Any]]:
    """What the browser would fetch: each requested URL, answered by the healthy mock provider."""
    out = []
    for item in relay:
        response = live.handle_request(httpx.Request("GET", item["url"], params=item["params"]))
        out.append({**item, "data": response.json()})
    return out


async def test_refused_provider_is_relayed_through_the_browser() -> None:
    calls: list[httpx.Request] = []
    live = mock_transport(*open_meteo_payloads())
    async with api_client(transport=refusing(calls)) as client:
        first = await client.get("/api/air", params=PLACE)
        assert first.status_code == 502
        relay = first.json()["relay"]
        assert {item["url"] for item in relay} == {
            "https://air-quality-api.open-meteo.com/v1/air-quality",
            "https://api.open-meteo.com/v1/forecast",
        }
        receipt = await client.post("/api/relay", json={"responses": answers(relay, live)})
        assert receipt.status_code == 200
        relay_id = receipt.json()["id"]

        report = await client.get("/api/air", params=PLACE, headers={"X-Relay-Id": relay_id})
        assert report.status_code == 200
        assert report.json()["current"]["pm2_5"] == 150.0

        # The provider is backed off: the next visitor is asked to relay without the server trying.
        attempts = len(calls)
        other = await client.get("/api/air", params=PLACE)
        assert other.status_code == 502 and other.json()["relay"]
        assert len(calls) == attempts


async def test_relayed_data_never_reaches_other_visitors() -> None:
    calls: list[httpx.Request] = []
    async with api_client(transport=refusing(calls)) as client:
        relay = (await client.get("/api/air", params=PLACE)).json()["relay"]
        forged = answers(relay, mock_transport(*open_meteo_payloads(pm25=999.0)))
        relay_id = (await client.post("/api/relay", json={"responses": forged})).json()["id"]
        assert (await client.get("/api/air", params=PLACE, headers={"X-Relay-Id": relay_id})).status_code == 200
        # Without that private id nothing was cached: another visitor still gets a relay request.
        assert (await client.get("/api/air", params=PLACE)).status_code == 502
        unknown = await client.get("/api/air", params=PLACE, headers={"X-Relay-Id": "x" * 22})
        assert unknown.status_code == 502


@pytest.mark.parametrize(
    "body",
    [
        {"responses": [{"url": "https://evil.example/api", "params": {}, "data": {}}]},
        {"responses": []},
        {"id": "short", "responses": [{"url": "https://api.open-meteo.com/v1/forecast", "params": {}, "data": {}}]},
    ],
)
async def test_relay_accepts_only_known_providers(body: dict[str, Any]) -> None:
    async with api_client() as client:
        assert (await client.post("/api/relay", json=body)).status_code == 422


async def test_relay_body_has_its_own_size_cap() -> None:
    big = {"url": "https://api.open-meteo.com/v1/forecast", "params": {}, "data": {"x": "y" * 5000}}
    async with api_client(settings=make_settings(max_body_bytes=1000, max_relay_bytes=2000)) as client:
        assert (await client.post("/api/relay", json={"responses": [big]})).status_code == 413
    async with api_client(settings=make_settings(max_body_bytes=1000)) as client:
        assert (await client.post("/api/relay", json={"responses": [big]})).status_code == 200


async def test_history_asks_the_browser_for_the_archive_in_the_background(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(history_service, "utc_now", lambda: NOW)
    calls: list[httpx.Request] = []
    live = transport()
    params = {**PLACE, "days": 7}
    async with api_client(transport=refusing(calls)) as client:
        first = await client.get("/api/history", params=params)
        receipt = await client.post("/api/relay", json={"responses": answers(first.json()["relay"], live)})
        relay_id = receipt.json()["id"]
        pending = await client.get("/api/history", params=params, headers={"X-Relay-Id": relay_id})
        assert pending.status_code == 200 and pending.json()["long_term_pending"] is True
        wanted = json.loads(pending.headers["X-Relay-Wanted"])
        assert [item["url"] for item in wanted] == [history_service.ARCHIVE_URL]
        await client.post(
            "/api/relay",
            json={"id": relay_id, "responses": [{**wanted[0], "data": archive_payload()}]},
        )
        done = await client.get("/api/history", params=params, headers={"X-Relay-Id": relay_id})
    assert done.json()["long_term_pending"] is False
    assert done.json()["long_term"]["hottest_day"]["value"] == 47.2


def test_hub_expires_and_caps_entries() -> None:
    now = [0.0]
    hub = RelayHub(ttl_s=10, max_ids=2, max_bytes_per_id=100, clock=lambda: now[0])
    request = ProviderRequest.of("https://api.open-meteo.com/v1/forecast", {"latitude": 1})
    first = hub.add(None, [(request, {"a": 1})])
    assert hub.get(first) == {request.key: {"a": 1}}
    hub.add(None, [(request, {"b": 1})])
    hub.add(None, [(request, {"c": 1})])
    assert hub.get(first) is None  # evicted past max_ids
    with pytest.raises(ValueError):
        hub.add(None, [(request, {"x": "y" * 200})])
    kept = hub.add(None, [(request, {"d": 1})])
    now[0] = 11
    assert hub.get(kept) is None
    hub.block("https://air-quality-api.open-meteo.com/v1/air-quality")
    assert hub.blocked("https://archive-api.open-meteo.com/v1/archive")
    assert not hub.blocked("https://photon.komoot.io/api/")


async def test_history_asks_for_missing_air_in_the_background(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(history_service, "utc_now", lambda: NOW)
    calls: list[httpx.Request] = []
    params = {**PLACE, "days": 7}
    async with api_client(transport=refusing(calls)) as client:
        relay = (await client.get("/api/history", params=params)).json()["relay"]
        weather_only = [item for item in answers(relay, transport()) if "air-quality" not in item["url"]]
        relay_id = (await client.post("/api/relay", json={"responses": weather_only})).json()["id"]
        report = await client.get("/api/history", params=params, headers={"X-Relay-Id": relay_id})
    assert report.status_code == 200
    wanted = json.loads(report.headers["X-Relay-Wanted"])
    assert "https://air-quality-api.open-meteo.com/v1/air-quality" in [item["url"] for item in wanted]
