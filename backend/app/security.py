"""Security middleware: response headers, request size cap, rate limiting, and relay binding."""

import json
from collections.abc import Awaitable, Callable

from fastapi import Request, Response
from fastapi.responses import JSONResponse
from slowapi import Limiter
from slowapi.util import get_remote_address
from starlette.middleware.base import BaseHTTPMiddleware

from app.services import relay
from app.services.relay import RELAY_ORIGINS

limiter = Limiter(key_func=get_remote_address)

CSP = "; ".join(
    [
        "default-src 'self'",
        "script-src 'self'",
        "style-src 'self'",
        "img-src 'self' data:",
        "font-src 'self'",
        "connect-src 'self' " + " ".join(RELAY_ORIGINS),
        "manifest-src 'self'",
        "worker-src 'self'",
        "object-src 'none'",
        "base-uri 'self'",
        "form-action 'self'",
        "frame-ancestors 'none'",
    ]
)
DOCS_CSP = (
    "default-src 'self'; script-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net; "
    "style-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net; img-src 'self' data: "
    "https://fastapi.tiangolo.com; frame-ancestors 'none'"
)
STATIC_HEADERS = {
    "X-Content-Type-Options": "nosniff",
    "X-Frame-Options": "DENY",
    "Referrer-Policy": "strict-origin-when-cross-origin",
    "Permissions-Policy": "geolocation=(self), camera=(), microphone=(), payment=()",
    "Cross-Origin-Opener-Policy": "same-origin",
    "Strict-Transport-Security": "max-age=31536000; includeSubDomains",
}

CallNext = Callable[[Request], Awaitable[Response]]


class SecurityHeadersMiddleware(BaseHTTPMiddleware):
    """Adds CSP and hardening headers to every response."""

    async def dispatch(self, request: Request, call_next: CallNext) -> Response:
        response = await call_next(request)
        is_docs = request.url.path.startswith(("/docs", "/redoc"))
        response.headers["Content-Security-Policy"] = DOCS_CSP if is_docs else CSP
        for name, value in STATIC_HEADERS.items():
            response.headers.setdefault(name, value)
        if request.url.path.startswith("/api/"):
            response.headers.setdefault("Cache-Control", "no-store")
        return response


class BodySizeLimitMiddleware(BaseHTTPMiddleware):
    """Rejects bodies larger than `max_bytes` before they are parsed."""

    def __init__(
        self, app: Callable[..., Awaitable[None]], max_bytes: int, overrides: dict[str, int] | None = None
    ) -> None:
        super().__init__(app)
        self._max = max_bytes
        self._overrides = overrides or {}

    async def dispatch(self, request: Request, call_next: CallNext) -> Response:
        limit = self._overrides.get(request.url.path, self._max)
        length = request.headers.get("content-length")
        if length is not None and (not length.isdigit() or int(length) > limit):
            return JSONResponse({"detail": "Request body too large"}, status_code=413)
        if request.method in ("POST", "PUT", "PATCH") and length is None:
            body = await request.body()
            if len(body) > limit:
                return JSONResponse({"detail": "Request body too large"}, status_code=413)
        return await call_next(request)


class RelayMiddleware(BaseHTTPMiddleware):
    """Binds each API request to its relay state and asks the browser for slow, optional data."""

    async def dispatch(self, request: Request, call_next: CallNext) -> Response:
        if not request.url.path.startswith("/api/"):
            return await call_next(request)
        relay_id = request.headers.get(relay.ID_HEADER)
        if relay_id is not None and not (
            16 <= len(relay_id) <= 64 and relay_id.replace("-", "").replace("_", "").isalnum()
        ):
            relay_id = None
        hub: relay.RelayHub = request.app.state.relay_hub
        ctx = hub.context_for(relay_id)
        relay.bind(hub, ctx)
        response = await call_next(request)
        if ctx.wanted:
            wanted = [item.to_json() for item in dict.fromkeys(ctx.wanted)]
            response.headers[relay.WANTED_HEADER] = json.dumps(wanted, separators=(",", ":"))
        return response
