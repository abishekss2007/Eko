"""Winter smog inversion detector: cold, still air traps fine particles near the ground."""

from app.data import get_assumptions
from app.schemas.air import InversionCheck, InversionResult


def detect_inversion(temperature_c: float | None, wind_kmh: float | None, pm2_5: float | None) -> InversionResult:
    """All three conditions must hold. Missing readings never count as met."""
    rules = get_assumptions().inversion
    checks = [
        InversionCheck(
            name="temperature_below_c",
            value=temperature_c,
            threshold=rules.max_temperature_c,
            met=temperature_c is not None and temperature_c < rules.max_temperature_c,
        ),
        InversionCheck(
            name="wind_below_kmh",
            value=wind_kmh,
            threshold=rules.max_wind_kmh,
            met=wind_kmh is not None and wind_kmh < rules.max_wind_kmh,
        ),
        InversionCheck(
            name="pm2_5_above_ug_m3",
            value=pm2_5,
            threshold=rules.min_pm2_5_ug_m3,
            met=pm2_5 is not None and pm2_5 > rules.min_pm2_5_ug_m3,
        ),
    ]
    return InversionResult(detected=all(c.met for c in checks), checks=checks)
