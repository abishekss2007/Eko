"""Provider responses a visitor's browser hands back (see services/relay.py)."""

from typing import Any

from pydantic import BaseModel, Field, field_validator

from app.services.relay import RELAY_URLS


class RelayedResponse(BaseModel):
    url: str = Field(max_length=200)
    params: dict[str, str] = Field(max_length=20)
    data: dict[str, Any]

    @field_validator("url")
    @classmethod
    def known_provider(cls, url: str) -> str:
        if url not in RELAY_URLS:
            raise ValueError("Not a relayed provider")
        return url

    @field_validator("params")
    @classmethod
    def short_params(cls, params: dict[str, str]) -> dict[str, str]:
        if any(len(key) > 40 or len(value) > 400 for key, value in params.items()):
            raise ValueError("Parameter too long")
        return params


class RelayRequest(BaseModel):
    id: str | None = Field(default=None, pattern=r"^[A-Za-z0-9_-]{16,64}$")
    responses: list[RelayedResponse] = Field(min_length=1, max_length=8)


class RelayReceipt(BaseModel):
    id: str
