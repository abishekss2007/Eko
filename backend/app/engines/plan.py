"""Today's plan: one deterministic family decision from air data and member risk."""

from app.data import get_assumptions
from app.schemas.air import AirReport
from app.schemas.planner import DailyPlan, PlanAction
from app.schemas.shield import HouseholdRisk

INDOOR_LEVELS = frozenset({"high", "very_high", "emergency"})


def daily_plan(air: AirReport, risk: HouseholdRisk | None) -> DailyPlan:
    rules = get_assumptions().daily_plan
    category = air.naqi.category
    if category in rules.stay_in_categories or (air.inversion.detected and category in rules.limit_categories):
        stance = "stay_in"
    elif category in rules.limit_categories:
        stance = "limit"
    else:
        stance = "normal"

    window = air.best_window
    start = window.start.strftime("%H:%M") if window else None
    end = window.end.strftime("%H:%M") if window else None
    indoors = [m.member_id for m in risk.members if m.risk_level in INDOOR_LEVELS] if risk else []
    purifier = category in rules.purifier_categories

    actions: list[PlanAction] = []
    if stance == "normal":
        actions.append(PlanAction(id="normal", text="Air is acceptable today; normal outdoor activity is fine."))
    elif window:
        actions.append(
            PlanAction(
                id="go_out",
                text=f"Go out only between {start} and {end}, when PM2.5 averages {window.mean_pm2_5:g} ug/m3.",
            )
        )
    else:
        actions.append(PlanAction(id="go_out", text="There is no clean outdoor window today; keep trips short."))
    if indoors:
        actions.append(PlanAction(id="stay_in", text=f"Keep {', '.join(indoors)} indoors today."))
    if stance != "normal":
        actions.append(
            PlanAction(
                id="windows",
                text=f"Keep windows shut; air the home only from {start} to {end}."
                if window
                else "Keep windows shut all day.",
            )
        )
    if purifier:
        actions.append(
            PlanAction(
                id="purifier",
                text="Run the purifier with doors closed in the room where the most vulnerable person sleeps.",
            )
        )
    if stance != "normal":
        actions.append(PlanAction(id="mask", text="Wear a well-fitted N95 mask for any trip outside."))
    return DailyPlan(
        stance=stance,
        go_out_start=start,
        go_out_end=end,
        stay_indoors=indoors,
        use_purifier=purifier,
        actions=actions,
    )
