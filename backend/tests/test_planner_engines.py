from datetime import UTC, datetime, timedelta

import pytest

from app.engines.exposure import optimize_commute, option, pm_at
from app.engines.indoor import assess_indoor
from app.engines.plan import daily_plan
from app.engines.risk import assess_household
from app.schemas.air import AirReport, HourlyPoint
from app.schemas.planner import CommuteRequest, IndoorRequest
from app.schemas.shield import MemberInput
from app.services.air_service import build_report, simulated_payloads
from tests.helpers import open_meteo_payloads


def indoor(**overrides: object) -> IndoorRequest:
    body: dict[str, object] = {
        "latitude": 28.6,
        "longitude": 77.2,
        "room": {"length_m": 4, "width_m": 3.5, "height_m": 3},
        "cooking_fuel": "lpg",
        "ventilation": "mostly_closed",
        "incense_or_coil": False,
        "sweeping": "wet",
        "purifier_cadr_m3h": 0,
        "filter_age_months": 0,
        "budget_tier": "zero_rupee",
        **overrides,
    }
    return IndoorRequest.model_validate(body)


def test_required_cadr_is_volume_times_five_ach() -> None:
    a = assess_indoor(indoor(), "Severe", "14:00-16:00")
    assert a.room_volume_m3 == 42.0
    assert a.required_cadr_m3h == 210
    assert a.cadr_gap_m3h == 210
    assert a.effective_ach == 0.0


def test_fixes_respect_budget_and_put_free_ones_first() -> None:
    free = assess_indoor(indoor(incense_or_coil=True, sweeping="dry"), "Severe", None)
    assert {f.cost_tier for f in free.fixes} == {"zero_rupee"}
    assert {"no_incense", "wet_mop", "close_peak"} <= {f.id for f in free.fixes}

    rich = assess_indoor(indoor(purifier_cadr_m3h=150, filter_age_months=9, budget_tier="under_5000"), "Severe", None)
    tiers = [f.cost_tier for f in rich.fixes]
    assert tiers == sorted(tiers, key=["zero_rupee", "under_1000", "under_5000"].index)
    assert {"replace_filter", "corsi_box"} <= {f.id for f in rich.fixes}
    assert rich.filter_overdue
    assert any("210 m3/h" in f.reason for f in rich.fixes)


def test_indoor_sources_and_sufficient_purifier() -> None:
    a = assess_indoor(
        indoor(
            cooking_fuel="solid_fuel",
            ventilation="windows_open_daytime",
            purifier_cadr_m3h=400,
            budget_tier="under_5000",
        ),
        "Poor",
        None,
    )
    assert a.cadr_gap_m3h == 0
    assert "Windows open while outdoor air is poor" in a.pollution_sources
    assert "corsi_box" not in {f.id for f in a.fixes}
    assert "switch_fuel" in {f.id for f in a.fixes}


def test_dose_formula() -> None:
    # 200 ug/m3 x 0.6 (metro) x 0.72 m3/h x 0.5 h = 43.2 ug
    o = option("metro", 15, 200, "09:00")
    assert o.duration_min == 30
    assert o.inhaled_dose_ug == 43.2
    assert o.co2_kg == 0.45


def _forecast(values: dict[int, float], default: float = 250) -> list[HourlyPoint]:
    start = datetime(2026, 11, 20, 8)
    return [HourlyPoint(time=start + timedelta(hours=h), pm2_5=values.get((8 + h) % 24, default)) for h in range(24)]


def test_pm_at_finds_next_occurrence_or_falls_back() -> None:
    forecast = _forecast({10: 120})
    assert pm_at(forecast, "10:30", 999) == 120
    assert pm_at([], "10:00", 999) == 999


def test_commute_prefers_lower_dose_without_more_co2() -> None:
    req = CommuteRequest.model_validate(
        {
            "latitude": 28.6,
            "longitude": 77.2,
            "distance_km": 12,
            "current_mode": "car_petrol_solo",
            "departure": "09:00",
        }
    )
    plan = optimize_commute(req, _forecast({11: 100}), 250)
    assert plan.recommended.mode == "metro"
    assert plan.recommended.departure == "11:00"
    assert plan.shifted
    assert plan.recommended.co2_kg <= plan.baseline.co2_kg
    assert plan.dose_saved_ug == pytest.approx(
        plan.baseline.inhaled_dose_ug - plan.recommended.inhaled_dose_ug, abs=0.1
    )
    assert all(o.mode not in ("walk", "cycle") for o in plan.options), "too far to walk or cycle"


def test_commute_without_flexibility_and_with_user_duration() -> None:
    req = CommuteRequest.model_validate(
        {
            "latitude": 28.6,
            "longitude": 77.2,
            "distance_km": 2,
            "current_mode": "walk",
            "departure": "09:00",
            "duration_min": 25,
            "flexible": False,
        }
    )
    plan = optimize_commute(req, _forecast({}), 250)
    assert plan.baseline.duration_min == 25
    assert not plan.shifted
    assert plan.recommended.co2_kg == 0


def _sim_air() -> AirReport:
    now = datetime(2026, 11, 20, 2, 30, tzinfo=UTC)
    air, weather = simulated_payloads(28.6, 77.2, now)
    return build_report(air, weather, now)


def test_daily_plan_stay_in_with_vulnerable_member() -> None:
    air = _sim_air()
    members = [
        MemberInput(member_id="Member_1", age_group="senior", sensitivities=["copd"]),
        MemberInput(member_id="Member_2", age_group="adult"),
    ]
    plan = daily_plan(air, assess_household(members, air.naqi.category, air.inversion.detected))
    assert plan.stance == "stay_in"
    assert "Member_1" in plan.stay_indoors
    assert plan.use_purifier
    assert plan.go_out_start is not None
    assert [a.id for a in plan.actions][:2] == ["go_out", "stay_in"]


def test_daily_plan_normal_day() -> None:
    air_json, weather = open_meteo_payloads(pm25=20, temp=25, wind=12)
    air = build_report(air_json, weather, datetime.now(UTC))
    plan = daily_plan(air, None)
    assert plan.stance == "normal"
    assert not plan.use_purifier
    assert [a.id for a in plan.actions] == ["normal"]
