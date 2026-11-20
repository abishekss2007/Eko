"""Cleaning untrusted free text before it is placed inside a prompt."""

import re
import unicodedata

_PHONE = re.compile(r"\+?\d[\d\s().-]{6,}\d")
_EMAIL = re.compile(r"[\w.+-]+@[\w-]+\.[\w.-]+")
_TAG_CHARS = str.maketrans({"<": " ", ">": " ", "{": " ", "}": " ", "`": " "})
_SPACES = re.compile(r"\s+")


def sanitize_user_text(text: str, max_length: int = 200) -> str:
    """Strip control characters, prompt delimiters and contact details.

    - Removes ``< > { } ` `` so text cannot close our XML delimiters or format braces.
    - Replaces phone numbers and e-mail addresses so they never reach the model.
    """
    cleaned = "".join(ch for ch in unicodedata.normalize("NFKC", text) if unicodedata.category(ch)[0] != "C")
    cleaned = cleaned.translate(_TAG_CHARS)
    cleaned = _EMAIL.sub("[contact removed]", cleaned)
    cleaned = _PHONE.sub("[number removed]", cleaned)
    return _SPACES.sub(" ", cleaned).strip()[:max_length]
