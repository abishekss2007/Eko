"""Commute optimizer: inhaled PM2.5 dose and CO2 per trip, by mode and departure time."""

from app.data import Mode, get_assumptions
from app.schemas.air import HourlyPoint
from app.schemas.planner import CommuteFactors, CommutePlan, CommuteRequest, ModeOption

DOSE_FORMULA = "inhaled_dose_ug = PM2.5 (ug/m3) x microenvironment_factor x breathing_rate (m3/h) x hours"
CO2_FORMULA = "co2_kg = distance_km x emission_factor (kg CO2 per passenger-km)"


def _hhmm(minutes: int) -> str:
    minutes %= 24 * 60
    return f"{minutes // 60:02d}:{minutes % 60:02d}"


def pm_at(forecast: list[HourlyPoint], departure: str, fallback: float) -> float:
    """Forecast PM2.5 for the next occurrence of the departure hour.

    `forecast` runs chronologically from the current hour for 24 hours.
    """
    hour = int(departure.split(":", maxsplit=1)[0])
    for point in forecast:
        if point.time.hour == hour and point.pm2_5 is not None:
            return point.pm2_5
    return fallback


def option(mode: Mode, distance_km: float, pm: float, departure: str, duration_min: int | None = None) -> ModeOption:
    f = get_assumptions().commute.modes[mode]
    minutes = duration_min or max(1, round(distance_km / f.speed_kmh * 60))
    return ModeOption(
        mode=mode,
        label=f.label,
        departure=departure,
        duration_min=minutes,
        ambient_pm2_5=round(pm, 1),
        inhaled_dose_ug=round(pm * f.micro_factor * f.breathing_m3h * minutes / 60, 1),
        co2_kg=round(distance_km * f.co2_kg_per_km, 2),
    )


def factors() -> CommuteFactors:
    rules = get_assumptions().commute
    return CommuteFactors(
        formula_dose=DOSE_FORMULA,
        formula_co2=CO2_FORMULA,
        sources=[
            rules.breathing_rate_source,
            rules.microenvironment_source,
            rules.emission_source,
            rules.speed_source,
        ],
        modes={k: v.model_dump() for k, v in rules.modes.items()},
    )


def optimize_commute(req: CommuteRequest, forecast: list[HourlyPoint], current_pm: float) -> CommutePlan:
    """Lowest-dose option that does not raise CO2, optionally shifting departure by up to 2 hours."""
    rules = get_assumptions().commute
    hour, minute = map(int, req.departure.split(":"))
    base_minutes = hour * 60 + minute
    shifts = range(-rules.max_shift_hours, rules.max_shift_hours + 1) if req.flexible else range(1)

    def pm_for(departure: str) -> float:
        return pm_at(forecast, departure, current_pm)

    modes = [
        m for m in rules.modes if m == req.current_mode or req.distance_km <= rules.max_active_km.get(m, float("inf"))
    ]

    def build(mode: Mode, departure: str) -> ModeOption:
        own = req.duration_min if mode == req.current_mode else None
        return option(mode, req.distance_km, pm_for(departure), departure, own)

    baseline = build(req.current_mode, req.departure)
    options = sorted((build(m, req.departure) for m in modes), key=lambda o: (o.inhaled_dose_ug, o.co2_kg))

    candidates = [
        build(m, _hhmm(base_minutes + 60 * s))
        for m in modes
        if m == req.current_mode or rules.modes[m].low_emission
        for s in shifts
    ]
    eligible = [c for c in candidates if c.co2_kg <= baseline.co2_kg]
    recommended = min(eligible, key=lambda o: (o.inhaled_dose_ug, o.co2_kg, o.departure != req.departure))
    saved = round(baseline.inhaled_dose_ug - recommended.inhaled_dose_ug, 1)
    return CommutePlan(
        baseline=baseline,
        recommended=recommended,
        options=options,
        dose_saved_ug=saved,
        dose_saved_pct=round(100 * saved / baseline.inhaled_dose_ug) if baseline.inhaled_dose_ug else 0.0,
        co2_saved_kg=round(baseline.co2_kg - recommended.co2_kg, 2),
        shifted=recommended.departure != req.departure,
        factors=factors(),
    )
