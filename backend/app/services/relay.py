"""Browser relay for data providers that refuse this server.

Free providers such as Open-Meteo limit requests per IP address. On shared hosting (Render's
free tier) the server's address is often over the limit while every visitor's own address is
not. When a provider call fails, the API answers with the exact provider requests it needs;
the visitor's browser makes them, hands the JSON back through `POST /api/relay`, and retries
with an `X-Relay-Id` header. The server still does every calculation.

Relayed data is trusted only for the visitor who supplied it: it is stored under a random,
unguessable id and is never written to the shared caches, so nobody can feed false readings to
other visitors.
"""

import json
import secrets
import time
from collections import OrderedDict
from collections.abc import Callable
from contextvars import ContextVar
from dataclasses import dataclass, field
from typing import Any
from urllib.parse import urlencode, urlsplit

Json = dict[str, Any]
Params = dict[str, str | int | float]

# Provider endpoints the browser may be asked to fetch. Nothing else is ever relayed.
RELAY_URLS = frozenset(
    {
        "https://air-quality-api.open-meteo.com/v1/air-quality",
        "https://api.open-meteo.com/v1/forecast",
        "https://geocoding-api.open-meteo.com/v1/search",
        "https://archive-api.open-meteo.com/v1/archive",
        "https://photon.komoot.io/api/",
    }
)
RELAY_ORIGINS = tuple(sorted({f"https://{urlsplit(url).netloc}" for url in RELAY_URLS}))
WANTED_HEADER = "X-Relay-Wanted"
ID_HEADER = "X-Relay-Id"
_ID_CHARS = frozenset("ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_")


def valid_id(relay_id: str | None) -> bool:
    return relay_id is not None and 16 <= len(relay_id) <= 64 and set(relay_id) <= _ID_CHARS


def _provider(url: str) -> str:
    """Open-Meteo limits one address across all its APIs, so its hosts share one back-off."""
    host = urlsplit(url).netloc
    return "open-meteo.com" if host.endswith(".open-meteo.com") else host


@dataclass(frozen=True)
class ProviderRequest:
    url: str
    params: tuple[tuple[str, str], ...]

    @classmethod
    def of(cls, url: str, params: Params) -> "ProviderRequest":
        return cls(url, tuple(sorted((key, str(value)) for key, value in params.items())))

    @property
    def key(self) -> str:
        return f"{self.url}?{urlencode(self.params)}"

    def to_json(self) -> Json:
        return {"url": self.url, "params": dict(self.params)}


@dataclass
class RelayContext:
    """Per-request state: data the browser supplied, and requests it should make."""

    provided: dict[str, Json] | None = None
    needed: list[ProviderRequest] = field(default_factory=list)
    wanted: list[ProviderRequest] = field(default_factory=list)

    @property
    def active(self) -> bool:
        """True when this request is answered from the browser's data (never cache it)."""
        return self.provided is not None


class RelayHub:
    """Relayed payloads by id (short-lived, size-capped) and providers currently refusing us."""

    def __init__(
        self,
        *,
        ttl_s: float = 15 * 60,
        backoff_s: float = 5 * 60,
        max_ids: int = 200,
        max_bytes_per_id: int = 4 * 1024 * 1024,
        max_total_bytes: int = 64 * 1024 * 1024,
        clock: Callable[[], float] = time.monotonic,
    ) -> None:
        self._ttl = ttl_s
        self._backoff = backoff_s
        self._max_ids = max_ids
        self._max_bytes_per_id = max_bytes_per_id
        self._max_total = max_total_bytes
        self._clock = clock
        self._store: OrderedDict[str, tuple[float, int, dict[str, Json]]] = OrderedDict()
        self._blocked_until: dict[str, float] = {}

    # --- providers that refuse this server -------------------------------------------------
    def block(self, url: str) -> None:
        self._blocked_until[_provider(url)] = self._clock() + self._backoff

    def blocked(self, url: str) -> bool:
        return self._blocked_until.get(_provider(url), 0.0) > self._clock()

    # --- relayed payloads --------------------------------------------------------------------
    def get(self, relay_id: str) -> dict[str, Json] | None:
        item = self._store.get(relay_id)
        if item is None or item[0] <= self._clock():
            self._store.pop(relay_id, None)
            return None
        self._store.move_to_end(relay_id)
        return item[2]

    def add(self, relay_id: str | None, entries: list[tuple[ProviderRequest, Json]]) -> str:
        """Store payloads under `relay_id` (or a new id) and return the id."""
        current = self.get(relay_id) if relay_id else None
        if relay_id is None or current is None:
            relay_id, current = secrets.token_urlsafe(16), {}
        rid: str = relay_id
        size = self._store[rid][1] if rid in self._store else 0
        for request, data in entries:
            current[request.key] = data
            size += len(json.dumps(data, separators=(",", ":")))
        if size > self._max_bytes_per_id:
            raise ValueError("Relayed data is too large")
        self._store[rid] = (self._clock() + self._ttl, size, current)
        self._store.move_to_end(rid)
        while len(self._store) > self._max_ids or sum(i[1] for i in self._store.values()) > self._max_total:
            self._store.popitem(last=False)
        return rid

    def context_for(self, relay_id: str | None) -> RelayContext:
        if relay_id is None:
            return RelayContext()
        return RelayContext(provided=self.get(relay_id) or {})


_hub: ContextVar[RelayHub | None] = ContextVar("relay_hub", default=None)
_context: ContextVar[RelayContext | None] = ContextVar("relay_context", default=None)


def bind(hub: RelayHub, context: RelayContext) -> None:
    """Called once per API request by the middleware."""
    _hub.set(hub)
    _context.set(context)


def current() -> RelayContext | None:
    return _context.get()


def hub() -> RelayHub | None:
    return _hub.get()


def is_active() -> bool:
    ctx = _context.get()
    return ctx is not None and ctx.active
