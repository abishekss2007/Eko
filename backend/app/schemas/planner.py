"""Models for the daily plan, indoor planner, commute optimizer and civic drafter."""

import re
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator

from app.data import CostTier, Impact, Mode
from app.schemas.air import AirReport
from app.schemas.shield import Language, MemberInput
from app.services.sanitize import sanitize_user_text

NarrativeSource = Literal["gemini", "rules"]


class _Located(BaseModel):
    model_config = ConfigDict(extra="forbid")

    latitude: float = Field(ge=-90, le=90)
    longitude: float = Field(ge=-180, le=180)
    simulate: bool = False
    language: Language = "en"


# ---------------- Today's plan ----------------


class PlanRequest(_Located):
    members: list[MemberInput] = Field(default_factory=list, max_length=10)


class PlanAction(BaseModel):
    id: str
    text: str


class DailyPlan(BaseModel):
    """Deterministic decision for the day."""

    stance: Literal["stay_in", "limit", "normal"]
    go_out_start: str | None = Field(description="HH:MM local, cleanest window start")
    go_out_end: str | None
    stay_indoors: list[str] = Field(description="member_ids who should stay indoors")
    use_purifier: bool
    actions: list[PlanAction]


class PlanNarrative(BaseModel):
    headline: str = Field(description="One short sentence telling the family what to do today")
    steps: list[str] = Field(description="3-5 short, specific actions in priority order")


class PlanResponse(BaseModel):
    air: AirReport
    plan: DailyPlan
    narrative: PlanNarrative
    narrative_source: NarrativeSource


# ---------------- Indoor planner ----------------


class Room(BaseModel):
    model_config = ConfigDict(extra="forbid")

    length_m: float = Field(gt=0, le=30)
    width_m: float = Field(gt=0, le=30)
    height_m: float = Field(gt=0, le=6)


class IndoorRequest(_Located):
    room: Room
    cooking_fuel: Literal["lpg", "induction", "solid_fuel"]
    ventilation: Literal["windows_open_daytime", "mostly_closed", "exhaust_fan"]
    incense_or_coil: bool
    sweeping: Literal["dry", "wet"]
    purifier_cadr_m3h: float = Field(default=0, ge=0, le=2000)
    filter_age_months: int = Field(default=0, ge=0, le=60)
    budget_tier: CostTier


class RankedFix(BaseModel):
    id: str
    title: str
    cost_tier: CostTier
    impact: Impact
    reason: str


class IndoorAssessment(BaseModel):
    room_volume_m3: float
    target_ach: float
    required_cadr_m3h: float
    current_cadr_m3h: float
    effective_ach: float
    cadr_gap_m3h: float
    filter_overdue: bool
    pollution_sources: list[str]
    fixes: list[RankedFix]


class ActionNarrative(BaseModel):
    summary: str = Field(description="2 sentences: the main indoor or commute finding with its exact numbers")
    impact_reasoning: str = Field(description="1 sentence linking the verified numbers to the family's exposure")
    explanations: list[str] = Field(description="One short sentence per ranked item, same order as given")


class IndoorResponse(BaseModel):
    air: AirReport
    assessment: IndoorAssessment
    narrative: ActionNarrative
    narrative_source: NarrativeSource


# ---------------- Commute optimizer ----------------

_HHMM = re.compile(r"^([01]\d|2[0-3]):[0-5]\d$")


class CommuteRequest(_Located):
    distance_km: float = Field(gt=0, le=100)
    current_mode: Mode
    departure: str = Field(description="HH:MM local time", pattern=_HHMM.pattern)
    duration_min: int | None = Field(default=None, ge=1, le=300)
    flexible: bool = Field(default=True, description="May shift departure by up to 2 hours")


class ModeOption(BaseModel):
    mode: Mode
    label: str
    departure: str
    duration_min: int
    ambient_pm2_5: float
    inhaled_dose_ug: float
    co2_kg: float


class CommuteFactors(BaseModel):
    formula_dose: str
    formula_co2: str
    sources: list[str]
    modes: dict[str, dict[str, float | str | bool]]


class CommutePlan(BaseModel):
    baseline: ModeOption
    recommended: ModeOption
    options: list[ModeOption]
    dose_saved_ug: float
    dose_saved_pct: float
    co2_saved_kg: float
    shifted: bool
    factors: CommuteFactors


class CommuteResponse(BaseModel):
    air: AirReport
    plan: CommutePlan
    narrative: ActionNarrative
    narrative_source: NarrativeSource


# ---------------- Civic note drafter ----------------


class CivicRequest(_Located):
    kind: Literal["rwa_advisory", "burning_report"]
    locality: str = Field(default="", max_length=60)
    observation: str = Field(default="", max_length=300)

    @field_validator("locality", "observation")
    @classmethod
    def _clean(cls, value: str) -> str:
        return sanitize_user_text(value, max_length=300)


class CivicDraft(BaseModel):
    subject: str = Field(description="Email/letter subject line under 90 characters")
    body: str = Field(description="Polite, structured note of 120-200 words with the verified numbers")


class CivicResponse(BaseModel):
    air: AirReport
    draft: CivicDraft
    narrative_source: NarrativeSource
