from typing import Any

import pytest
from pydantic import BaseModel

from app.schemas.planner import ActionNarrative, CivicDraft, PlanNarrative
from app.services.narrator import collect_texts
from tests.helpers import FakeModel, api_client

BASE: dict[str, Any] = {"latitude": 28.61, "longitude": 77.21, "simulate": True}
INDOOR: dict[str, Any] = {
    **BASE,
    "room": {"length_m": 4, "width_m": 3.5, "height_m": 3},
    "cooking_fuel": "lpg",
    "ventilation": "windows_open_daytime",
    "incense_or_coil": True,
    "sweeping": "dry",
    "purifier_cadr_m3h": 150,
    "filter_age_months": 9,
    "budget_tier": "under_5000",
}
COMMUTE: dict[str, Any] = {**BASE, "distance_km": 12, "current_mode": "car_petrol_solo", "departure": "09:00"}
CIVIC: dict[str, Any] = {
    **BASE,
    "kind": "burning_report",
    "locality": "Sector 62",
    "observation": "Garbage burnt near the park every evening at 7. Call 98765 43210 <b>",
}
PLAN: dict[str, Any] = {
    **BASE,
    "members": [{"member_id": "Member_1", "age_group": "senior", "sensitivities": ["copd"]}],
}


async def test_plan_rules_fallback() -> None:
    async with api_client(signed_in=True) as client:
        data = (await client.post("/api/plan", json=PLAN)).json()
    assert data["plan"]["stance"] == "stay_in"
    assert data["plan"]["stay_indoors"] == ["Member_1"]
    assert data["narrative_source"] == "rules"
    assert "Member_1" in data["narrative"]["headline"]


async def test_plan_without_members() -> None:
    async with api_client(signed_in=True) as client:
        data = (await client.post("/api/plan", json={**BASE, "members": []})).json()
    assert data["plan"]["stay_indoors"] == []


async def test_indoor_and_commute_rules() -> None:
    async with api_client(signed_in=True) as client:
        indoor = (await client.post("/api/indoor", json=INDOOR)).json()
        commute = (await client.post("/api/commute", json=COMMUTE)).json()
    assert indoor["assessment"]["required_cadr_m3h"] == 210
    assert len(indoor["narrative"]["explanations"]) == len(indoor["assessment"]["fixes"])
    assert commute["plan"]["recommended"]["mode"] == "metro"
    assert commute["plan"]["factors"]["formula_dose"].startswith("inhaled_dose_ug")
    assert "%" in commute["narrative"]["summary"]


async def test_civic_draft_strips_contacts_and_tags() -> None:
    async with api_client(signed_in=True) as client:
        data = (await client.post("/api/civic", json=CIVIC)).json()
    body = data["draft"]["body"]
    assert "418" in body and "Sector 62" in body
    assert "98765" not in body and "<b>" not in body


@pytest.mark.parametrize(
    ("path", "body"),
    [
        ("/api/indoor", {**INDOOR, "room": {"length_m": 0, "width_m": 3, "height_m": 3}}),
        ("/api/indoor", {**INDOOR, "budget_tier": "unlimited"}),
        ("/api/commute", {**COMMUTE, "departure": "25:00"}),
        ("/api/commute", {**COMMUTE, "distance_km": 500}),
        ("/api/commute", {**COMMUTE, "current_mode": "helicopter"}),
        ("/api/civic", {**CIVIC, "observation": "x" * 301}),
        ("/api/civic", {**CIVIC, "kind": "anything"}),
        ("/api/plan", {**PLAN, "members": [{"member_id": "Asha", "age_group": "adult"}]}),
    ],
)
async def test_planner_validation(path: str, body: dict[str, Any]) -> None:
    async with api_client(signed_in=True) as client:
        assert (await client.post(path, json=body)).status_code == 422


def _reply(schema_output: BaseModel) -> FakeModel:
    return FakeModel(reply=lambda _prompt: schema_output)


async def test_grounded_gemini_outputs_are_used() -> None:
    plan_reply = PlanNarrative(
        headline="Severe smog, NAQI 418: keep Member_1 inside.", steps=["Go out 14:00 to 16:00 only."]
    )
    civic_reply = CivicDraft(subject="Burning in Sector 62", body="NAQI is 418. Burning at 7 must stop.")
    async with api_client(signed_in=True, model=_reply(plan_reply)) as client:
        assert (await client.post("/api/plan", json=PLAN)).json()["narrative_source"] == "gemini"
    async with api_client(signed_in=True, model=_reply(civic_reply)) as client:
        assert (await client.post("/api/civic", json=CIVIC)).json()["narrative_source"] == "gemini"


async def test_gemini_rejected_for_invented_numbers_or_wrong_shape() -> None:
    invented = PlanNarrative(headline="AQI 999, keep Member_1 inside.", steps=["Stay in."])
    omits_member = PlanNarrative(headline="Severe smog today.", steps=["Stay in."])
    wrong_count = ActionNarrative(summary="ok", impact_reasoning="ok", explanations=["only one"])
    async with api_client(signed_in=True, model=_reply(invented)) as client:
        assert (await client.post("/api/plan", json=PLAN)).json()["narrative_source"] == "rules"
    async with api_client(signed_in=True, model=_reply(omits_member)) as client:
        assert (await client.post("/api/plan", json=PLAN)).json()["narrative_source"] == "rules"
    async with api_client(signed_in=True, model=_reply(wrong_count)) as client:
        assert (await client.post("/api/indoor", json=INDOOR)).json()["narrative_source"] == "rules"
        assert (await client.post("/api/commute", json=COMMUTE)).json()["narrative_source"] == "rules"


async def test_untrusted_input_is_delimited_in_prompt() -> None:
    model = FakeModel(error=TimeoutError())
    async with api_client(signed_in=True, model=model) as client:
        await client.post("/api/civic", json=CIVIC)
    system, prompt = model.prompts[0]
    inside = prompt.split("<user_input>")[1].split("</user_input>")[0]
    assert "Garbage burnt" in inside and "98765" not in prompt
    assert "<user_input>" in system


def test_collect_texts_walks_nested_models() -> None:
    assert collect_texts(PlanNarrative(headline="a", steps=["b", "c"])) == ["a", "b", "c"]
