"""Models for past weather and air quality at a place: yesterday, a daily trend and records."""

from datetime import date, datetime

from pydantic import BaseModel, Field

from app.schemas.air import Location


class DaySummary(BaseModel):
    """One completed local day. Every value is computed from hourly readings by code."""

    date: date
    temp_max_c: float | None
    temp_max_time: datetime | None = Field(description="Local hour the day's highest temperature was reached.")
    temp_min_c: float | None
    temp_min_time: datetime | None
    precipitation_mm: float | None
    wind_max_kmh: float | None
    humidity_mean: float | None = Field(description="%")
    pm2_5_mean: float | None = Field(description="ug/m3, 24-hour mean")
    pm2_5_peak: float | None = Field(description="ug/m3, highest hourly reading")
    naqi: int | None = Field(description="CPCB NAQI from the day's 24-hour means; None if under 16 hours of data.")
    naqi_category: str | None
    naqi_color: str | None


class PeriodRecord(BaseModel):
    """An extreme within the selected period, and when it happened."""

    value: float
    date: date
    time: datetime | None = Field(default=None, description="Local hour, for hourly extremes.")
    category: str | None = Field(default=None, description="NAQI category, for air records.")


class PeriodRecords(BaseModel):
    hottest: PeriodRecord | None = Field(description="Highest hourly temperature, C.")
    coldest: PeriodRecord | None = Field(description="Lowest hourly temperature, C.")
    wettest: PeriodRecord | None = Field(description="Most rain in one day, mm. None if it stayed dry.")
    windiest: PeriodRecord | None = Field(description="Strongest hourly wind, km/h.")
    worst_air: PeriodRecord | None = Field(description="Highest daily NAQI.")
    cleanest_air: PeriodRecord | None = Field(description="Lowest daily NAQI.")
    pm2_5_peak: PeriodRecord | None = Field(description="Highest hourly PM2.5, ug/m3.")
    average_naqi: int | None
    days_poor_or_worse: int = Field(description="Days with NAQI above 200 (Poor, Very Poor or Severe).")


class YearRecord(BaseModel):
    value: float
    date: date


class CalendarDayRecord(BaseModel):
    """How today's calendar date has behaved in every year of the archive."""

    month: int = Field(ge=1, le=12)
    day: int = Field(ge=1, le=31)
    record_high: YearRecord | None
    record_low: YearRecord | None
    average_high_c: float | None
    years: int


class LongTermRecords(BaseModel):
    """Daily extremes from the ERA5 reanalysis archive (about 9 km grid)."""

    since: date
    until: date
    hottest_day: YearRecord | None = Field(description="Highest daily maximum temperature, C.")
    coldest_day: YearRecord | None = Field(description="Lowest daily minimum temperature, C.")
    today: CalendarDayRecord | None
    yesterday_vs_average_c: float | None = Field(
        description="Yesterday's high minus the long-term average high for that calendar date."
    )


class HistoryReport(BaseModel):
    location: Location
    days: int
    yesterday: DaySummary | None
    daily: list[DaySummary] = Field(description="Completed days, oldest first. Today is excluded.")
    records: PeriodRecords
    long_term: LongTermRecords | None = Field(description="None if the archive could not be reached.")
    air_available: bool
    sources: list[str]
