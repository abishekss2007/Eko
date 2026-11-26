"""Account models. Accounts hold only a name and e-mail; health data never leaves the browser."""

import re

from pydantic import BaseModel, ConfigDict, Field, field_validator

_EMAIL = re.compile(r"^[^@\s]{1,64}@[^@\s]+\.[^@\s]{2,}$")


def _normalize_email(value: str) -> str:
    value = value.strip().lower()
    if len(value) > 254 or not _EMAIL.match(value):
        raise ValueError("Enter a valid e-mail address")
    return value


class LoginRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    email: str = Field(max_length=254)
    password: str = Field(min_length=1, max_length=128)

    _email = field_validator("email")(_normalize_email)


class SignupRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    name: str = Field(min_length=1, max_length=60)
    email: str = Field(max_length=254)
    password: str = Field(min_length=8, max_length=128)

    _email = field_validator("email")(_normalize_email)

    @field_validator("name")
    @classmethod
    def _clean_name(cls, value: str) -> str:
        cleaned = " ".join("".join(ch for ch in value if ch.isprintable() and ch not in "<>").split())
        if not cleaned:
            raise ValueError("Enter your name")
        return cleaned

    @field_validator("password")
    @classmethod
    def _strength(cls, value: str) -> str:
        if len(set(value)) < 4 or value.isdigit():
            raise ValueError("Use at least 8 characters with a mix of letters, numbers or symbols")
        return value


class User(BaseModel):
    id: int
    name: str
    email: str


class DemoAccount(BaseModel):
    """Public credentials of the shared demo account (deliberately not secret)."""

    email: str
    password: str
