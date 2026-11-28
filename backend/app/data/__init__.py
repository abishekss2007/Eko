"""Typed access to `assumptions.json`, the single source of every engine constant."""

import json
from functools import lru_cache
from pathlib import Path
from typing import Literal

from pydantic import BaseModel, ConfigDict

RiskLevel = Literal["low", "moderate", "high", "very_high", "emergency"]
AgeGroup = Literal["infant", "child", "adult", "senior"]
Sensitivity = Literal["asthma", "copd", "heart_disease", "pregnancy", "diabetes"]
Pollutant = Literal["pm2_5", "pm10", "no2"]
CostTier = Literal["zero_rupee", "under_1000", "under_5000"]
Impact = Literal["high", "medium", "low"]
Mode = Literal["car_petrol_solo", "two_wheeler", "auto_rickshaw", "bus", "metro", "carpool", "walk", "cycle"]
FixTrigger = Literal["always", "dry_sweeping", "incense", "solid_fuel", "lpg", "old_filter", "cadr_gap"]

_PATH = Path(__file__).with_name("assumptions.json")


class _Frozen(BaseModel):
    model_config = ConfigDict(frozen=True, extra="ignore")


class NaqiCategory(_Frozen):
    name: str
    aqi_low: int
    aqi_high: int
    color: str
    health_impact: str


class NaqiAssumptions(_Frozen):
    source: str
    min_hours_for_24h_average: int
    categories: tuple[NaqiCategory, ...]
    breakpoints_ug_m3: dict[Pollutant, tuple[tuple[float, float], ...]]
    index_bands: tuple[tuple[int, int], ...]


class InversionAssumptions(_Frozen):
    source: str
    max_temperature_c: float
    max_wind_kmh: float
    min_pm2_5_ug_m3: float


class WindowAssumptions(_Frozen):
    source: str
    earliest_start_hour: int
    latest_end_hour: int
    duration_hours: int
    lookahead_hours: int


class RiskAssumptions(_Frozen):
    source: str
    levels: tuple[RiskLevel, ...]
    general_public_by_category: dict[str, RiskLevel]
    vulnerable_age_groups: frozenset[AgeGroup]
    medical_sensitivities: frozenset[Sensitivity]
    inversion_sensitive_conditions: frozenset[Sensitivity]
    emergency_requires_medical_sensitivity: bool
    alert_threshold: RiskLevel


class RedFlagAssumptions(_Frozen):
    source: str
    general: tuple[str, ...]
    by_condition: dict[str, tuple[str, ...]]


class EmergencyNumbers(_Frozen):
    source: str
    ambulance: str
    national_emergency: str


class SimulationAssumptions(_Frozen):
    source: str
    pm2_5: float
    pm10: float
    no2: float
    temperature_c: float
    relative_humidity: float
    wind_kmh: float
    afternoon_clean_pm2_5: float


class IndoorFix(_Frozen):
    id: str
    title: str
    cost_tier: CostTier
    impact: Impact
    when: FixTrigger


class IndoorAssumptions(_Frozen):
    source: str
    target_ach: float
    filter_replace_months: int
    fixes: tuple[IndoorFix, ...]


class ModeFactors(_Frozen):
    label: str
    speed_kmh: float
    breathing_m3h: float
    micro_factor: float
    co2_kg_per_km: float
    low_emission: bool


class CommuteAssumptions(_Frozen):
    source: str
    breathing_rate_source: str
    microenvironment_source: str
    emission_source: str
    speed_source: str
    modes: dict[Mode, ModeFactors]
    max_active_km: dict[Mode, float]
    max_shift_hours: int


class DailyPlanAssumptions(_Frozen):
    source: str
    stay_in_categories: frozenset[str]
    limit_categories: frozenset[str]
    purifier_categories: frozenset[str]


class Assumptions(_Frozen):
    naqi: NaqiAssumptions
    inversion: InversionAssumptions
    outdoor_window: WindowAssumptions
    risk: RiskAssumptions
    red_flags: RedFlagAssumptions
    emergency_numbers: EmergencyNumbers
    simulation: SimulationAssumptions
    indoor: IndoorAssumptions
    commute: CommuteAssumptions
    daily_plan: DailyPlanAssumptions


@lru_cache
def get_assumptions() -> Assumptions:
    """Parse and validate the assumptions file once."""
    return Assumptions.model_validate(json.loads(_PATH.read_text(encoding="utf-8")))
