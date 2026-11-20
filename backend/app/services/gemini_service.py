"""Thin async wrapper around the google-genai SDK with schema-locked JSON output."""

from typing import Protocol

from pydantic import BaseModel

from app.config import Settings


class NarrativeModel(Protocol):
    """Anything that can turn prompts into a validated Pydantic object."""

    model_name: str

    async def generate[T: BaseModel](self, system: str, prompt: str, schema: type[T]) -> T: ...


class GeminiNarrativeModel:
    """Calls Gemini with `response_schema` so the reply always parses into `schema`."""

    def __init__(self, settings: Settings) -> None:
        from google import genai  # imported lazily: the app runs without the key

        if settings.gemini_api_key is None:
            raise ValueError("GEMINI_API_KEY is not configured")
        self._client = genai.Client(api_key=settings.gemini_api_key.get_secret_value())
        self._settings = settings
        self.model_name = settings.gemini_model

    async def generate[T: BaseModel](self, system: str, prompt: str, schema: type[T]) -> T:
        from google.genai import types

        thinking = (
            types.ThinkingConfig(thinking_budget=self._settings.gemini_thinking_budget)
            if self._settings.gemini_thinking_budget is not None
            else None
        )
        response = await self._client.aio.models.generate_content(
            model=self.model_name,
            contents=prompt,
            config=types.GenerateContentConfig(
                system_instruction=system,
                response_mime_type="application/json",
                response_schema=schema,
                temperature=self._settings.gemini_temperature,
                max_output_tokens=4096,
                thinking_config=thinking,
            ),
        )
        if isinstance(response.parsed, schema):
            return response.parsed
        return schema.model_validate_json(response.text or "")


def build_narrative_model(settings: Settings) -> NarrativeModel | None:
    """None when no key is configured, so callers use the rule-based narrative."""
    return GeminiNarrativeModel(settings) if settings.gemini_enabled else None
