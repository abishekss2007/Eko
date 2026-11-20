"""Family Health Shield: deterministic risk + Gemini explanation with a verified fallback."""

from collections.abc import Callable
from typing import Any

from app.data import get_assumptions
from app.engines.risk import assess_household
from app.prompts.health_shield import build_health_shield_prompts
from app.schemas.air import AirReport
from app.schemas.shield import (
    HouseholdRisk,
    MemberInput,
    MemberShieldText,
    ShieldNarrative,
    ShieldRequest,
    ShieldResponse,
)
from app.services.air_service import AirService
from app.services.narrator import Narrator

DISCLAIMER = (
    "SaansSafe gives general air-quality guidance, not medical advice. It does not diagnose or "
    "prescribe. In an emergency call 108 or 112, or your doctor."
)
LEVEL_LABELS = {
    "low": "Low",
    "moderate": "Moderate",
    "high": "High",
    "very_high": "Very high",
    "emergency": "Emergency",
}
CONDITION_LABELS = {
    "asthma": "asthma",
    "copd": "COPD",
    "heart_disease": "heart disease",
    "pregnancy": "pregnancy",
    "diabetes": "diabetes",
}
TITLE_MAX, BODY_MAX, MAX_STEPS = 60, 140, 4


def fmt(value: float | None) -> str:
    """One shared number format, so text and verified data always agree."""
    if value is None:
        return "unknown"
    return f"{value:.2f}".rstrip("0").rstrip(".")


def verified_payload(air: AirReport, risk: HouseholdRisk, members: list[MemberInput]) -> dict[str, Any]:
    """The only facts the model may use. No names, phone numbers or free text."""
    by_id = {m.member_id: m for m in members}
    window = air.best_window
    return {
        "naqi": {
            "value": air.naqi.value,
            "category": air.naqi.category,
            "dominant_pollutant": air.naqi.dominant_pollutant,
        },
        "current": {
            "pm2_5_ug_m3": air.current.pm2_5,
            "pm10_ug_m3": air.current.pm10,
            "no2_ug_m3": air.current.no2,
            "temperature_c": air.current.temperature_c,
            "relative_humidity_pct": air.current.relative_humidity,
            "wind_kmh": air.current.wind_kmh,
        },
        "inversion_detected": air.inversion.detected,
        "best_outdoor_window": None
        if window is None
        else {
            "start": window.start.strftime("%H:%M"),
            "end": window.end.strftime("%H:%M"),
            "mean_pm2_5_ug_m3": window.mean_pm2_5,
        },
        "members": [
            {
                "member_id": r.member_id,
                "age_group": by_id[r.member_id].age_group,
                "conditions": by_id[r.member_id].sensitivities,
                "risk_level": r.risk_level,
                "reasons": r.reasons,
            }
            for r in risk.members
        ],
        "emergency_numbers": emergency_numbers(),
    }


def emergency_numbers() -> dict[str, str]:
    numbers = get_assumptions().emergency_numbers
    return {"ambulance": numbers.ambulance, "national_emergency": numbers.national_emergency}


def _describe(member: MemberInput) -> str:
    conditions = [CONDITION_LABELS[s] for s in member.sensitivities]
    who = f"{member.member_id} ({member.age_group}"
    return f"{who}, {', '.join(conditions)})" if conditions else f"{who})"


