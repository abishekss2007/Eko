"""Past weather and air quality for any place, from Open-Meteo's free history APIs."""

import asyncio
import logging
from collections.abc import Callable
from datetime import UTC, date, datetime, timedelta
from typing import Any

import httpx

from app.config import Settings
from app.data import Pollutant
from app.engines.history import long_term_records, period_records, summarize_days
from app.schemas.air import Location
from app.schemas.history import HistoryReport, LongTermRecords
from app.services.air_service import AIR_URL, WEATHER_URL, UpstreamError, fetch_json
from app.services.cache import TTLCache

logger = logging.getLogger(__name__)

ARCHIVE_URL = "https://archive-api.open-meteo.com/v1/archive"
ARCHIVE_START = date(1991, 1, 1)
ARCHIVE_LAG_DAYS = 6  # ERA5 reaches the archive about five days late.
MAX_DAYS = 90  # The air-quality API keeps up to 92 past days.
WEATHER_SOURCE = "Open-Meteo weather (past days)"
AIR_SOURCE = "Open-Meteo air quality (CAMS, past days)"
ARCHIVE_SOURCE = "Open-Meteo historical weather (ERA5 reanalysis, since 1991)"
_WEATHER_FIELDS = {
    "temperature": "temperature_2m",
    "precipitation": "precipitation",
    "wind": "wind_speed_10m",
    "humidity": "relative_humidity_2m",
}
_AIR_FIELDS: dict[Pollutant, str] = {"pm2_5": "pm2_5", "pm10": "pm10", "no2": "nitrogen_dioxide"}

Json = dict[str, Any]
Params = dict[str, str | int | float]


def _times(hourly: Json) -> list[datetime]:
    return [datetime.fromisoformat(t) for t in hourly["time"]]


def _series(hourly: Json, field: str, length: int) -> list[float | None]:
    values = hourly.get(field)
    return list(values) if isinstance(values, list) and len(values) == length else [None] * length


def build_history(
    weather: Json,
    air: Json | None,
    archive: Json | None,
    utc_now: datetime,
    days: int,
) -> HistoryReport:
    """Turn raw Open-Meteo payloads into a history report. Pure function, easy to test."""
    try:
        offset = int(weather.get("utc_offset_seconds", 0))
        w_hourly = weather["hourly"]
        w_times = _times(w_hourly)
        w_series = {key: _series(w_hourly, field, len(w_times)) for key, field in _WEATHER_FIELDS.items()}
    except (KeyError, TypeError, ValueError) as exc:
        raise UpstreamError("Unexpected weather history payload") from exc

    a_times: list[datetime] = []
    a_series: dict[Pollutant, list[float | None]] = {}
    if air is not None:
        try:
            a_hourly = air["hourly"]
            a_times = _times(a_hourly)
            a_series = {key: _series(a_hourly, field, len(a_times)) for key, field in _AIR_FIELDS.items()}
        except (KeyError, TypeError, ValueError):
            logger.warning("Ignoring unusable air-quality history payload")
            a_times, a_series = [], {}

    today = (utc_now + timedelta(seconds=offset)).date()
    daily = summarize_days(
        weather_times=w_times, weather=w_series, air_times=a_times, air=a_series, today=today, days=days
    )
    yesterday = daily[-1] if daily and daily[-1].date == today - timedelta(days=1) else None
    records = period_records(daily, pm25_times=a_times, pm25=a_series.get("pm2_5", []))
    long_term = _long_term(archive, today, yesterday.temp_max_c if yesterday else None)
    air_available = any(d.pm2_5_mean is not None for d in daily)

    sources = [WEATHER_SOURCE]
    if air_available:
        sources.append(AIR_SOURCE)
    if long_term:
        sources.append(ARCHIVE_SOURCE)
    return HistoryReport(
        location=Location(
            latitude=weather.get("latitude", 0.0),
            longitude=weather.get("longitude", 0.0),
            timezone=weather.get("timezone"),
        ),
        days=days,
        yesterday=yesterday,
        daily=daily,
        records=records,
        long_term=long_term,
        air_available=air_available,
        sources=sources,
    )


def _long_term(archive: Json | None, today: date, yesterday_high: float | None) -> LongTermRecords | None:
    if archive is None:
        return None
    try:
        daily = archive["daily"]
        dates = [date.fromisoformat(d) for d in daily["time"]]
        highs = _series(daily, "temperature_2m_max", len(dates))
        lows = _series(daily, "temperature_2m_min", len(dates))
    except (KeyError, TypeError, ValueError):
        logger.warning("Ignoring unusable weather archive payload")
        return None
    return long_term_records(dates, highs, lows, today=today, yesterday_high=yesterday_high)


class HistoryService:
    """Fetches recent hourly weather and air, plus the long-term archive, with caching.

    Weather is required; air quality and the archive are best effort, so the history still
    shows when one of those providers is down.
    """

    def __init__(
        self,
        client: httpx.AsyncClient,
        settings: Settings,
        utc_clock: Callable[[], datetime] = lambda: datetime.now(UTC),
    ) -> None:
        self._client = client
        self._clock = utc_clock
        self._recent: TTLCache[tuple[float, float, int], tuple[Json, Json | None]] = TTLCache(
            settings.history_cache_ttl_s
        )
        self._archive: TTLCache[tuple[float, float], Json | None] = TTLCache(settings.archive_cache_ttl_s)

    async def report(self, latitude: float, longitude: float, days: int) -> HistoryReport:
        lat, lon = round(latitude, 2), round(longitude, 2)
        days = max(1, min(days, MAX_DAYS))
        now = self._clock()
        recent, archive = await asyncio.gather(self._recent_payloads(lat, lon, days), self._archive_payload(lat, lon))
        return build_history(recent[0], recent[1], archive, now, days)

    async def _recent_payloads(self, lat: float, lon: float, days: int) -> tuple[Json, Json | None]:
        key = (lat, lon, days)
        cached = self._recent.get(key)
        if cached is not None:
            return cached
        # `days` past days plus today; today is still in progress, so the engine drops it.
        common: Params = {"latitude": lat, "longitude": lon, "timezone": "auto", "past_days": days, "forecast_days": 1}
        weather, air = await asyncio.gather(
            fetch_json(self._client, WEATHER_URL, {**common, "hourly": ",".join(_WEATHER_FIELDS.values())}),
            fetch_json(self._client, AIR_URL, {**common, "hourly": ",".join(_AIR_FIELDS.values())}),
            return_exceptions=True,
        )
        if isinstance(weather, BaseException):
            raise UpstreamError("Weather history is unavailable") from weather
        result = (weather, None if isinstance(air, BaseException) else air)
        if result[1] is not None:
            self._recent.set(key, result)
        return result

    async def _archive_payload(self, lat: float, lon: float) -> Json | None:
        key = (lat, lon)
        cached = self._archive.get(key)
        if cached is not None:
            return cached
        end = self._clock().date() - timedelta(days=ARCHIVE_LAG_DAYS)
        params: Params = {
            "latitude": lat,
            "longitude": lon,
            "timezone": "auto",
            "start_date": ARCHIVE_START.isoformat(),
            "end_date": end.isoformat(),
            "daily": "temperature_2m_max,temperature_2m_min",
        }
        try:
            data = await fetch_json(self._client, ARCHIVE_URL, params)
        except UpstreamError:
            return None
        self._archive.set(key, data)
        return data
