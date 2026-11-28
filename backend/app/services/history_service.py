"""Past weather and air quality for any place, from Open-Meteo's free history APIs."""

import asyncio
import logging
from collections.abc import Callable
from dataclasses import dataclass
from datetime import UTC, date, datetime, timedelta
from typing import Any

import httpx

from app.config import Settings
from app.data import Pollutant
from app.engines.history import day_hours, long_term_records, period_records, summarize_days
from app.schemas.air import Location
from app.schemas.history import DayDetail, DaySummary, HistoryReport, LongTermRecords
from app.services import relay
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


def utc_now() -> datetime:
    """The service clock; tests replace it to pin "today"."""
    return datetime.now(UTC)


Params = dict[str, str | int | float]


def _times(hourly: Json) -> list[datetime]:
    return [datetime.fromisoformat(t) for t in hourly["time"]]


def _series(hourly: Json, field: str, length: int) -> list[float | None]:
    values = hourly.get(field)
    return list(values) if isinstance(values, list) and len(values) == length else [None] * length


@dataclass(frozen=True)
class Recent:
    """Parsed hourly weather and air for the past days, in the place's local time."""

    offset_s: int
    location: Location
    weather_times: list[datetime]
    weather: dict[str, list[float | None]]
    air_times: list[datetime]
    air: dict[Pollutant, list[float | None]]

    def today(self, utc_now: datetime) -> date:
        return (utc_now + timedelta(seconds=self.offset_s)).date()


def parse_recent(weather: Json, air: Json | None) -> Recent:
    """Weather must parse; unusable air data is dropped so the weather still shows."""
    try:
        offset = int(weather.get("utc_offset_seconds", 0))
        w_hourly = weather["hourly"]
        w_times = _times(w_hourly)
        w_series = {key: _series(w_hourly, field, len(w_times)) for key, field in _WEATHER_FIELDS.items()}
        location = Location(
            latitude=weather.get("latitude", 0.0),
            longitude=weather.get("longitude", 0.0),
            timezone=weather.get("timezone"),
        )
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
    return Recent(offset, location, w_times, w_series, a_times, a_series)


def _summaries(recent: Recent, today: date, days: int) -> list[DaySummary]:
    return summarize_days(
        weather_times=recent.weather_times,
        weather=recent.weather,
        air_times=recent.air_times,
        air=recent.air,
        today=today,
        days=days,
    )


def build_history(
    weather: Json,
    air: Json | None,
    archive: Json | None,
    utc_now: datetime,
    days: int,
    *,
    archive_pending: bool = False,
) -> HistoryReport:
    """Turn raw Open-Meteo payloads into a history report. Pure function, easy to test."""
    recent = parse_recent(weather, air)
    today = recent.today(utc_now)
    daily = _summaries(recent, today, days)
    yesterday = daily[-1] if daily and daily[-1].date == today - timedelta(days=1) else None
    records = period_records(daily, pm25_times=recent.air_times, pm25=recent.air.get("pm2_5", []))
    long_term = _long_term(archive, today, yesterday.temp_max_c if yesterday else None)
    air_available = any(d.pm2_5_mean is not None for d in daily)

    sources = [WEATHER_SOURCE]
    if air_available:
        sources.append(AIR_SOURCE)
    if long_term:
        sources.append(ARCHIVE_SOURCE)
    return HistoryReport(
        location=recent.location,
        days=days,
        yesterday=yesterday,
        daily=daily,
        records=records,
        long_term=long_term,
        long_term_pending=archive_pending and long_term is None,
        air_available=air_available,
        sources=sources,
    )


def build_day(weather: Json, air: Json | None, utc_now: datetime, day: date) -> DayDetail | None:
    """One completed past day with every hour, or None if the day is not in the data."""
    recent = parse_recent(weather, air)
    today = recent.today(utc_now)
    if day >= today:
        return None
    summary = next((d for d in _summaries(recent, today, MAX_DAYS + 2) if d.date == day), None)
    if summary is None:
        return None
    hours = day_hours(
        day,
        weather_times=recent.weather_times,
        weather=recent.weather,
        air_times=recent.air_times,
        pm25=recent.air.get("pm2_5", []),
    )
    sources = [WEATHER_SOURCE] + ([AIR_SOURCE] if summary.pm2_5_mean is not None else [])
    return DayDetail(location=recent.location, summary=summary, hours=hours, sources=sources)


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


def _module_clock() -> datetime:
    return utc_now()  # looked up at call time, so a patched `utc_now` is used


