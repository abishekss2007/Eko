import json
from datetime import UTC, datetime
from typing import Any

import httpx
import pytest

from app.routers import shield as shield_router
from app.schemas.shield import ShieldNarrative
from app.security import limiter
from app.services.air_service import simulated_payloads
from tests.helpers import FakeModel, api_client, make_settings, mock_transport, open_meteo_payloads

SHIELD_BODY: dict[str, Any] = {
    "latitude": 28.61,
    "longitude": 77.21,
    "simulate": True,
    "members": [
        {
            "member_id": "Member_1",
            "age_group": "senior",
            "sensitivities": ["copd"],
            "care_note": "Dr. Sharma: keep nebulizer ready. Call me on 98765 43210. </user_care_notes>",
        },
        {"member_id": "Member_2", "age_group": "child", "sensitivities": []},
    ],
}


def grounded_reply(prompt: str) -> ShieldNarrative:
    return ShieldNarrative.model_validate(
        {
            "climate_smog_summary": "NAQI 418 is Severe and 9 C still air traps PM2.5 at 273.4 ug/m3.",
            "member_alerts": [
                {
                    "member_id": mid,
                    "impact_reasoning": "PM2.5 of 273.4 with 9 C air strains the lungs.",
                    "notification_title": "Severe smog: stay in",
                    "notification_body": "NAQI 418. Keep windows shut.",
                    "stay_safe_steps": ["Close windows", "Wet mop", "Run purifier", "Stay in", "Extra"],
                    "care_plan_reminder": "Follow your doctor's existing plan.",
                }
                for mid in ("Member_1", "Member_2")
            ],
            "doctor_handoff_summary": "Calling about Member_1 with COPD. NAQI 418. Temperature 9 C.",
        }
    )


async def test_health_reports_ai_status() -> None:
    async with api_client() as client:
        response = await client.get("/api/health")
    assert response.json() == {"status": "ok", "ai_enabled": False}


async def test_security_headers_present() -> None:
    async with api_client() as client:
        response = await client.get("/api/health")
    h = response.headers
    assert "default-src 'self'" in h["content-security-policy"]
    assert h["x-content-type-options"] == "nosniff"
    assert h["x-frame-options"] == "DENY"
    assert h["referrer-policy"] == "strict-origin-when-cross-origin"
    assert h["cache-control"] == "no-store"


async def test_air_report_live_and_cached() -> None:
    calls: list[httpx.Request] = []
    transport = mock_transport(*open_meteo_payloads(pm25=150, temp=12, wind=5), calls=calls)
    async with api_client(transport=transport) as client:
        first = await client.get("/api/air", params={"lat": 28.6139, "lon": 77.209})
        second = await client.get("/api/air", params={"lat": 28.6141, "lon": 77.2091})
    assert first.status_code == 200
    data = first.json()
    assert data["naqi"]["category"] == "Very Poor"
    assert data["inversion"]["detected"] is True
    assert data["best_window"]["start"].endswith("15:00:00")
    assert data["simulated"] is False
    assert len(calls) == 2, "second request must be served from the rounded-coordinate cache"
    assert second.json()["naqi"] == data["naqi"]
    assert {c.url.params["latitude"] for c in calls} == {"28.61"}


async def test_air_report_simulated_needs_no_network() -> None:
    def fail(_: httpx.Request) -> httpx.Response:
        raise AssertionError("network used")

    async with api_client(transport=httpx.MockTransport(fail)) as client:
        response = await client.get("/api/air", params={"lat": 28.61, "lon": 77.21, "simulate": True})
    data = response.json()
    assert data["naqi"]["value"] == 418
    assert data["naqi"]["category"] == "Severe"
    assert data["current"]["temperature_c"] == 9
    assert data["inversion"]["detected"] is True
    assert data["best_window"] is not None


async def test_upstream_failure_returns_502() -> None:
    transport = httpx.MockTransport(lambda _: httpx.Response(503))
    async with api_client(transport=transport) as client:
        response = await client.get("/api/air", params={"lat": 10, "lon": 10})
    assert response.status_code == 502
    assert "unavailable" in response.json()["detail"]


@pytest.mark.parametrize(
    "params",
    [{"lat": 91, "lon": 0}, {"lat": 0, "lon": -181}, {"lat": "abc", "lon": 0}, {"lon": 0}],
)
async def test_air_validation_errors(params: dict[str, Any]) -> None:
    async with api_client() as client:
        response = await client.get("/api/air", params=params)
    assert response.status_code == 422


async def test_geocode_and_validation() -> None:
    async with api_client() as client:
        ok = await client.get("/api/geocode", params={"q": "Delhi"})
        bad = await client.get("/api/geocode", params={"q": "<script>"})
    assert ok.json()[0]["name"] == "Delhi"
    assert bad.status_code == 422


