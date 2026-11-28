"""Weather and air history: the engine, the payload builder, the service and the endpoint."""

import asyncio
from datetime import UTC, date, datetime, timedelta
from typing import Any

import httpx
import pytest

from app.engines.history import long_term_records, period_records, summarize_days
from app.services import history_service
from app.services.history_service import ARCHIVE_URL, HistoryService, build_day, build_history
from tests.helpers import IST, api_client, make_settings

# 10:00 IST on 28 Nov 2026.
NOW = datetime(2026, 11, 28, 4, 30, tzinfo=UTC)
TODAY = date(2026, 11, 28)


@pytest.fixture(autouse=True)
def pinned_clock(monkeypatch: pytest.MonkeyPatch) -> None:
    """The fixtures are fixed dates, so "today" is pinned for the endpoint tests too."""
    monkeypatch.setattr(history_service, "utc_now", lambda: NOW)


def hourly_times(days: int) -> list[datetime]:
    """`days` past local days plus today, hour by hour, as Open-Meteo returns with past_days."""
    start = datetime(2026, 11, 28) - timedelta(days=days)
    return [start + timedelta(hours=h) for h in range((days + 1) * 24)]


def temperature(t: datetime) -> float:
    """Daily cycle peaking at 15:00; 25 Nov is a heatwave day (peak 33.5 C)."""
    base = 20.0 + (5.0 if t.date() == date(2026, 11, 25) else 0.0)
    return round(base + 8.5 - abs(t.hour - 15) * 0.5, 1)


def pm25(t: datetime) -> float:
    """24 Nov is the smoggy day with a 400 ug/m3 spike at 08:00."""
    if t.date() == date(2026, 11, 24):
        return 400.0 if t.hour == 8 else 250.0
    return 40.0


def weather_payload(days: int = 7) -> dict[str, Any]:
    times = hourly_times(days)
    return {
        "latitude": 28.61,
        "longitude": 77.21,
        "timezone": "Asia/Kolkata",
        "utc_offset_seconds": IST,
        "hourly": {
            "time": [t.isoformat(timespec="minutes") for t in times],
            "temperature_2m": [temperature(t) for t in times],
            "precipitation": [2.0 if t.date() == date(2026, 11, 26) and t.hour < 3 else 0.0 for t in times],
            "wind_speed_10m": [30.0 if t == datetime(2026, 11, 23, 13) else 6.0 for t in times],
            "relative_humidity_2m": [60.0] * len(times),
        },
    }


def air_payload(days: int = 7) -> dict[str, Any]:
    times = hourly_times(days)
    return {
        "utc_offset_seconds": IST,
        "hourly": {
            "time": [t.isoformat(timespec="minutes") for t in times],
            "pm2_5": [pm25(t) for t in times],
            "pm10": [pm25(t) * 1.5 for t in times],
            "nitrogen_dioxide": [30.0] * len(times),
        },
    }


def archive_payload() -> dict[str, Any]:
    dates = [date(2020, 1, 1) + timedelta(days=i) for i in range((date(2026, 11, 22) - date(2020, 1, 1)).days + 1)]

    def high(d: date) -> float:
        if d == date(2024, 5, 18):
            return 47.2
        if (d.month, d.day) == (11, 28):
            return 24.0 + (d.year - 2020)  # record high for 28 Nov: 2025 at 29.0 C
        return 25.0

    return {
        "daily": {
            "time": [d.isoformat() for d in dates],
            "temperature_2m_max": [high(d) for d in dates],
            "temperature_2m_min": [2.1 if d == date(2021, 1, 9) else 12.0 for d in dates],
        }
    }


def transport(
    *, air_ok: bool = True, archive_ok: bool = True, weather_ok: bool = True, calls: list[httpx.Request] | None = None
) -> httpx.MockTransport:
    def handler(request: httpx.Request) -> httpx.Response:
        if calls is not None:
            calls.append(request)
        host = request.url.host
        days = int(request.url.params.get("past_days", 7))
        if host.startswith("archive"):
            return httpx.Response(200, json=archive_payload()) if archive_ok else httpx.Response(503)
        if host.startswith("air-quality"):
            return httpx.Response(200, json=air_payload(days)) if air_ok else httpx.Response(503)
        return httpx.Response(200, json=weather_payload(days)) if weather_ok else httpx.Response(503)

    return httpx.MockTransport(handler)


