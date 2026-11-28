"""Models for the Family Health Shield.

Members arrive tokenized (``Member_1``...). Names and phone numbers never reach the server.
"""

from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator

from app.data import AgeGroup, RiskLevel, Sensitivity
from app.schemas.air import AirReport
from app.services.sanitize import sanitize_user_text

Language = Literal["en", "hi", "ta", "bn", "mr"]
MEMBER_ID_PATTERN = r"^Member_[1-9][0-9]?$"


class MemberInput(BaseModel):
    model_config = ConfigDict(extra="forbid")  # a stray "name" or "phone" field is rejected

    member_id: str = Field(pattern=MEMBER_ID_PATTERN, description="Tokenized id, never a name.")
    age_group: AgeGroup
    sensitivities: list[Sensitivity] = Field(default_factory=list, max_length=5)
    care_note: str = Field(default="", max_length=200, description="Doctor's existing advice.")

    @field_validator("sensitivities")
    @classmethod
    def _dedupe(cls, value: list[Sensitivity]) -> list[Sensitivity]:
        return list(dict.fromkeys(value))

    @field_validator("care_note")
    @classmethod
    def _clean_note(cls, value: str) -> str:
        return sanitize_user_text(value)


class DemoShieldRequest(BaseModel):
    """Guided-demo request: place and language only. The server supplies the sample family."""

    model_config = ConfigDict(extra="forbid")

    latitude: float = Field(ge=-90, le=90)
    longitude: float = Field(ge=-180, le=180)
    simulate: bool = False
    language: Language = "en"


class ShieldRequest(DemoShieldRequest):
    members: list[MemberInput] = Field(min_length=1, max_length=10)

    @field_validator("members")
    @classmethod
    def _unique_ids(cls, value: list[MemberInput]) -> list[MemberInput]:
        ids = [m.member_id for m in value]
        if len(ids) != len(set(ids)):
            raise ValueError("member_id values must be unique")
        return value


class MemberRisk(BaseModel):
    """Deterministic risk tier. The model never decides this."""

    member_id: str
    risk_level: RiskLevel
    reasons: list[str]


class HouseholdRisk(BaseModel):
    members: list[MemberRisk]
    highest_level: RiskLevel
    should_alert: bool
    red_flag_symptoms: list[str]


# ---- Gemini output schema (text only; numbers and tiers come from code) ----


class MemberShieldText(BaseModel):
    member_id: str = Field(description="Tokenized ID from input, e.g. Member_1")
    impact_reasoning: str = Field(
        description="1 sentence linking the exact PM2.5 and temperature/inversion values "
        "to this member's vulnerability."
    )
    notification_title: str = Field(description="Short push alert title under 60 characters")
    notification_body: str = Field(description="Push alert message under 140 characters")
    stay_safe_steps: list[str] = Field(description="3-4 immediate indoor protection steps")
    care_plan_reminder: str = Field(
        description="Safe reminder to follow the doctor's existing note, with no medicine "
        "names, doses or new treatments"
    )


class ShieldNarrative(BaseModel):
    climate_smog_summary: str = Field(
        description="2 sentences explaining current AQI and the weather/inversion trapping effect"
    )
    member_alerts: list[MemberShieldText]
    doctor_handoff_summary: str = Field(
        description="3-sentence script to read to a doctor or 108/112 operator, stating the "
        "outdoor AQI, PM2.5, temperature and each member's conditions"
    )


class ShieldResponse(BaseModel):
    air: AirReport
    risk: HouseholdRisk
    narrative: ShieldNarrative
    narrative_source: Literal["gemini", "rules"]
    emergency_numbers: dict[str, str]
    disclaimer: str
