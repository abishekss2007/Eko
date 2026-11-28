"""Past weather and air quality: daily summaries, period extremes and long-term records.

Pure functions over hourly series in local wall-clock time, so they are easy to test.
"""

from collections import defaultdict
from collections.abc import Mapping, Sequence
from datetime import date, datetime
from statistics import fmean

from app.data import Pollutant, get_assumptions
from app.engines.aqi import compute_naqi
from app.schemas.history import (
    CalendarDayRecord,
    DaySummary,
    LongTermRecords,
    PeriodRecord,
    PeriodRecords,
    YearRecord,
)

POOR_NAQI = 200  # CPCB: above 200 is Poor, Very Poor or Severe.

Series = Sequence[float | None]
Reading = tuple[datetime, float]


def _by_day(times: Sequence[datetime], values: Series) -> dict[date, list[Reading]]:
    days: dict[date, list[Reading]] = defaultdict(list)
    for t, v in zip(times, values, strict=False):
        if v is not None:
            days[t.date()].append((t, float(v)))
    return days


def _peak(readings: list[Reading], *, lowest: bool = False) -> Reading | None:
    if not readings:
        return None
    # Ties go to the earliest hour, so "when" is stable.
    return min(readings, key=lambda r: (r[1] if lowest else -r[1], r[0]))


def _mean(readings: list[Reading]) -> float | None:
    return round(fmean(v for _, v in readings), 1) if readings else None


def summarize_days(
    *,
    weather_times: Sequence[datetime],
    weather: Mapping[str, Series],
    air_times: Sequence[datetime],
    air: Mapping[Pollutant, Series],
    today: date,
    days: int,
) -> list[DaySummary]:
    """One summary per completed local day before `today`, oldest first, at most `days` of them.

    Daily NAQI is the CPCB index of each pollutant's 24-hour mean, and only for days with
    at least 16 hourly readings (the CPCB minimum for a 24-hour average).
    """
    temp = _by_day(weather_times, weather.get("temperature", []))
    rain = _by_day(weather_times, weather.get("precipitation", []))
    wind = _by_day(weather_times, weather.get("wind", []))
    humidity = _by_day(weather_times, weather.get("humidity", []))
    pollutants = {key: _by_day(air_times, values) for key, values in air.items()}
    min_hours = get_assumptions().naqi.min_hours_for_24h_average

    all_days = set(temp).union(*pollutants.values())
    dates = sorted(d for d in all_days if d < today)[-days:]
    summaries: list[DaySummary] = []
    for d in dates:
        hot = _peak(temp.get(d, []))
        cold = _peak(temp.get(d, []), lowest=True)
        rain_day = rain.get(d, [])
        wind_peak = _peak(wind.get(d, []))
        pm25 = pollutants.get("pm2_5", {}).get(d, [])
        pm25_peak = _peak(pm25)
        full = {key: [v for _, v in by_day.get(d, [])] for key, by_day in pollutants.items()}
        full = {key: values for key, values in full.items() if len(values) >= min_hours}
        naqi = compute_naqi(full) if full else None
        summaries.append(
            DaySummary(
                date=d,
                temp_max_c=hot[1] if hot else None,
                temp_max_time=hot[0] if hot else None,
                temp_min_c=cold[1] if cold else None,
                temp_min_time=cold[0] if cold else None,
                precipitation_mm=round(sum(v for _, v in rain_day), 1) if rain_day else None,
                wind_max_kmh=wind_peak[1] if wind_peak else None,
                humidity_mean=_mean(humidity.get(d, [])),
                pm2_5_mean=_mean(pm25),
                pm2_5_peak=pm25_peak[1] if pm25_peak else None,
                naqi=naqi.value if naqi else None,
                naqi_category=naqi.category if naqi else None,
                naqi_color=naqi.color if naqi else None,
            )
        )
    return summaries


def _hourly_record(days: Sequence[DaySummary], value: str, time: str, *, lowest: bool = False) -> PeriodRecord | None:
    candidates = [(getattr(d, value), getattr(d, time), d.date) for d in days if getattr(d, value) is not None]
    if not candidates:
        return None
    v, t, d = min(candidates, key=lambda c: (c[0] if lowest else -c[0], c[2]))
    return PeriodRecord(value=v, date=d, time=t)


