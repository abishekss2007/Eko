"""Fetches Open-Meteo air quality and weather, then runs the deterministic engines."""

import asyncio
import logging
from collections.abc import Callable
from datetime import UTC, datetime, timedelta
from typing import Any

import httpx

from app.config import Settings
from app.data import Pollutant, get_assumptions
from app.engines.aqi import compute_naqi
from app.engines.climate import detect_inversion
from app.engines.window import find_best_window, upcoming
from app.schemas.air import AirReport, CurrentConditions, GeocodeResult, HourlyPoint, Location
from app.services import places
from app.services.cache import TTLCache

logger = logging.getLogger(__name__)

AIR_URL = "https://air-quality-api.open-meteo.com/v1/air-quality"
WEATHER_URL = "https://api.open-meteo.com/v1/forecast"
GEOCODE_URL = "https://geocoding-api.open-meteo.com/v1/search"
PHOTON_URL = "https://photon.komoot.io/api/"
SOURCE = "Open-Meteo (CAMS air quality, weather forecast)"
SIM_SOURCE = "Simulated severe winter smog scenario"
_API_FIELDS: dict[Pollutant, str] = {"pm2_5": "pm2_5", "pm10": "pm10", "no2": "nitrogen_dioxide"}
TRAILING_HOURS = 24
IST_OFFSET_S = 19800

Json = dict[str, Any]


class UpstreamError(RuntimeError):
    """An external data provider failed or returned unusable data."""


def _round_coord(value: float) -> float:
    """Two decimals (about 1 km) so nearby requests share one cache entry."""
    return round(value, 2)


def _local_now(utc_now: datetime, offset_s: int) -> datetime:
    return (utc_now + timedelta(seconds=offset_s)).replace(tzinfo=None)


def build_report(air: Json, weather: Json, utc_now: datetime, *, simulated: bool = False) -> AirReport:
    """Turn raw Open-Meteo payloads into a verified report. Pure function, easy to test."""
    try:
        hourly = air["hourly"]
        times = [datetime.fromisoformat(t) for t in hourly["time"]]
        series: dict[Pollutant, list[float | None]] = {
            key: list(hourly.get(field) or [None] * len(times)) for key, field in _API_FIELDS.items()
        }
        current_wx = weather.get("current") or {}
        offset = int(air.get("utc_offset_seconds", 0))
    except (KeyError, TypeError, ValueError) as exc:
        raise UpstreamError("Unexpected air-quality payload") from exc

    now = _local_now(utc_now, offset)
    past = [i for i, t in enumerate(times) if t <= now]
    if not past:
        raise UpstreamError("No air-quality readings for the current hour")
    cur = past[-1]
    trailing = slice(max(0, cur - TRAILING_HOURS + 1), cur + 1)

    naqi = compute_naqi({key: values[trailing] for key, values in series.items()})
    if naqi is None:
        raise UpstreamError("No particulate readings available")

    current = CurrentConditions(
        time=times[cur],
        pm2_5=series["pm2_5"][cur],
        pm10=series["pm10"][cur],
        no2=series["no2"][cur],
        temperature_c=current_wx.get("temperature_2m"),
        relative_humidity=current_wx.get("relative_humidity_2m"),
        wind_kmh=current_wx.get("wind_speed_10m"),
    )
    points = [HourlyPoint(time=t, pm2_5=v) for t, v in zip(times, series["pm2_5"], strict=True)]
    return AirReport(
        location=Location(
            latitude=air.get("latitude", 0.0),
            longitude=air.get("longitude", 0.0),
            timezone=air.get("timezone"),
        ),
        current=current,
        naqi=naqi,
        inversion=detect_inversion(current.temperature_c, current.wind_kmh, current.pm2_5),
        best_window=find_best_window(points, now),
        forecast=upcoming(points, now),
        simulated=simulated,
        source=SIM_SOURCE if simulated else SOURCE,
    )


def simulated_payloads(latitude: float, longitude: float, utc_now: datetime) -> tuple[Json, Json]:
    """A fixed severe-smog scenario in Indian Standard Time: 24h at the peak, then a
    cleaner afternoon so the outdoor-window finder has something to find."""
    sim = get_assumptions().simulation
    now = _local_now(utc_now, IST_OFFSET_S).replace(minute=0, second=0, microsecond=0)
    times = [now + timedelta(hours=h) for h in range(-TRAILING_HOURS + 1, TRAILING_HOURS + 1)]

    def pm(t: datetime) -> float:
        if t <= now:
            return sim.pm2_5
        distance = min(abs(t.hour + 0.5 - 15) / 6, 1.0)
        return round(sim.afternoon_clean_pm2_5 + (sim.pm2_5 - sim.afternoon_clean_pm2_5) * distance, 1)

    pm25 = [pm(t) for t in times]
    ratio = [v / sim.pm2_5 for v in pm25]
    air = {
        "latitude": latitude,
        "longitude": longitude,
        "timezone": "Asia/Kolkata",
        "utc_offset_seconds": IST_OFFSET_S,
        "hourly": {
            "time": [t.isoformat(timespec="minutes") for t in times],
            "pm2_5": pm25,
            "pm10": [round(sim.pm10 * r, 1) for r in ratio],
            "nitrogen_dioxide": [round(sim.no2 * r, 1) for r in ratio],
        },
    }
    weather = {
        "current": {
            "temperature_2m": sim.temperature_c,
            "relative_humidity_2m": sim.relative_humidity,
            "wind_speed_10m": sim.wind_kmh,
        }
    }
    return air, weather


