from types import SimpleNamespace
from typing import Any

import pytest
from pydantic import BaseModel

from app.services.gemini_service import GeminiNarrativeModel, build_narrative_model
from tests.helpers import make_settings


class Out(BaseModel):
    text: str


class FakeModels:
    def __init__(self, response: Any) -> None:
        self.response = response
        self.kwargs: dict[str, Any] = {}

    async def generate_content(self, **kwargs: Any) -> Any:
        self.kwargs = kwargs
        return self.response


def model_with(response: Any, **overrides: Any) -> tuple[GeminiNarrativeModel, FakeModels]:
    model = GeminiNarrativeModel(make_settings(gemini_api_key="test-key", **overrides))
    fake = FakeModels(response)
    model._client = SimpleNamespace(aio=SimpleNamespace(models=fake))  # type: ignore[assignment]
    return model, fake


def test_no_key_means_no_model() -> None:
    assert build_narrative_model(make_settings(gemini_api_key=None)) is None
    assert build_narrative_model(make_settings(gemini_api_key="  ")) is None
    assert isinstance(build_narrative_model(make_settings(gemini_api_key="k")), GeminiNarrativeModel)


def test_constructor_requires_key() -> None:
    with pytest.raises(ValueError, match="GEMINI_API_KEY"):
        GeminiNarrativeModel(make_settings(gemini_api_key=None))


async def test_generate_uses_schema_locked_json_config() -> None:
    model, fake = model_with(SimpleNamespace(parsed=Out(text="hi"), text=None), gemini_model="gemini-x")
    result = await model.generate("sys", "prompt", Out)
    assert result == Out(text="hi")
    config = fake.kwargs["config"]
    assert fake.kwargs["model"] == "gemini-x"
    assert config.response_mime_type == "application/json"
    assert config.response_schema is Out
    assert config.temperature == 0.3
    assert config.system_instruction == "sys"
    assert config.thinking_config.thinking_budget == 0


async def test_generate_parses_text_when_sdk_does_not() -> None:
    model, fake = model_with(SimpleNamespace(parsed=None, text='{"text": "ok"}'), gemini_thinking_budget=None)
    assert (await model.generate("s", "p", Out)).text == "ok"
    assert fake.kwargs["config"].thinking_config is None
