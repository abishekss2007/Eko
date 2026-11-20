"""Post-generation checks: every number in model text must come from verified data."""

import re
import unicodedata
from collections.abc import Iterable
from typing import Any

_NUMBER = re.compile(r"\d+(?:\.\d+)?")
_NAMED_TOKENS = re.compile(r"PM\s*2\.5|PM\s*10|NO\s*2|CO\s*2|m\s*3|Member_\d+|NAQI|AQI", re.IGNORECASE)
_DOSING = re.compile(r"\b(mg|mcg|ml|puffs?|tablets?|capsules?|dosage|milligrams?)\b", re.IGNORECASE)
ALWAYS_ALLOWED = frozenset({2.5, 10.0, 108.0, 112.0, *map(float, range(11))})
TOLERANCE = 0.5


def normalize_digits(text: str) -> str:
    """Map any Unicode decimal digit (Devanagari, Tamil, Bengali...) to ASCII."""
    out = []
    for ch in unicodedata.normalize("NFKC", text):
        digit = unicodedata.decimal(ch, None)
        out.append(str(digit) if digit is not None and not ch.isascii() else ch)
    return "".join(out)


def extract_numbers(text: str) -> list[float]:
    cleaned = _NAMED_TOKENS.sub(" ", normalize_digits(text))
    return [float(n) for n in _NUMBER.findall(cleaned)]


def allowed_numbers(verified: Any) -> set[float]:
    """Every number that appears anywhere in the verified payload, including inside strings."""
    found: set[float] = set(ALWAYS_ALLOWED)

    def walk(node: Any) -> None:
        if isinstance(node, bool) or node is None:
            return
        if isinstance(node, int | float):
            found.add(float(node))
        elif isinstance(node, str):
            found.update(extract_numbers(node))
        elif isinstance(node, dict):
            for key, value in node.items():
                walk(key)
                walk(value)
        elif isinstance(node, list | tuple):
            for value in node:
                walk(value)

    walk(verified)
    return found


def ungrounded_numbers(texts: Iterable[str], allowed: set[float]) -> list[float]:
    """Numbers in `texts` that do not match an allowed value within rounding tolerance."""
    return [
        n
        for text in texts
        for n in extract_numbers(text)
        if not any(abs(n - a) <= TOLERANCE for a in allowed)
    ]


def mentions_dosing(texts: Iterable[str]) -> bool:
    """True if the text talks about doses or units of medicine."""
    return any(_DOSING.search(t) for t in texts)
