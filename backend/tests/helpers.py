"""Test helpers: mock Open-Meteo transport, fake Gemini model, in-process API client."""

from collections.abc import AsyncIterator, Callable
from contextlib import asynccontextmanager
from datetime import UTC, datetime, timedelta
from typing import Any

import httpx
from pydantic import BaseModel

from app.config import Settings
from app.main import create_app

IST = 19800


def open_meteo_payloads(
    pm25: float = 150.0, temp: float = 12.0, wind: float = 5.0, utc_now: datetime | None = None
) -> tuple[dict[str, Any], dict[str, Any]]:
    """Realistic Open-Meteo shaped payloads in IST: 24h history + 24h forecast.

    Forecast PM2.5 is lowest at 15:00-17:00 local.
    """
    now = (utc_now or datetime.now(UTC)) + timedelta(seconds=IST)
    base = now.replace(minute=0, second=0, microsecond=0, tzinfo=None)
    times = [base + timedelta(hours=h) for h in range(-23, 25)]
    pm = [pm25 if t <= base else (60.0 if t.hour in (15, 16) else pm25) for t in times]
    air = {
        "latitude": 28.61,
        "longitude": 77.21,
        "timezone": "Asia/Kolkata",
        "utc_offset_seconds": IST,
        "hourly": {
            "time": [t.isoformat(timespec="minutes") for t in times],
            "pm2_5": pm,
            "pm10": [v * 1.5 for v in pm],
            "nitrogen_dioxide": [40.0] * len(times),
        },
    }
    weather = {"current": {"temperature_2m": temp, "relative_humidity_2m": 80, "wind_speed_10m": wind}}
    return air, weather


def mock_transport(
    air: dict[str, Any], weather: dict[str, Any], calls: list[httpx.Request] | None = None
) -> httpx.MockTransport:
    def handler(request: httpx.Request) -> httpx.Response:
        if calls is not None:
            calls.append(request)
        host = request.url.host
        if host.startswith("air-quality"):
            return httpx.Response(200, json=air)
        if host.startswith("geocoding"):
            return httpx.Response(
                200,
                json={
                    "results": [
                        {
                            "name": "Delhi",
                            "admin1": "Delhi",
                            "country": "India",
                            "latitude": 28.65,
                            "longitude": 77.23,
                        }
                    ]
                },
            )
        return httpx.Response(200, json=weather)

    return httpx.MockTransport(handler)


class FakeModel:
    """Stands in for Gemini. Returns `reply(prompt)` or raises `error`."""

    model_name = "fake-model"

    def __init__(
        self, reply: Callable[[str], BaseModel] | None = None, error: Exception | None = None
    ) -> None:
        self.reply = reply
        self.error = error
        self.prompts: list[tuple[str, str]] = []

    async def generate[T: BaseModel](self, system: str, prompt: str, schema: type[T]) -> T:
        self.prompts.append((system, prompt))
        if self.error:
            raise self.error
        assert self.reply is not None
        return schema.model_validate(self.reply(prompt).model_dump())


def make_settings(**overrides: Any) -> Settings:
    values: dict[str, Any] = {
        "gemini_api_key": None,
        "ai_rate_limit": "1000/minute",
        "data_rate_limit": "1000/minute",
        **overrides,
    }
    return Settings(**values)


@asynccontextmanager
async def api_client(
    *,
    model: FakeModel | None = None,
    transport: httpx.MockTransport | None = None,
    settings: Settings | None = None,
) -> AsyncIterator[httpx.AsyncClient]:
    """The real app, wired to a mock upstream and an optional fake model."""
    upstream = httpx.AsyncClient(transport=transport or mock_transport(*open_meteo_payloads()))
    app = create_app(settings or make_settings(), http_client=upstream, narrative_model=model)
    async with (
        app.router.lifespan_context(app),
        httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://test") as client,
    ):
        yield client
    await upstream.aclose()
