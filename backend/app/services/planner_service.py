"""Today's plan, indoor planner, commute optimizer and civic drafter.

Each feature follows the same path: engines decide, Gemini phrases, rules text is the fallback.
"""

from collections.abc import Callable
from typing import Any

from app.engines.exposure import optimize_commute
from app.engines.indoor import assess_indoor
from app.engines.plan import daily_plan
from app.engines.risk import assess_household
from app.prompts.planner import civic_prompts, commute_prompts, daily_plan_prompts, indoor_prompts
from app.schemas.air import AirReport
from app.schemas.planner import (
    ActionNarrative,
    CivicDraft,
    CivicRequest,
    CivicResponse,
    CommutePlan,
    CommuteRequest,
    CommuteResponse,
    DailyPlan,
    IndoorAssessment,
    IndoorRequest,
    IndoorResponse,
    PlanNarrative,
    PlanRequest,
    PlanResponse,
)
from app.services.air_service import AirService
from app.services.narrator import Narrator
from app.services.shield_service import fmt

STANCE_HEADLINES = {
    "stay_in": "{category} smog today (NAQI {value}): stay indoors as much as possible",
    "limit": "{category} air today (NAQI {value}): limit time outside",
    "normal": "{category} air today (NAQI {value}): a good day to be outside",
}
TIER_LABELS = {"zero_rupee": "Rs 0", "under_1000": "under Rs 1,000", "under_5000": "under Rs 5,000"}


def window_text(air: AirReport) -> str:
    w = air.best_window
    return f"{w.start:%H:%M}-{w.end:%H:%M}" if w else "none today"


def air_facts(air: AirReport) -> dict[str, Any]:
    """The air numbers every prompt may use."""
    w = air.best_window
    return {
        "naqi": air.naqi.value,
        "category": air.naqi.category,
        "pm2_5_ug_m3": air.current.pm2_5,
        "temperature_c": air.current.temperature_c,
        "wind_kmh": air.current.wind_kmh,
        "inversion_detected": air.inversion.detected,
        "best_window": None
        if w is None
        else {"start": f"{w.start:%H:%M}", "end": f"{w.end:%H:%M}", "mean_pm2_5_ug_m3": w.mean_pm2_5},
    }


def length_check(expected: int) -> Callable[[ActionNarrative], str | None]:
    def check(n: ActionNarrative) -> str | None:
        return None if len(n.explanations) == expected else "explanations do not match items"

    return check


# ---------------- rule-based fallbacks ----------------


def rules_plan(air: AirReport, plan: DailyPlan) -> PlanNarrative:
    headline = STANCE_HEADLINES[plan.stance].format(category=air.naqi.category, value=air.naqi.value)
    if plan.stay_indoors:
        headline += f", especially {', '.join(plan.stay_indoors)}"
    return PlanNarrative(headline=headline + ".", steps=[a.text for a in plan.actions])


def rules_indoor(air: AirReport, a: IndoorAssessment) -> ActionNarrative:
    if a.current_cadr_m3h == 0:
        sizing = (
            f"This {fmt(a.room_volume_m3)} m3 room needs a purifier delivering about "
            f"{fmt(a.required_cadr_m3h)} m3/h of clean air."
        )
    elif a.cadr_gap_m3h > 0:
        sizing = (
            f"Your purifier gives {fmt(a.current_cadr_m3h)} m3/h but this {fmt(a.room_volume_m3)} m3 room "
            f"needs {fmt(a.required_cadr_m3h)} m3/h, so it falls short by {fmt(a.cadr_gap_m3h)} m3/h."
        )
    else:
        sizing = (
            f"Your purifier's {fmt(a.current_cadr_m3h)} m3/h covers the {fmt(a.required_cadr_m3h)} m3/h "
            f"this {fmt(a.room_volume_m3)} m3 room needs."
        )
    return ActionNarrative(
        summary=sizing + " Start with the free fixes below; they cost nothing and work at once.",
        impact_reasoning=(
            f"With outdoor PM2.5 at {fmt(air.current.pm2_5)} ug/m3, fine particles seep indoors, "
            "so cutting indoor sources and cleaning the air you sleep in matters most."
        ),
        explanations=[f.reason for f in a.fixes],
    )


def rules_commute(plan: CommutePlan) -> ActionNarrative:
    b, r = plan.baseline, plan.recommended
    if plan.dose_saved_ug <= 0:
        summary = (
            f"Your {b.label.lower()} trip at {b.departure} is already the lowest-exposure choice "
            f"({fmt(b.inhaled_dose_ug)} ug of PM2.5 inhaled)."
        )
    else:
        summary = (
            f"Switching from {b.label.lower()} at {b.departure} to {r.label.lower()} at {r.departure} "
            f"cuts inhaled PM2.5 from {fmt(b.inhaled_dose_ug)} to {fmt(r.inhaled_dose_ug)} ug "
            f"({fmt(plan.dose_saved_pct)}% less) and saves {fmt(plan.co2_saved_kg)} kg CO2 per trip."
        )
    return ActionNarrative(
        summary=summary,
        impact_reasoning=(
            "Dose depends on how dirty the air is at that hour, how much of it reaches you inside the "
            "vehicle, how hard you breathe and how long you are on the road."
        ),
        explanations=[
            f"{o.label}: {fmt(o.duration_min)} min, {fmt(o.inhaled_dose_ug)} ug PM2.5, {fmt(o.co2_kg)} kg CO2."
            for o in plan.options
        ],
    )


