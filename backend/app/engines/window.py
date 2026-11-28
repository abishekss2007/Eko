"""Best outdoor window: the cleanest contiguous daytime slot in the next 24 hours."""

import itertools
from datetime import datetime, timedelta
from statistics import fmean

from app.data import get_assumptions
from app.engines.aqi import category_for, sub_index
from app.schemas.air import BestWindow, HourlyPoint

ONE_HOUR = timedelta(hours=1)


def upcoming(points: list[HourlyPoint], now: datetime) -> list[HourlyPoint]:
    """Points from the current hour through the lookahead horizon."""
    hours = get_assumptions().outdoor_window.lookahead_hours
    start = now.replace(minute=0, second=0, microsecond=0)
    end = start + timedelta(hours=hours)
    return [p for p in points if start <= p.time < end]


def find_best_window(points: list[HourlyPoint], now: datetime) -> BestWindow | None:
    """Lowest mean PM2.5 over `duration_hours` consecutive hours inside activity hours.

    Ties go to the earliest slot. Returns None when no complete slot exists.
    """
    rules = get_assumptions().outdoor_window
    span = rules.duration_hours
    pts = upcoming(points, now)
    best: tuple[float, int] | None = None
    for i in range(len(pts) - span + 1):
        slot = pts[i : i + span]
        start = slot[0].time
        if start.hour < rules.earliest_start_hour or start.hour + span > rules.latest_end_hour:
            continue
        if any(b.time - a.time != ONE_HOUR for a, b in itertools.pairwise(slot)):
            continue
        values = [p.pm2_5 for p in slot]
        if any(v is None for v in values):
            continue
        mean = fmean(v for v in values if v is not None)
        if best is None or mean < best[0]:
            best = (mean, i)
    if best is None:
        return None
    mean, i = best
    rounded = round(mean, 1)
    index = sub_index("pm2_5", rounded)
    return BestWindow(
        start=pts[i].time,
        end=pts[i].time + timedelta(hours=span),
        mean_pm2_5=rounded,
        indicative_aqi=index,
        category=category_for(index).name,
    )
