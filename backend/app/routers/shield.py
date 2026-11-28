"""Family Health Shield: risk tiers, alerts, stay-safe steps and doctor handoff."""

from typing import Annotated

from fastapi import APIRouter, Depends, Request

from app.config import get_settings
from app.dependencies import get_shield_service
from app.routers.auth import CurrentUser
from app.schemas.shield import DemoShieldRequest, ShieldRequest, ShieldResponse
from app.security import limiter
from app.services.shield_service import DEMO_MEMBERS, ShieldService

router = APIRouter(prefix="/api", tags=["shield"])
Shield = Annotated[ShieldService, Depends(get_shield_service)]


def _ai_limit() -> str:
    return get_settings().ai_rate_limit


@router.post("/shield", response_model=ShieldResponse)
@limiter.limit(_ai_limit)
async def family_health_shield(
    request: Request, body: ShieldRequest, user: CurrentUser, service: Shield
) -> ShieldResponse:
    """Signed-in users only. Members must be tokenized (Member_1...); names and numbers are refused."""
    return await service.assess(body)


@router.post("/shield/demo", response_model=ShieldResponse)
@limiter.limit(_ai_limit)
async def demo_family_health_shield(request: Request, body: DemoShieldRequest, service: Shield) -> ShieldResponse:
    """The guided demo for guests: a fixed sample family chosen by the server, never the caller's own."""
    return await service.assess(ShieldRequest(**body.model_dump(), members=DEMO_MEMBERS))