def rules_civic(req: CivicRequest, air: AirReport) -> CivicDraft:
    place = req.locality or "our area"
    numbers = (
        f"Today the air quality index (CPCB NAQI) near {place} is {air.naqi.value} ({air.naqi.category}), "
        f"with PM2.5 at {fmt(air.current.pm2_5)} ug/m3"
    )
    seen = f' Residents have observed: "{req.observation}".' if req.observation else ""
    if req.kind == "rwa_advisory":
        return CivicDraft(
            subject=f"Request for clean-air measures in {place} (NAQI {air.naqi.value})",
            body=(
                f"Dear RWA Committee,\n\n{numbers}.{seen}\n\nTo protect children, elders and "
                "residents with asthma or heart disease, we request:\n1. No burning of leaves, garbage "
                "or wood in the society, including fires for guards.\n2. Construction and repair "
                "material kept covered and the roads wet-swept.\n3. Children's outdoor play moved to "
                f"the cleanest hours ({window_text(air)}).\n4. A notice to all residents about these "
                "measures.\n\nThank you for your support.\n\n[Your name]\n[Flat / house no.]"
            ),
        )
    return CivicDraft(
        subject=f"Complaint: open burning in {place} during poor air quality",
        body=(
            f"To the Ward Officer,\n\nI wish to report open burning in {place}.{seen} {numbers}, "
            "and the smoke is adding to the pollution residents are breathing.\n\nI request an "
            "inspection and action under the applicable air pollution rules, including the Graded "
            "Response Action Plan (GRAP) where it is in force, and steps to prevent repeat burning."
            "\n\nThank you.\n\n[Your name]\n[Flat / house no.]"
        ),
    )


class PlannerService:
    def __init__(self, air: AirService, narrator: Narrator) -> None:
        self._air = air
        self._narrator = narrator

    async def _air_for(self, req: PlanRequest | IndoorRequest | CommuteRequest | CivicRequest) -> AirReport:
        return await self._air.report(req.latitude, req.longitude, simulate=req.simulate)

    async def plan(self, req: PlanRequest) -> PlanResponse:
        air = await self._air_for(req)
        risk = assess_household(req.members, air.naqi.category, air.inversion.detected) if req.members else None
        plan = daily_plan(air, risk)
        verified = {"air": air_facts(air), "plan": plan.model_dump()}
        ids = set(plan.stay_indoors)

        def check(n: PlanNarrative) -> str | None:
            text = " ".join([n.headline, *n.steps])
            missing = [i for i in ids if i not in text]
            return f"plan omits {missing}" if missing or not n.steps else None

        system, prompt = daily_plan_prompts(verified, req.language)
        narrative = await self._narrator.explain(PlanNarrative, system, prompt, verified, check)
        return PlanResponse(
            air=air,
            plan=plan,
            narrative=narrative or rules_plan(air, plan),
            narrative_source="gemini" if narrative else "rules",
        )

    async def indoor(self, req: IndoorRequest) -> IndoorResponse:
        air = await self._air_for(req)
        w = air.best_window
        assessment = assess_indoor(req, air.naqi.category, f"{w.start:%H:%M}-{w.end:%H:%M}" if w else None)
        verified = {"air": air_facts(air), "assessment": assessment.model_dump()}
        system, prompt = indoor_prompts(verified, TIER_LABELS[req.budget_tier], req.language)
        narrative = await self._narrator.explain(
            ActionNarrative, system, prompt, verified, length_check(len(assessment.fixes))
        )
        return IndoorResponse(
            air=air,
            assessment=assessment,
            narrative=narrative or rules_indoor(air, assessment),
            narrative_source="gemini" if narrative else "rules",
        )

    async def commute(self, req: CommuteRequest) -> CommuteResponse:
        air = await self._air_for(req)
        plan = optimize_commute(req, air.forecast, air.current.pm2_5 or air.naqi.sub_indices[0].concentration)
        verified = {"air": air_facts(air), "commute": plan.model_dump(exclude={"factors"})}
        system, prompt = commute_prompts(verified, window_text(air), req.language)
        narrative = await self._narrator.explain(
            ActionNarrative, system, prompt, verified, length_check(len(plan.options))
        )
        return CommuteResponse(
            air=air,
            plan=plan,
            narrative=narrative or rules_commute(plan),
            narrative_source="gemini" if narrative else "rules",
        )

    async def civic(self, req: CivicRequest) -> CivicResponse:
        air = await self._air_for(req)
        verified = {"air": air_facts(air), "best_window": window_text(air)}
        user_input = {"locality": req.locality, "observation": req.observation}
        system, prompt = civic_prompts(req.kind, verified, user_input, req.language)
        draft = await self._narrator.explain(CivicDraft, system, prompt, {**verified, **user_input})
        return CivicResponse(
            air=air, draft=draft or rules_civic(req, air), narrative_source="gemini" if draft else "rules"
        )
