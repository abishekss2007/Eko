"""SaansSafe API: FastAPI app factory."""

import logging
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

import httpx
from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles
from slowapi import _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded
from starlette.exceptions import HTTPException as StarletteHTTPException
from starlette.responses import Response
from starlette.types import Scope

from app.config import Settings, get_settings
from app.routers import air, auth, family, health, history, planner, shield
from app.schemas.auth import DemoAccount
from app.security import BodySizeLimitMiddleware, SecurityHeadersMiddleware, limiter
from app.services.air_service import AirService, UpstreamError
from app.services.auth_service import AuthService
from app.services.family_service import FamilyService
from app.services.gemini_service import NarrativeModel, build_narrative_model
from app.services.history_service import HistoryService
from app.services.narrator import Narrator
from app.services.planner_service import PlannerService
from app.services.shield_service import ShieldService

logger = logging.getLogger("saanssafe")


class SpaStaticFiles(StaticFiles):
    """Serve index.html for client-side routes such as /login, /signup and /app."""

    async def get_response(self, path: str, scope: Scope) -> Response:
        try:
            response = await super().get_response(path, scope)
        except StarletteHTTPException as exc:
            if exc.status_code != 404 or path.startswith("api/") or "." in path.rsplit("/", 1)[-1]:
                raise
            response = await super().get_response("index.html", scope)
        # Pages and the service worker must be revalidated so a rebuilt image is picked up at once;
        # hashed files under /assets/ can be cached for a year.
        if path.startswith("assets/"):
            response.headers["Cache-Control"] = "public, max-age=31536000, immutable"
        else:
            response.headers["Cache-Control"] = "no-cache"
        return response


def create_app(
    settings: Settings | None = None,
    *,
    http_client: httpx.AsyncClient | None = None,
    narrative_model: NarrativeModel | None = None,
) -> FastAPI:
    """Build the app. Tests inject a mock HTTP transport and a fake narrative model."""
    settings = settings or get_settings()

    @asynccontextmanager
    async def lifespan(app: FastAPI) -> AsyncIterator[None]:
        client = http_client or httpx.AsyncClient(
            timeout=settings.upstream_timeout_s, headers={"User-Agent": "SaansSafe/1.0"}
        )
        model = narrative_model or build_narrative_model(settings)
        air_service = AirService(client, settings)
        narrator = Narrator(model, settings)
        app.state.air_service = air_service
        history_service = HistoryService(client, settings)
        app.state.history_service = history_service
        app.state.shield_service = ShieldService(air_service, narrator)
        app.state.planner_service = PlannerService(air_service, narrator)
        app.state.ai_enabled = narrator.enabled
        app.state.auth_service = AuthService(settings.database_path, settings.session_days)
        app.state.family_service = FamilyService(app.state.auth_service)
        app.state.demo_account = None
        if settings.demo_account:
            demo = DemoAccount(
                email=settings.demo_email.strip().lower(), password=settings.demo_password.get_secret_value()
            )
            await app.state.family_service.seed_demo(demo.email, demo.password)
            app.state.demo_account = demo
        app.state.cookie_secure = settings.cookie_secure
        try:
            yield
        finally:
            await history_service.aclose()
            app.state.auth_service.close()
            if http_client is None:
                await client.aclose()

    app = FastAPI(
        title="SaansSafe API",
        version="1.0.0",
        lifespan=lifespan,
        docs_url="/docs" if settings.enable_api_docs else None,
        redoc_url=None,
        openapi_url="/openapi.json" if settings.enable_api_docs else None,
    )
    app.state.limiter = limiter
    app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)  # type: ignore[arg-type]

    @app.exception_handler(UpstreamError)
    async def upstream_error(_: Request, exc: UpstreamError) -> JSONResponse:
        return JSONResponse({"detail": str(exc)}, status_code=502)

    app.add_middleware(BodySizeLimitMiddleware, max_bytes=settings.max_body_bytes)
    app.add_middleware(SecurityHeadersMiddleware)

    for module in (health, auth, air, history, shield, planner, family):
        app.include_router(module.router)

    if settings.static_dir and settings.static_dir.is_dir():
        app.mount("/", SpaStaticFiles(directory=settings.static_dir, html=True), name="frontend")
    return app


app = create_app()