class HistoryService:
    """Fetches recent hourly weather and air, plus the long-term archive, with caching.

    The last 90 days are fetched once per place and shared by every period and day view.
    Weather is required; air quality and the archive are best effort. The archive (1991 to
    now) can take a minute, so it loads in the background and is never waited on: reports
    say `long_term_pending` until it arrives.
    """

    MAX_ARCHIVE_LOADS = 8

    def __init__(
        self,
        client: httpx.AsyncClient,
        settings: Settings,
        utc_clock: Callable[[], datetime] | None = None,
    ) -> None:
        self._client = client
        self._clock = utc_clock or _module_clock
        self._archive_timeout_s = settings.archive_timeout_s
        self._recent: TTLCache[tuple[float, float], tuple[Json, Json | None]] = TTLCache(settings.history_cache_ttl_s)
        self._archive: TTLCache[tuple[float, float], Json] = TTLCache(settings.archive_cache_ttl_s)
        self._archive_failed: TTLCache[tuple[float, float], bool] = TTLCache(settings.archive_retry_s)
        self._archive_loads: dict[tuple[float, float], asyncio.Task[None]] = {}

    async def report(self, latitude: float, longitude: float, days: int) -> HistoryReport:
        lat, lon = round(latitude, 2), round(longitude, 2)
        days = max(1, min(days, MAX_DAYS))
        weather, air = await self._recent_payloads(lat, lon)
        archive, pending = self._archive_or_start((lat, lon))
        return build_history(weather, air, archive, self._clock(), days, archive_pending=pending)

    async def day(self, latitude: float, longitude: float, day: date) -> DayDetail | None:
        lat, lon = round(latitude, 2), round(longitude, 2)
        weather, air = await self._recent_payloads(lat, lon)
        return build_day(weather, air, self._clock(), day)

    async def _recent_payloads(self, lat: float, lon: float) -> tuple[Json, Json | None]:
        key = (lat, lon)
        cached = self._recent.get(key)
        if cached is not None:
            return cached
        # MAX_DAYS past days plus today; today is still in progress, so the engine drops it.
        common: Params = {
            "latitude": lat,
            "longitude": lon,
            "timezone": "auto",
            "past_days": MAX_DAYS,
            "forecast_days": 1,
        }
        weather, air = await asyncio.gather(
            fetch_json(self._client, WEATHER_URL, {**common, "hourly": ",".join(_WEATHER_FIELDS.values())}),
            fetch_json(self._client, AIR_URL, {**common, "hourly": ",".join(_AIR_FIELDS.values())}),
            return_exceptions=True,
        )
        if isinstance(weather, BaseException):
            raise UpstreamError("Weather history is unavailable") from weather
        result = (weather, None if isinstance(air, BaseException) else air)
        if result[1] is not None and not relay.is_active():
            self._recent.set(key, result)
        return result

    def _archive_params(self, key: tuple[float, float]) -> Params:
        lat, lon = key
        end = self._clock().date() - timedelta(days=ARCHIVE_LAG_DAYS)
        return {
            "latitude": lat,
            "longitude": lon,
            "timezone": "auto",
            "start_date": ARCHIVE_START.isoformat(),
            "end_date": end.isoformat(),
            "daily": "temperature_2m_max,temperature_2m_min",
        }

    def _archive_or_start(self, key: tuple[float, float]) -> tuple[Json | None, bool]:
        """The cached archive, or start loading it in the background. Returns (archive, pending)."""
        cached = self._archive.get(key)
        if cached is not None:
            return cached, False
        ctx, relay_hub = relay.current(), relay.hub()
        if ctx is not None and (ctx.active or (relay_hub is not None and relay_hub.blocked(ARCHIVE_URL))):
            # The browser fetches the slow archive in the background and the History tab polls.
            wanted = relay.ProviderRequest.of(ARCHIVE_URL, self._archive_params(key))
            provided = (ctx.provided or {}).get(wanted.key)
            if provided is not None:
                return provided, False
            ctx.wanted.append(wanted)
            return None, True
        if key in self._archive_loads:
            return None, True
        if self._archive_failed.get(key) or len(self._archive_loads) >= self.MAX_ARCHIVE_LOADS:
            return None, False
        self._archive_loads[key] = asyncio.create_task(self._load_archive(key))
        return None, True

    async def _load_archive(self, key: tuple[float, float]) -> None:
        params = self._archive_params(key)
        try:
            data = await fetch_json(self._client, ARCHIVE_URL, params, timeout_s=self._archive_timeout_s)
        except UpstreamError:
            self._archive_failed.set(key, True)
        else:
            self._archive.set(key, data)
        finally:
            self._archive_loads.pop(key, None)

    async def wait_for_archive(self) -> None:
        """Let background archive loads finish (used by tests)."""
        await asyncio.gather(*self._archive_loads.values(), return_exceptions=True)

    async def aclose(self) -> None:
        """Cancel background loads at shutdown."""
        for task in self._archive_loads.values():
            task.cancel()
        await self.wait_for_archive()
