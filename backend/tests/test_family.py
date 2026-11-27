"""Family members are an account feature: guests are refused by the server, not just hidden in the UI."""

from typing import Any

import pytest

from app.services.family_service import DEMO_HOUSEHOLD
from tests.helpers import api_client, make_settings

PLACE: dict[str, Any] = {"latitude": 28.61, "longitude": 77.21, "simulate": True, "language": "en"}
MEMBER: dict[str, Any] = {
    "id": "6f1c2a9e-1",
    "name": "Asha",
    "age_group": "senior",
    "sensitivities": ["asthma", "asthma"],
    "care_note": "Keep inhaler close",
}
HOUSEHOLD: dict[str, Any] = {"members": [MEMBER], "doctor_phone": "+91 98765 43210", "hospital_phone": ""}
TOKENIZED = [{"member_id": "Member_1", "age_group": "senior", "sensitivities": ["asthma"]}]


async def test_guests_cannot_read_or_add_family_members() -> None:
    async with api_client() as client:
        read = await client.get("/api/family")
        save = await client.put("/api/family", json=HOUSEHOLD)
        shield = await client.post("/api/shield", json={**PLACE, "members": TOKENIZED})
        plan = await client.post("/api/plan", json={**PLACE, "members": TOKENIZED})
        general_plan = await client.post("/api/plan", json={**PLACE, "members": []})
    assert read.status_code == save.status_code == shield.status_code == plan.status_code == 401
    assert save.json()["detail"] == "Log in or sign up to add family members."
    assert general_plan.status_code == 200


async def test_signed_in_user_saves_and_reloads_family() -> None:
    async with api_client(signed_in=True) as client:
        assert (await client.get("/api/family")).json() == {"members": [], "doctor_phone": "", "hospital_phone": ""}
        saved = await client.put("/api/family", json=HOUSEHOLD)
        assert saved.status_code == 200
        loaded = (await client.get("/api/family")).json()
    assert loaded == saved.json()
    assert loaded["members"][0]["sensitivities"] == ["asthma"]
    assert loaded["doctor_phone"] == "+91 98765 43210"


async def test_each_account_sees_only_its_own_family() -> None:
    async with api_client(signed_in=True) as client:
        await client.put("/api/family", json=HOUSEHOLD)
        client.cookies.clear()
        other = {"name": "Neighbour", "email": "neighbour@example.com", "password": "other-pass-99"}
        assert (await client.post("/api/auth/signup", json=other)).status_code == 201
        assert (await client.get("/api/family")).json()["members"] == []


@pytest.mark.parametrize(
    "body",
    [
        {**HOUSEHOLD, "members": [{**MEMBER, "id": f"m{i}"} for i in range(11)]},
        {**HOUSEHOLD, "members": [MEMBER, MEMBER]},
        {**HOUSEHOLD, "members": [{**MEMBER, "age_group": "teen"}]},
        {**HOUSEHOLD, "members": [{**MEMBER, "phone": "9876543210"}]},
        {**HOUSEHOLD, "doctor_phone": "call me maybe"},
        {**HOUSEHOLD, "members": [{**MEMBER, "id": "<script>"}]},
    ],
)
async def test_family_validation(body: dict[str, Any]) -> None:
    async with api_client(signed_in=True) as client:
        assert (await client.put("/api/family", json=body)).status_code == 422


async def test_markup_is_stripped_and_cross_site_writes_blocked() -> None:
    async with api_client(signed_in=True) as client:
        body = {**HOUSEHOLD, "members": [{**MEMBER, "name": "<b>Asha</b>"}]}
        assert (await client.put("/api/family", json=body)).json()["members"][0]["name"] == "bAsha/b"
        cross = await client.put("/api/family", json=HOUSEHOLD, headers={"Origin": "https://evil.example"})
    assert cross.status_code == 403


async def test_guest_demo_uses_the_servers_sample_family_only() -> None:
    async with api_client() as client:
        demo = await client.post("/api/shield/demo", json=PLACE)
        own = await client.post("/api/shield/demo", json={**PLACE, "members": TOKENIZED})
    assert demo.status_code == 200
    assert [m["member_id"] for m in demo.json()["risk"]["members"]] == [
        f"Member_{i}" for i in range(1, len(DEMO_HOUSEHOLD.members) + 1)
    ]
    assert own.status_code == 422


async def test_demo_account_is_seeded_with_a_family() -> None:
    settings = make_settings(demo_account=True)
    async with api_client(settings=settings) as client:
        creds = (await client.get("/api/auth/demo")).json()
        assert creds == {"email": "demo@saanssafe.app", "password": "SaansSafe-Demo-2026"}
        assert (await client.post("/api/auth/login", json=creds)).status_code == 200
        family = (await client.get("/api/family")).json()
        assert [m["name"] for m in family["members"]] == ["Dadi", "Aarav", "Meera", "Raj"]
        assert (await client.post("/api/shield", json={**PLACE, "members": TOKENIZED})).status_code == 200

        # Seeding again (as on the next start) resets the demo family and keeps one account.
        await client.put("/api/family", json=HOUSEHOLD)
        app_family = client._transport.app.state.family_service  # type: ignore[attr-defined]
        await app_family.seed_demo(creds["email"], creds["password"])
        assert len((await client.get("/api/family")).json()["members"]) == 4


async def test_demo_account_can_be_turned_off() -> None:
    async with api_client() as client:
        assert (await client.get("/api/auth/demo")).status_code == 404
        login = await client.post(
            "/api/auth/login", json={"email": "demo@saanssafe.app", "password": "SaansSafe-Demo-2026"}
        )
    assert login.status_code == 401