async def fetch_json(
    client: httpx.AsyncClient, url: str, params: dict[str, str | int | float], *, timeout_s: float | None = None
) -> Json:
    """GET a JSON object from a provider; any failure becomes an UpstreamError.

    `timeout_s` overrides the client's timeout for slow providers such as the weather archive.
    """
    try:
        if timeout_s is None:
            response = await client.get(url, params=params)
        else:
            response = await client.get(url, params=params, timeout=timeout_s)
        response.raise_for_status()
        data = response.json()
    except (httpx.HTTPError, ValueError) as exc:
        logger.warning("Upstream request failed: %s", type(exc).__name__)
        raise UpstreamError("Air-quality provider is unavailable") from exc
    if not isinstance(data, dict):
        raise UpstreamError("Unexpected provider response")
    return data


class AirService:
    """Async Open-Meteo client with rounded-coordinate TTL caching."""

    def __init__(
        self,
        client: httpx.AsyncClient,
        settings: Settings,
        utc_clock: Callable[[], datetime] = lambda: datetime.now(UTC),
    ) -> None:
        self._client = client
        self._clock = utc_clock
        self._raw_cache: TTLCache[tuple[float, float], tuple[Json, Json]] = TTLCache(settings.air_cache_ttl_s)
        self._geo_cache: TTLCache[str, list[GeocodeResult]] = TTLCache(settings.geocode_cache_ttl_s)

    async def _get_json(self, url: str, params: dict[str, str | int | float]) -> Json:
        return await fetch_json(self._client, url, params)

    async def report(self, latitude: float, longitude: float, *, simulate: bool = False) -> AirReport:
        """Live report (cached ~20 min per km-square) or the simulated scenario."""
        lat, lon = _round_coord(latitude), _round_coord(longitude)
        now = self._clock()
        if simulate:
            air, weather = simulated_payloads(lat, lon, now)
            return build_report(air, weather, now, simulated=True)

        cached = self._raw_cache.get((lat, lon))
        if cached is None:
            common: dict[str, str | int | float] = {"latitude": lat, "longitude": lon, "timezone": "auto"}
            air, weather = await asyncio.gather(
                self._get_json(
                    AIR_URL,
                    {**common, "hourly": ",".join(_API_FIELDS.values()), "past_days": 1, "forecast_days": 2},
                ),
                self._get_json(
                    WEATHER_URL,
                    {**common, "current": "temperature_2m,relative_humidity_2m,wind_speed_10m"},
                ),
            )
            cached = (air, weather)
            self._raw_cache.set((lat, lon), cached)
        return build_report(*cached, now)

    async def geocode(self, query: str) -> list[GeocodeResult]:
        """Search any city, town, village, neighbourhood or landmark worldwide, cached for a day.

        Open-Meteo (GeoNames) and Photon (OpenStreetMap) are asked concurrently; the search
        still works if one of them is down, and fails only if both are.
        """
        key = " ".join(query.casefold().split())
        hit = self._geo_cache.get(key)
        if hit is not None:
            return hit
        head, qualifiers = places.split_query(query)
        om_params: dict[str, str | int | float] = {"name": head, "count": places.MAX_RESULTS, "language": "en"}
        om_data, photon_data = await asyncio.gather(
            self._get_json(GEOCODE_URL, {**om_params, "format": "json"}),
            self._get_json(PHOTON_URL, {"q": query, "limit": places.MAX_RESULTS, "lang": "en"}),
            return_exceptions=True,
        )
        if isinstance(om_data, BaseException) and isinstance(photon_data, BaseException):
            raise UpstreamError("Place search is unavailable")
        open_meteo = [] if isinstance(om_data, BaseException) else places.from_open_meteo(om_data)
        photon = [] if isinstance(photon_data, BaseException) else places.from_photon(photon_data)
        if qualifiers:
            matching, rest = places.partition(open_meteo, qualifiers)
            results = places.merge(matching, photon, rest)
        else:
            results = places.merge(open_meteo, photon)
        self._geo_cache.set(key, results)
        return results
