"""Models for verified air-quality and weather data."""

from datetime import datetime

from pydantic import BaseModel, Field

from app.data import Pollutant


class Location(BaseModel):
    latitude: float = Field(ge=-90, le=90)
    longitude: float = Field(ge=-180, le=180)
    timezone: str | None = Field(default=None, max_length=64)


class CurrentConditions(BaseModel):
    time: datetime = Field(description="Local time of the reading.")
    pm2_5: float | None = Field(description="ug/m3")
    pm10: float | None = Field(description="ug/m3")
    no2: float | None = Field(description="ug/m3")
    temperature_c: float | None
    relative_humidity: float | None = Field(description="%")
    wind_kmh: float | None


class SubIndex(BaseModel):
    pollutant: Pollutant
    concentration: float = Field(description="Averaged concentration used, ug/m3")
    index: int


class NaqiResult(BaseModel):
    value: int = Field(ge=0, le=500)
    category: str
    color: str
    health_impact: str
    dominant_pollutant: Pollutant
    sub_indices: list[SubIndex]
    is_24h_average: bool = Field(description="False when fewer than 16 hourly readings were available.")


class InversionCheck(BaseModel):
    name: str
    value: float | None
    threshold: float
    met: bool


class InversionResult(BaseModel):
    detected: bool
    checks: list[InversionCheck]


class HourlyPoint(BaseModel):
    time: datetime
    pm2_5: float | None


class BestWindow(BaseModel):
    start: datetime
    end: datetime
    mean_pm2_5: float
    indicative_aqi: int
    category: str


class AirReport(BaseModel):
    """Everything the dashboard shows. Every number here is computed by code."""

    location: Location
    current: CurrentConditions
    naqi: NaqiResult
    inversion: InversionResult
    best_window: BestWindow | None
    forecast: list[HourlyPoint] = Field(description="Next 24 hours of PM2.5 for the chart.")
    simulated: bool
    source: str


class GeocodeResult(BaseModel):
    name: str
    admin1: str | None = None
    country: str | None = None
    latitude: float
    longitude: float
