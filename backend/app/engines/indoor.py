"""Budget-aware indoor air planner: purifier sizing (CADR) and ranked home fixes."""

from app.data import CostTier, FixTrigger, get_assumptions
from app.schemas.planner import IndoorAssessment, IndoorRequest, RankedFix

TIER_ORDER: tuple[CostTier, ...] = ("zero_rupee", "under_1000", "under_5000")
IMPACT_ORDER = ("high", "medium", "low")
POOR_OR_WORSE = frozenset({"Poor", "Very Poor", "Severe"})


def _triggers(req: IndoorRequest, cadr_gap: float, filter_overdue: bool) -> set[FixTrigger]:
    active: set[FixTrigger] = {"always"}
    if req.sweeping == "dry":
        active.add("dry_sweeping")
    if req.incense_or_coil:
        active.add("incense")
    if req.cooking_fuel == "solid_fuel":
        active.add("solid_fuel")
    if req.cooking_fuel == "lpg":
        active.add("lpg")
    if filter_overdue:
        active.add("old_filter")
    if cadr_gap > 0:
        active.add("cadr_gap")
    return active


def _reason(trigger: FixTrigger, a: IndoorAssessment, window: str | None) -> str:
    reasons: dict[FixTrigger, str] = {
        "always": f"Outdoor smog leaks in through open windows; {window} is today's cleanest time to air the home."
        if window
        else "Outdoor smog leaks in through open windows and gaps.",
        "dry_sweeping": "Dry sweeping throws settled fine dust back into the air you breathe.",
        "incense": "Incense and mosquito coils release fine particles right inside the room.",
        "solid_fuel": "Burning wood, dung or coal indoors is one of the largest PM2.5 sources in Indian homes.",
        "lpg": "Frying and high-heat cooking release fine particles even on LPG.",
        "old_filter": f"A filter older than {get_assumptions().indoor.filter_replace_months} months "
        "delivers far less clean air than its rating.",
        "cadr_gap": f"This room needs {a.required_cadr_m3h:g} m3/h of clean air for "
        f"{a.target_ach:g} air changes an hour; it now gets {a.current_cadr_m3h:g} m3/h.",
    }
    return reasons[trigger]


def assess_indoor(req: IndoorRequest, category: str, window: str | None) -> IndoorAssessment:
    """Required CADR = volume x target ACH. Fixes filtered to budget; cheapest first, then by impact."""
    rules = get_assumptions().indoor
    volume = round(req.room.length_m * req.room.width_m * req.room.height_m, 1)
    required = round(volume * rules.target_ach)
    current = round(req.purifier_cadr_m3h)
    gap = max(0, required - current)
    overdue = current > 0 and req.filter_age_months >= rules.filter_replace_months

    sources: list[str] = []
    if req.cooking_fuel == "solid_fuel":
        sources.append("Wood, dung or coal cooking smoke")
    if req.incense_or_coil:
        sources.append("Incense, dhoop or mosquito coils")
    if req.sweeping == "dry":
        sources.append("Dry sweeping stirring up dust")
    if req.ventilation == "windows_open_daytime" and category in POOR_OR_WORSE:
        sources.append("Windows open while outdoor air is poor")

    assessment = IndoorAssessment(
        room_volume_m3=volume,
        target_ach=rules.target_ach,
        required_cadr_m3h=required,
        current_cadr_m3h=current,
        effective_ach=round(current / volume, 1) if volume else 0.0,
        cadr_gap_m3h=gap,
        filter_overdue=overdue,
        pollution_sources=sources,
        fixes=[],
    )
    active = _triggers(req, gap, overdue)
    budget = TIER_ORDER.index(req.budget_tier)
    chosen = [f for f in rules.fixes if f.when in active and TIER_ORDER.index(f.cost_tier) <= budget]
    chosen.sort(key=lambda f: (TIER_ORDER.index(f.cost_tier), IMPACT_ORDER.index(f.impact)))
    assessment.fixes = [
        RankedFix(
            id=f.id,
            title=f.title,
            cost_tier=f.cost_tier,
            impact=f.impact,
            reason=_reason(f.when, assessment, window),
        )
        for f in chosen
    ]
    return assessment
