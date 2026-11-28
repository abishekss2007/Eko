"""Dashboard data: live or simulated air report, and place search."""

from typing import Annotated

from fastapi import APIRouter, Depends, Query, Request

from app.config import get_settings
from app.dependencies import get_air_service
from app.schemas.air import AirReport, GeocodeResult
from app.security import limiter
from app.services.air_service import AirService

router = APIRouter(prefix="/api", tags=["air"])
AirDep = Annotated[AirService, Depends(get_air_service)]


@router.get("/air", response_model=AirReport)
@limiter.limit(lambda: get_settings().data_rate_limit)
async def air_report(
    request: Request,
    service: AirDep,
    lat: Annotated[float, Query(ge=-90, le=90)],
    lon: Annotated[float, Query(ge=-180, le=180)],
    simulate: bool = False,
) -> AirReport:
    """CPCB NAQI, current weather, inversion flag and best outdoor window."""
    return await service.report(lat, lon, simulate=simulate)


@router.get("/geocode", response_model=list[GeocodeResult])
@limiter.limit(lambda: get_settings().data_rate_limit)
async def geocode(
    request: Request,
    service: AirDep,
    q: Annotated[str, Query(min_length=2, max_length=80, pattern=r"^[\w\s,.'()&/-]+$")],
) -> list[GeocodeResult]:
    """Search for any city, town, village, locality or landmark by name, worldwide."""
    return await service.geocode(q.strip())