def period_records(
    days: Sequence[DaySummary],
    *,
    pm25_times: Sequence[datetime] = (),
    pm25: Series = (),
) -> PeriodRecords:
    """Extremes over the summarised days, each with the date (and hour) it happened."""
    in_period = {d.date for d in days}
    rainy = [(d.precipitation_mm, d.date) for d in days if d.precipitation_mm]
    windy = [(d.wind_max_kmh, d.date) for d in days if d.wind_max_kmh is not None]
    rated = [d for d in days if d.naqi is not None]
    hourly_pm = [r for r in _by_day(pm25_times, pm25).items() if r[0] in in_period]
    pm_peak = _peak([reading for _, readings in hourly_pm for reading in readings])

    def air_record(day: DaySummary) -> PeriodRecord:
        return PeriodRecord(value=day.naqi or 0, date=day.date, category=day.naqi_category)

    wettest = max(rainy, key=lambda r: (r[0], -r[1].toordinal())) if rainy else None
    windiest = max(windy, key=lambda r: (r[0], -r[1].toordinal())) if windy else None
    return PeriodRecords(
        hottest=_hourly_record(days, "temp_max_c", "temp_max_time"),
        coldest=_hourly_record(days, "temp_min_c", "temp_min_time", lowest=True),
        wettest=PeriodRecord(value=wettest[0], date=wettest[1]) if wettest else None,
        windiest=PeriodRecord(value=windiest[0], date=windiest[1]) if windiest else None,
        worst_air=air_record(max(rated, key=lambda d: (d.naqi, -d.date.toordinal()))) if rated else None,
        cleanest_air=air_record(min(rated, key=lambda d: (d.naqi, d.date))) if rated else None,
        pm2_5_peak=PeriodRecord(value=pm_peak[1], date=pm_peak[0].date(), time=pm_peak[0]) if pm_peak else None,
        average_naqi=round(fmean(d.naqi for d in rated if d.naqi is not None)) if rated else None,
        days_poor_or_worse=sum(1 for d in rated if d.naqi is not None and d.naqi > POOR_NAQI),
    )


def _year_extreme(readings: list[tuple[date, float]], *, lowest: bool = False) -> YearRecord | None:
    if not readings:
        return None
    d, v = min(readings, key=lambda r: (r[1] if lowest else -r[1], r[0]))
    return YearRecord(value=v, date=d)


def long_term_records(
    dates: Sequence[date],
    highs: Series,
    lows: Series,
    *,
    today: date,
    yesterday_high: float | None,
) -> LongTermRecords | None:
    """All-time daily extremes in the archive, plus records for today's calendar date."""
    high = [(d, float(v)) for d, v in zip(dates, highs, strict=False) if v is not None]
    low = [(d, float(v)) for d, v in zip(dates, lows, strict=False) if v is not None]
    if not high and not low:
        return None

    def same_date(readings: list[tuple[date, float]], when: date) -> list[tuple[date, float]]:
        return [(d, v) for d, v in readings if (d.month, d.day) == (when.month, when.day)]

    today_highs = same_date(high, today)
    calendar = CalendarDayRecord(
        month=today.month,
        day=today.day,
        record_high=_year_extreme(today_highs),
        record_low=_year_extreme(same_date(low, today), lowest=True),
        average_high_c=round(fmean(v for _, v in today_highs), 1) if today_highs else None,
        years=len(today_highs),
    )
    anomaly = None
    if yesterday_high is not None:
        yesterday = date.fromordinal(today.toordinal() - 1)
        usual = same_date(high, yesterday)
        if usual:
            anomaly = round(yesterday_high - fmean(v for _, v in usual), 1)
    all_dates = [d for d, _ in high or low]
    return LongTermRecords(
        since=min(all_dates),
        until=max(all_dates),
        hottest_day=_year_extreme(high),
        coldest_day=_year_extreme(low, lowest=True),
        today=calendar if calendar.years else None,
        yesterday_vs_average_c=anomaly,
    )