def rules_narrative(air: AirReport, risk: HouseholdRisk, members: list[MemberInput]) -> ShieldNarrative:
    """Deterministic explanation used without a key, on timeout, or on failed validation."""
    c = air.current
    trapped = air.inversion.detected
    summary = (
        f"Outdoor air is {air.naqi.category} with a NAQI of {air.naqi.value} "
        f"and PM2.5 at {fmt(c.pm2_5)} ug/m3. "
        + (
            f"At {fmt(c.temperature_c)} C with wind at only {fmt(c.wind_kmh)} km/h, cold still air "
            "is trapping smoke and dust close to the ground."
            if trapped
            else f"It is {fmt(c.temperature_c)} C with wind at {fmt(c.wind_kmh)} km/h."
        )
    )
    window = air.best_window
    window_step = (
        f"Save any outdoor time for {window.start:%H:%M}-{window.end:%H:%M}, the cleanest window today."
        if window
        else "Postpone outdoor exercise until the air improves."
    )
    by_id = {m.member_id: m for m in members}
    alerts: list[MemberShieldText] = []
    for r in risk.members:
        member = by_id[r.member_id]
        level = LEVEL_LABELS[r.risk_level]
        severe = r.risk_level in ("high", "very_high", "emergency")
        steps = (
            [
                "Keep doors and windows shut and stay in the cleanest room.",
                "Wet-mop instead of sweeping, and avoid incense, mosquito coils and frying smoke.",
                window_step,
                "If you must step out, wear a well-fitted N95 mask.",
            ]
            if severe
            else [
                "Air out the home during the cleanest hours and keep it closed at peak times.",
                window_step,
                "Wet-mop floors and avoid burning incense or mosquito coils.",
            ]
        )
        reminder = (
            f'Follow your doctor\'s existing advice: "{member.care_note}". Keep prescribed supplies within reach.'
            if member.care_note
            else "Keep any prescribed medicines and devices within reach and follow your doctor's plan."
        )
        alerts.append(
            MemberShieldText(
                member_id=r.member_id,
                impact_reasoning=(
                    f"With PM2.5 at {fmt(c.pm2_5)} ug/m3"
                    + (" and smog trapped by cold, still air" if trapped else "")
                    + f", {_describe(member)} is at {level.lower()} risk because "
                    + r.reasons[-1][0].lower()
                    + r.reasons[-1][1:]
                    + "."
                ),
                notification_title=f"{r.member_id}: {level} smog risk"[:TITLE_MAX],
                notification_body=(
                    f"NAQI {air.naqi.value} ({air.naqi.category}). Stay indoors and keep windows shut."
                    if severe
                    else f"NAQI {air.naqi.value} ({air.naqi.category}). Limit long outdoor activity."
                )[:BODY_MAX],
                stay_safe_steps=steps,
                care_plan_reminder=reminder,
            )
        )
    levels = get_assumptions().risk.levels
    ordered = [by_id[r.member_id] for r in sorted(risk.members, key=lambda r: levels.index(r.risk_level), reverse=True)]
    handoff = (
        f"I am calling about {', '.join(_describe(m) for m in ordered)}. "
        f"Outdoor air here is NAQI {air.naqi.value} ({air.naqi.category}), PM2.5 {fmt(c.pm2_5)} ug/m3, "
        f"temperature {fmt(c.temperature_c)} C"
        + (" with winter smog trapped near the ground. " if trapped else ". ")
        + "Please tell us what to do right now while we keep them indoors."
    )
    return ShieldNarrative(climate_smog_summary=summary, member_alerts=alerts, doctor_handoff_summary=handoff)


def _clamp(n: ShieldNarrative) -> ShieldNarrative:
    """Enforce UI length limits the schema descriptions ask for."""
    for a in n.member_alerts:
        a.notification_title = a.notification_title[:TITLE_MAX]
        a.notification_body = a.notification_body[:BODY_MAX]
        a.stay_safe_steps = a.stay_safe_steps[:MAX_STEPS]
    return n


def member_check(member_ids: list[str]) -> Callable[[ShieldNarrative], str | None]:
    """Shield-specific check: exactly one alert per member, each with steps."""

    def check(narrative: ShieldNarrative) -> str | None:
        if sorted(a.member_id for a in narrative.member_alerts) != sorted(member_ids):
            return "member_ids do not match"
        if any(not a.stay_safe_steps for a in narrative.member_alerts):
            return "missing stay-safe steps"
        return None

    return check


class ShieldService:
    def __init__(self, air: AirService, narrator: Narrator) -> None:
        self._air = air
        self._narrator = narrator

    async def assess(self, request: ShieldRequest) -> ShieldResponse:
        air = await self._air.report(request.latitude, request.longitude, simulate=request.simulate)
        risk = assess_household(request.members, air.naqi.category, air.inversion.detected)
        verified = verified_payload(air, risk, request.members)
        notes = [{"member_id": m.member_id, "care_note": m.care_note} for m in request.members if m.care_note]
        system, prompt = build_health_shield_prompts(verified, notes, request.language)
        narrative = await self._narrator.explain(
            ShieldNarrative, system, prompt, verified, member_check([m.member_id for m in request.members])
        )
        return ShieldResponse(
            air=air,
            risk=risk,
            narrative=_clamp(narrative) if narrative else rules_narrative(air, risk, request.members),
            narrative_source="gemini" if narrative else "rules",
            emergency_numbers=emergency_numbers(),
            disclaimer=DISCLAIMER,
        )
