"""Weather outlook: WMO codes, the next 24 hours and 7 days, and graceful gaps."""

from datetime import UTC, date, datetime, timedelta
from typing import Any

from app.engines.weather import build_outlook, condition_for
from app.services.air_service import build_report, simulated_payloads
from tests.helpers import open_meteo_payloads

NOW = datetime(2026, 11, 28, 9, 30)


def forecast_payload() -> dict[str, Any]:
    start = datetime(2026, 11, 27, 0, 0)
    times = [start + timedelta(hours=h) for h in range(72)]
    days = [date(2026, 11, 27) + timedelta(days=d) for d in range(8)]
    return {
        "current": {"temperature_2m": 14.2, "weather_code": 45, "is_day": 1},
        "hourly": {
            "time": [t.isoformat(timespec="minutes") for t in times],
            "temperature_2m": [10.0 + t.hour / 2 for t in times],
            "weather_code": [61 if t.hour == 12 else 2 for t in times],
            "precipitation_probability": [40 if t.hour == 12 else 5 for t in times],
            "is_day": [1 if 7 <= t.hour < 18 else 0 for t in times],
        },
        "daily": {
            "time": [d.isoformat() for d in days],
            "weather_code": [3, 45, 61, 2, 1, 0, 80, 95],
            "temperature_2m_max": [20, 21.5, 19, 22, 23, 24, 18, 17],
            "temperature_2m_min": [9, 8.4, 10, 11, 12, 12, 10, 9],
            "precipitation_probability_max": [0, 10, 70, 5, 0, 0, 60, 80],
        },
    }


def test_condition_for_known_unknown_and_missing_codes() -> None:
    assert condition_for(0) == "Clear"
    assert condition_for(45) == "Fog"
    assert condition_for(95) == "Thunderstorm"
    assert condition_for(42) is None
    assert condition_for(None) is None


def test_outlook_has_next_24_hours_and_seven_days_from_today() -> None:
    outlook = build_outlook(forecast_payload(), NOW)
    assert outlook is not None
    assert outlook.condition == "Fog"
    assert outlook.weather_code == 45
    assert outlook.is_day is True
    assert len(outlook.hourly) == 24
    assert outlook.hourly[0].time == datetime(2026, 11, 28, 9, 0)
    noon = next(h for h in outlook.hourly if h.time.hour == 12)
    assert noon.weather_code == 61
    assert noon.precipitation_probability == 40
    assert next(h for h in outlook.hourly if h.time.hour == 20).is_day is False
    assert [d.date for d in outlook.daily][:2] == [date(2026, 11, 28), date(2026, 11, 29)]
    assert len(outlook.daily) == 7
    assert (outlook.today_max_c, outlook.today_min_c) == (21.5, 8.4)


def test_outlook_tolerates_missing_and_bad_values() -> None:
    payload = forecast_payload()
    payload["current"] = {}
    payload["hourly"]["temperature_2m"][33] = None
    payload["hourly"]["time"][34] = "not a time"
    payload["daily"]["temperature_2m_max"] = None
    outlook = build_outlook(payload, NOW)
    assert outlook is not None
    assert outlook.weather_code == 2  # falls back to this hour's code
    assert outlook.hourly[0].temperature_c is None
    assert len(outlook.hourly) == 23
    assert outlook.today_max_c is None
    assert outlook.today_min_c == 8.4


def test_no_forecast_means_no_outlook() -> None:
    assert build_outlook({"current": {"temperature_2m": 12}}, NOW) is None
    assert build_outlook({"current": None, "hourly": [1, 2]}, NOW) is None


def test_report_carries_weather_and_stays_valid_without_it() -> None:
    now = datetime.now(UTC)
    air, weather = open_meteo_payloads(utc_now=now)
    assert build_report(air, weather, now).weather is None
    sim_air, sim_weather = simulated_payloads(28.6, 77.2, now)
    report = build_report(sim_air, sim_weather, now, simulated=True)
    assert report.weather is not None
    assert report.weather.condition == "Fog"
    assert len(report.weather.hourly) == 24
    assert len(report.weather.daily) == 7
    assert report.weather.today_min_c is not None and report.weather.today_max_c is not None
    assert report.weather.today_min_c < report.weather.today_max_c
