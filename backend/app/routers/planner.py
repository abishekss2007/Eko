"""Today's plan, indoor planner, commute optimizer and civic note drafter."""

from typing import Annotated

from fastapi import APIRouter, Depends, Request

from app.config import get_settings
from app.dependencies import get_planner_service
from app.schemas.planner import (
    CivicRequest,
    CivicResponse,
    CommuteRequest,
    CommuteResponse,
    IndoorRequest,
    IndoorResponse,
    PlanRequest,
    PlanResponse,
)
from app.security import limiter
from app.services.planner_service import PlannerService

router = APIRouter(prefix="/api", tags=["planner"])
Planner = Annotated[PlannerService, Depends(get_planner_service)]


def _ai_limit() -> str:
    return get_settings().ai_rate_limit


@router.post("/plan", response_model=PlanResponse)
@limiter.limit(_ai_limit)
async def todays_plan(request: Request, body: PlanRequest, service: Planner) -> PlanResponse:
    """One decision for the family today: when to go out, who stays in, which room actions."""
    return await service.plan(body)


@router.post("/indoor", response_model=IndoorResponse)
@limiter.limit(_ai_limit)
async def indoor_planner(request: Request, body: IndoorRequest, service: Planner) -> IndoorResponse:
    """Purifier sizing (CADR) and budget-filtered home fixes ranked by impact."""
    return await service.indoor(body)


@router.post("/commute", response_model=CommuteResponse)
@limiter.limit(_ai_limit)
async def commute_optimizer(request: Request, body: CommuteRequest, service: Planner) -> CommuteResponse:
    """Inhaled PM2.5 dose and CO2 by mode and departure time."""
    return await service.commute(body)


@router.post("/civic", response_model=CivicResponse)
@limiter.limit(_ai_limit)
async def civic_drafter(request: Request, body: CivicRequest, service: Planner) -> CivicResponse:
    """Draft an RWA advisory or an open-burning complaint."""
    return await service.civic(body)
