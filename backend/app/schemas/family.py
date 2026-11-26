"""A signed-in account's family: who lives at home and their emergency contacts.

Stored per account so only signed-in users can keep a family. Names and phone numbers stay in
this store; the Family Health Shield and Gemini still receive members only as ``Member_N`` codes.
"""

import unicodedata

from pydantic import BaseModel, ConfigDict, Field, field_validator

from app.data import AgeGroup, Sensitivity

MAX_MEMBERS = 10


def _plain_text(value: str) -> str:
    """Drop control characters and angle brackets; keep the user's own spacing while they type."""
    return "".join(ch for ch in value if unicodedata.category(ch)[0] != "C" and ch not in "<>")


class FamilyMember(BaseModel):
    model_config = ConfigDict(extra="forbid")

    id: str = Field(pattern=r"^[A-Za-z0-9-]{1,40}$", description="Client-made id, e.g. a UUID.")
    name: str = Field(default="", max_length=40)
    age_group: AgeGroup
    sensitivities: list[Sensitivity] = Field(default_factory=list, max_length=5)
    care_note: str = Field(default="", max_length=200, description="Doctor's existing advice.")

    _clean = field_validator("name", "care_note")(_plain_text)

    @field_validator("sensitivities")
    @classmethod
    def _dedupe(cls, value: list[Sensitivity]) -> list[Sensitivity]:
        return list(dict.fromkeys(value))


class Household(BaseModel):
    model_config = ConfigDict(extra="forbid")

    members: list[FamilyMember] = Field(default_factory=list, max_length=MAX_MEMBERS)
    doctor_phone: str = Field(default="", max_length=20, pattern=r"^[0-9+()\s.-]*$")
    hospital_phone: str = Field(default="", max_length=20, pattern=r"^[0-9+()\s.-]*$")

    @field_validator("members")
    @classmethod
    def _unique_ids(cls, value: list[FamilyMember]) -> list[FamilyMember]:
        if len({m.id for m in value}) != len(value):
            raise ValueError("member ids must be unique")
        return value