def test_build_history_yesterday_records_and_long_term() -> None:
    report = build_history(weather_payload(), air_payload(), archive_payload(), NOW, 7)

    assert [d.date for d in report.daily] == [TODAY - timedelta(days=n) for n in range(7, 0, -1)]
    yesterday = report.yesterday
    assert yesterday is not None
    assert yesterday.date == date(2026, 11, 27)
    assert yesterday.temp_max_c == 28.5
    assert yesterday.temp_max_time == datetime(2026, 11, 27, 15)
    assert yesterday.naqi is not None
    assert yesterday.naqi_category == "Satisfactory"

    r = report.records
    assert r.hottest is not None
    assert (r.hottest.value, r.hottest.time) == (33.5, datetime(2026, 11, 25, 15))
    assert r.coldest is not None
    assert r.coldest.value == 21.0
    assert r.wettest is not None
    assert (r.wettest.value, r.wettest.date) == (6.0, date(2026, 11, 26))
    assert r.windiest is not None
    assert (r.windiest.value, r.windiest.date) == (30.0, date(2026, 11, 23))
    assert r.worst_air is not None
    assert r.worst_air.date == date(2026, 11, 24)
    assert r.worst_air.category in {"Very Poor", "Severe"}
    assert r.pm2_5_peak is not None
    assert (r.pm2_5_peak.value, r.pm2_5_peak.time) == (400.0, datetime(2026, 11, 24, 8))
    assert r.days_poor_or_worse == 1

    lt = report.long_term
    assert lt is not None
    assert lt.hottest_day is not None
    assert (lt.hottest_day.value, lt.hottest_day.date) == (47.2, date(2024, 5, 18))
    assert lt.coldest_day is not None
    assert lt.coldest_day.date == date(2021, 1, 9)
    assert lt.today is not None
    assert lt.today.record_high is not None
    assert (lt.today.record_high.value, lt.today.record_high.date.year) == (29.0, 2025)
    assert lt.today.years == 6
    assert lt.yesterday_vs_average_c == 3.5  # 28.5 against the usual 25.0
    assert report.air_available is True
    assert len(report.sources) == 3


def test_build_history_without_air_or_archive_still_shows_weather() -> None:
    report = build_history(weather_payload(), None, None, NOW, 7)
    assert report.yesterday is not None
    assert report.yesterday.naqi is None
    assert report.records.worst_air is None
    assert report.records.average_naqi is None
    assert report.long_term is None
    assert report.air_available is False
    assert report.sources == ["Open-Meteo weather (past days)"]


def test_build_history_ignores_malformed_air_and_archive() -> None:
    report = build_history(weather_payload(), {"hourly": {}}, {"daily": None}, NOW, 7)
    assert report.air_available is False
    assert report.long_term is None


def test_partial_air_day_has_no_naqi() -> None:
    """CPCB needs 16 of 24 hourly readings for a daily index."""
    times = [datetime(2026, 11, 27, h) for h in range(24)]
    pm = [80.0 if h < 10 else None for h in range(24)]
    days = summarize_days(
        weather_times=times,
        weather={"temperature": [20.0] * 24},
        air_times=times,
        air={"pm2_5": pm, "pm10": [None] * 24},
        today=TODAY,
        days=7,
    )
    assert days[0].pm2_5_mean == 80.0
    assert days[0].naqi is None


def test_period_records_empty() -> None:
    records = period_records([])
    assert records.hottest is None
    assert records.wettest is None
    assert records.days_poor_or_worse == 0


def test_long_term_records_empty_and_no_matching_date() -> None:
    assert long_term_records([], [], [], today=TODAY, yesterday_high=20.0) is None
    lt = long_term_records([date(2020, 6, 1)], [40.0], [None], today=TODAY, yesterday_high=20.0)
    assert lt is not None
    assert lt.today is None
    assert lt.coldest_day is None
    assert lt.yesterday_vs_average_c is None


