"""Indian CPCB National Air Quality Index (NAQI), computed deterministically."""

from collections.abc import Mapping, Sequence
from statistics import fmean

from app.data import NaqiCategory, Pollutant, get_assumptions
from app.schemas.air import NaqiResult, SubIndex

MAX_INDEX = 500


def sub_index(pollutant: Pollutant, concentration: float) -> int:
    """Linear CPCB interpolation: I = Ilo + (C - Blo) * (Ihi - Ilo) / (Bhi - Blo).

    Concentrations above the last breakpoint are capped at 500.
    """
    if concentration < 0:
        raise ValueError("concentration must be non-negative")
    naqi = get_assumptions().naqi
    for (b_lo, b_hi), (i_lo, i_hi) in zip(naqi.breakpoints_ug_m3[pollutant], naqi.index_bands, strict=True):
        if concentration <= b_hi:
            return round(i_lo + (concentration - b_lo) * (i_hi - i_lo) / (b_hi - b_lo))
    return MAX_INDEX


def category_for(index: int) -> NaqiCategory:
    """Return the CPCB category whose band contains `index`."""
    categories = get_assumptions().naqi.categories
    for category in categories:
        if index <= category.aqi_high:
            return category
    return categories[-1]


def averaged(values: Sequence[float | None]) -> tuple[float | None, bool]:
    """Mean of the trailing readings and whether it meets CPCB's 16-of-24-hour rule.

    Falls back to the latest available reading when too few hours exist.
    """
    present = [v for v in values if v is not None]
    if not present:
        return None, False
    if len(present) >= get_assumptions().naqi.min_hours_for_24h_average:
        return round(fmean(present), 1), True
    return round(present[-1], 1), False


def compute_naqi(series: Mapping[Pollutant, Sequence[float | None]]) -> NaqiResult | None:
    """NAQI from trailing hourly series (oldest first). Needs at least one PM pollutant."""
    subs: list[SubIndex] = []
    all_full_average = True
    for pollutant, values in series.items():
        concentration, full = averaged(values)
        if concentration is None:
            continue
        all_full_average &= full
        subs.append(
            SubIndex(
                pollutant=pollutant,
                concentration=concentration,
                index=sub_index(pollutant, concentration),
            )
        )
    if not any(s.pollutant in ("pm2_5", "pm10") for s in subs):
        return None
    dominant = max(subs, key=lambda s: s.index)
    category = category_for(dominant.index)
    return NaqiResult(
        value=dominant.index,
        category=category.name,
        color=category.color,
        health_impact=category.health_impact,
        dominant_pollutant=dominant.pollutant,
        sub_indices=subs,
        is_24h_average=all_full_average,
    )
