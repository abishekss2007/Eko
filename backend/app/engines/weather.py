"""Weather outlook: WMO weather codes to plain words, and the next hours and days of the forecast."""

from datetime import date, datetime, timedelta
from typing import Any

from app.schemas.air import WeatherDay, WeatherHour, WeatherOutlook

HOURS_AHEAD = 24
DAYS_AHEAD = 7

# WMO weather interpretation codes, as documented by Open-Meteo (https://open-meteo.com/en/docs).
CONDITIONS: dict[int, str] = {
    0: "Clear",
    1: "Mainly clear",
    2: "Partly cloudy",
    3: "Overcast",
    45: "Fog",
    48: "Freezing fog",
    51: "Light drizzle",
    53: "Drizzle",
    55: "Heavy drizzle",
    56: "Freezing drizzle",
    57: "Freezing drizzle",
    61: "Light rain",
    63: "Rain",
    65: "Heavy rain",
    66: "Freezing rain",
    67: "Freezing rain",
    71: "Light snow",
    73: "Snow",
    75: "Heavy snow",
    77: "Snow grains",
    80: "Light showers",
    81: "Showers",
    82: "Heavy showers",
    85: "Snow showers",
    86: "Heavy snow showers",
    95: "Thunderstorm",
    96: "Thunderstorm with hail",
    99: "Thunderstorm with hail",
}


def condition_for(code: int | None) -> str | None:
    """Plain words for a WMO code; None when the code is missing or unknown."""
    return None if code is None else CONDITIONS.get(code)


def _num(values: Any, i: int) -> float | None:
    try:
        v = values[i]
    except (IndexError, KeyError, TypeError):
        return None
    return float(v) if isinstance(v, int | float) and not isinstance(v, bool) else None


def _code(values: Any, i: int) -> int | None:
    v = _num(values, i)
    return None if v is None else int(v)


def build_outlook(weather: dict[str, Any], now: datetime) -> WeatherOutlook | None:
    """The sky now, today's high and low, the next 24 hours and the next 7 days.

    `now` is local time at the place (Open-Meteo returns local times with timezone=auto).
    Returns None when the payload has no forecast at all, so the rest of the report still works.
    """
    current = weather.get("current") or {}
    hourly = weather.get("hourly") or {}
    daily = weather.get("daily") or {}
    if not isinstance(current, dict) or not isinstance(hourly, dict) or not isinstance(daily, dict):
        return None

    hours: list[WeatherHour] = []
    start = now.replace(minute=0, second=0, microsecond=0)
    end = start + timedelta(hours=HOURS_AHEAD)
    for i, raw in enumerate(hourly.get("time") or []):
        try:
            t = datetime.fromisoformat(raw)
        except (TypeError, ValueError):
            continue
        if start <= t < end:
            hours.append(
                WeatherHour(
                    time=t,
                    temperature_c=_num(hourly.get("temperature_2m"), i),
                    weather_code=_code(hourly.get("weather_code"), i),
                    precipitation_probability=_num(hourly.get("precipitation_probability"), i),
                    is_day=_num(hourly.get("is_day"), i) != 0,
                )
            )

    days: list[WeatherDay] = []
    for i, raw in enumerate(daily.get("time") or []):
        try:
            d = date.fromisoformat(raw)
        except (TypeError, ValueError):
            continue
        if d >= now.date() and len(days) < DAYS_AHEAD:
            days.append(
                WeatherDay(
                    date=d,
                    weather_code=_code(daily.get("weather_code"), i),
                    temp_max_c=_num(daily.get("temperature_2m_max"), i),
                    temp_min_c=_num(daily.get("temperature_2m_min"), i),
                    precipitation_probability=_num(daily.get("precipitation_probability_max"), i),
                )
            )

    code = current.get("weather_code")
    code = int(code) if isinstance(code, int | float) and not isinstance(code, bool) else None
    if code is None and hours:
        code = hours[0].weather_code
    if code is None and not hours and not days:
        return None
    today = days[0] if days and days[0].date == now.date() else None
    is_day = current.get("is_day")
    return WeatherOutlook(
        weather_code=code,
        condition=condition_for(code),
        is_day=bool(is_day) if isinstance(is_day, int | float) else (hours[0].is_day if hours else True),
        today_max_c=today.temp_max_c if today else None,
        today_min_c=today.temp_min_c if today else None,
        hourly=hours,
        daily=days,
    )
