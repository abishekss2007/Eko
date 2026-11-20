"""Shared Gemini call path: cache, timeout, schema validation and grounding checks.

Every feature hands the narrator its verified data. If the model output contains a number that
is not in that data, mentions medicine doses, or fails a feature-specific check, the caller gets
``None`` and shows its deterministic rule-based text instead.
"""

import asyncio
import hashlib
import logging
from collections.abc import Callable
from typing import Any

from pydantic import BaseModel

from app.config import Settings
from app.services.cache import TTLCache
from app.services.gemini_service import NarrativeModel
from app.services.grounding import allowed_numbers, mentions_dosing, ungrounded_numbers

logger = logging.getLogger(__name__)


def collect_texts(value: Any) -> list[str]:
    """Every string inside a (dumped) model, depth first."""
    if isinstance(value, BaseModel):
        return collect_texts(value.model_dump())
    if isinstance(value, str):
        return [value]
    if isinstance(value, dict):
        return [t for v in value.values() for t in collect_texts(v)]
    if isinstance(value, list | tuple):
        return [t for v in value for t in collect_texts(v)]
    return []


def grounding_problem(output: BaseModel, verified: Any) -> str | None:
    texts = collect_texts(output)
    bad = ungrounded_numbers(texts, allowed_numbers(verified))
    if bad:
        return f"ungrounded numbers {bad[:5]}"
    if mentions_dosing(texts):
        return "dosing language"
    return None


class Narrator:
    def __init__(self, model: NarrativeModel | None, settings: Settings) -> None:
        self._model = model
        self._timeout = settings.gemini_timeout_s
        self._cache: TTLCache[str, BaseModel] = TTLCache(settings.ai_cache_ttl_s)

    @property
    def enabled(self) -> bool:
        return self._model is not None

    async def explain[T: BaseModel](
        self,
        schema: type[T],
        system: str,
        prompt: str,
        verified: Any,
        check: Callable[[T], str | None] | None = None,
    ) -> T | None:
        """Validated model output, or None so the caller falls back to rules."""
        if self._model is None:
            return None
        key = hashlib.sha256(f"{self._model.model_name}\0{schema.__name__}\0{system}\0{prompt}".encode()).hexdigest()
        hit = self._cache.get(key)
        if isinstance(hit, schema):
            return hit
        try:
            output = await asyncio.wait_for(self._model.generate(system, prompt, schema), self._timeout)
        except Exception as exc:  # noqa: BLE001 - timeouts, SDK, network or schema errors
            logger.warning("Gemini fallback (%s): %s", schema.__name__, type(exc).__name__)
            return None
        problem = (check(output) if check else None) or grounding_problem(output, verified)
        if problem:
            logger.warning("Gemini output rejected (%s): %s", schema.__name__, problem)
            return None
        self._cache.set(key, output)
        return output