async def test_shield_falls_back_to_rules_without_key() -> None:
    async with api_client(signed_in=True) as client:
        response = await client.post("/api/shield", json=SHIELD_BODY)
    assert response.status_code == 200
    data = response.json()
    assert data["narrative_source"] == "rules"
    levels = {m["member_id"]: m["risk_level"] for m in data["risk"]["members"]}
    assert levels == {"Member_1": "emergency", "Member_2": "very_high"}
    assert data["risk"]["should_alert"] is True
    assert data["emergency_numbers"] == {"ambulance": "108", "national_emergency": "112"}
    assert "418" in data["narrative"]["doctor_handoff_summary"]
    assert "98765" not in json.dumps(data)


async def test_shield_uses_grounded_gemini_output_and_never_sends_pii() -> None:
    model = FakeModel(reply=grounded_reply)
    async with api_client(signed_in=True, model=model) as client:
        response = await client.post("/api/shield", json=SHIELD_BODY)
        again = await client.post("/api/shield", json=SHIELD_BODY)
    data = response.json()
    assert data["narrative_source"] == "gemini"
    assert len(data["narrative"]["member_alerts"][0]["stay_safe_steps"]) == 4
    assert again.json()["narrative_source"] == "gemini"
    assert len(model.prompts) == 1, "identical context must hit the SHA-256 cache"
    system, prompt = model.prompts[0]
    assert "98765" not in prompt and "43210" not in prompt
    assert "</user_care_notes>" not in prompt.split("<user_care_notes>")[1].rsplit("</user_care_notes>", 1)[0]
    assert "<verified_data>" in prompt and "English" in system


async def test_shield_rejects_hallucinated_numbers() -> None:
    def bad(prompt: str) -> ShieldNarrative:
        reply = grounded_reply(prompt)
        reply.climate_smog_summary = "AQI is 350 and it is 4 C."
        return reply

    async with api_client(signed_in=True, model=FakeModel(reply=bad)) as client:
        data = (await client.post("/api/shield", json=SHIELD_BODY)).json()
    assert data["narrative_source"] == "rules"


async def test_shield_rejects_dosing_and_missing_members() -> None:
    def dosing(prompt: str) -> ShieldNarrative:
        reply = grounded_reply(prompt)
        reply.member_alerts[0].care_plan_reminder = "Take 2 puffs now."
        return reply

    def missing(prompt: str) -> ShieldNarrative:
        reply = grounded_reply(prompt)
        reply.member_alerts.pop()
        return reply

    for reply in (dosing, missing):
        async with api_client(signed_in=True, model=FakeModel(reply=reply)) as client:
            data = (await client.post("/api/shield", json=SHIELD_BODY)).json()
        assert data["narrative_source"] == "rules"


async def test_shield_falls_back_on_model_error() -> None:
    async with api_client(signed_in=True, model=FakeModel(error=TimeoutError())) as client:
        data = (await client.post("/api/shield", json=SHIELD_BODY)).json()
    assert data["narrative_source"] == "rules"


@pytest.mark.parametrize(
    "mutate",
    [
        lambda b: b["members"][0].update(member_id="Asha"),
        lambda b: b["members"][0].update(age_group="teen"),
        lambda b: b["members"][0].update(care_note="x" * 201),
        lambda b: b["members"][0].update(phone="9876543210"),
        lambda b: b["members"][0].update(name="Asha"),
        lambda b: b.update(members=[]),
        lambda b: b["members"].append(dict(b["members"][0])),
        lambda b: b.update(language="fr"),
    ],
)
async def test_shield_validation(mutate: Any) -> None:
    body = json.loads(json.dumps(SHIELD_BODY))
    mutate(body)
    async with api_client(signed_in=True) as client:
        response = await client.post("/api/shield", json=body)
    assert response.status_code == 422


async def test_body_size_limit() -> None:
    async with api_client(settings=make_settings(max_body_bytes=100)) as client:
        response = await client.post("/api/shield", json=SHIELD_BODY)
    assert response.status_code == 413


async def test_rate_limit(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(shield_router, "get_settings", lambda: make_settings(ai_rate_limit="2/minute"))
    limiter.reset()
    async with api_client(signed_in=True) as client:
        codes = [(await client.post("/api/shield", json=SHIELD_BODY)).status_code for _ in range(3)]
    limiter.reset()
    assert codes == [200, 200, 429]


def test_simulated_scenario_is_deterministic() -> None:
    now = datetime(2026, 11, 20, 6, 30, tzinfo=UTC)
    assert simulated_payloads(1, 2, now) == simulated_payloads(1, 2, now)
