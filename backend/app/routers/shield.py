"""Family Health Shield: risk tiers, alerts, stay-safe steps and doctor handoff."""

from typing import Annotated

from fastapi import APIRouter, Depends, Request

from app.config import get_settings
from app.dependencies import get_shield_service
from app.schemas.shield import ShieldRequest, ShieldResponse
from app.security import limiter
from app.services.shield_service import ShieldService

router = APIRouter(prefix="/api", tags=["shield"])


@router.post("/shield", response_model=ShieldResponse)
@limiter.limit(lambda: get_settings().ai_rate_limit)
async def family_health_shield(
    request: Request,
    body: ShieldRequest,
    service: Annotated[ShieldService, Depends(get_shield_service)],
) -> ShieldResponse:
    """Members must be tokenized (Member_1...). Names and phone numbers are never accepted."""
    return await service.assess(body)