async def test_service_caches_and_survives_archive_outage() -> None:
    calls: list[httpx.Request] = []
    async with httpx.AsyncClient(transport=transport(archive_ok=False, calls=calls)) as client:
        service = HistoryService(client, make_settings(), utc_clock=lambda: NOW)
        first = await service.report(28.6139, 77.209, 30)
        await service.wait_for_archive()
        second = await service.report(28.6141, 77.2091, 7)
    assert len(first.daily) == 30
    assert len(second.daily) == 7
    assert first.long_term is None
    assert first.long_term_pending is True, "the archive loads in the background, never on the request"
    assert second.long_term_pending is False, "a failed archive is not retried at once"
    archive_calls = [c for c in calls if str(c.url).startswith(ARCHIVE_URL)]
    assert len(archive_calls) == 1
    assert len(calls) - len(archive_calls) == 2, "every period shares one cached 90-day fetch"
    assert calls[0].url.params["past_days"] == "90"
    assert archive_calls[0].url.params["end_date"] == "2026-11-22"


async def test_archive_arrives_on_a_later_request() -> None:
    async with httpx.AsyncClient(transport=transport()) as client:
        service = HistoryService(client, make_settings(), utc_clock=lambda: NOW)
        first = await service.report(28.61, 77.21, 7)
        await service.wait_for_archive()
        second = await service.report(28.61, 77.21, 7)
        await service.aclose()
    assert first.long_term is None
    assert first.long_term_pending is True
    assert second.long_term is not None
    assert second.long_term_pending is False


async def test_history_endpoint() -> None:
    async with api_client(transport=transport()) as client:
        response = await client.get("/api/history", params={"lat": 28.61, "lon": 77.21, "days": 7})
        for _ in range(50):
            later = await client.get("/api/history", params={"lat": 28.61, "lon": 77.21, "days": 7})
            if not later.json()["long_term_pending"]:
                break
            await asyncio.sleep(0.01)
    assert response.status_code == 200
    data = response.json()
    assert data["days"] == 7
    assert len(data["daily"]) == 7
    assert data["records"]["hottest"]["value"] >= data["yesterday"]["temp_max_c"]
    assert data["long_term_pending"] is True
    assert later.json()["long_term"]["hottest_day"]["value"] == 47.2


async def test_history_day_endpoint() -> None:
    async with api_client(transport=transport()) as client:
        ok = await client.get("/api/history/day", params={"lat": 28.61, "lon": 77.21, "date": "2026-11-24"})
        today = await client.get("/api/history/day", params={"lat": 28.61, "lon": 77.21, "date": "2026-11-28"})
        too_old = await client.get("/api/history/day", params={"lat": 28.61, "lon": 77.21, "date": "2025-01-01"})
        bad = await client.get("/api/history/day", params={"lat": 28.61, "lon": 77.21, "date": "yesterday"})
    assert ok.status_code == 200
    data = ok.json()
    assert data["summary"]["date"] == "2026-11-24"
    assert data["summary"]["naqi_category"] in {"Very Poor", "Severe"}
    assert len(data["hours"]) == 24
    assert data["hours"][8]["pm2_5"] == 400.0
    assert data["hours"][15]["temperature_c"] == 28.5
    assert today.status_code == 404
    assert too_old.status_code == 404
    assert bad.status_code == 422


def test_build_day_without_air() -> None:
    detail = build_day(weather_payload(), None, NOW, date(2026, 11, 25))
    assert detail is not None
    assert detail.summary.temp_max_c == 33.5
    assert all(h.pm2_5 is None for h in detail.hours)
    assert detail.sources == ["Open-Meteo weather (past days)"]


async def test_history_endpoint_validates_days_and_reports_weather_outage() -> None:
    async with api_client(transport=transport(weather_ok=False)) as client:
        too_long = await client.get("/api/history", params={"lat": 28.61, "lon": 77.21, "days": 365})
        down = await client.get("/api/history", params={"lat": 28.61, "lon": 77.21})
    assert too_long.status_code == 422
    assert down.status_code == 502


async def test_history_without_air_is_not_cached() -> None:
    calls: list[httpx.Request] = []
    async with httpx.AsyncClient(transport=transport(air_ok=False, calls=calls)) as client:
        service = HistoryService(client, make_settings(), utc_clock=lambda: NOW)
        report = await service.report(28.61, 77.21, 7)
        await service.report(28.61, 77.21, 7)
    assert report.air_available is False
    assert len([c for c in calls if c.url.host.startswith("air-quality")]) == 2
