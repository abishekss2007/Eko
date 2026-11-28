"""Past weather and air quality for the selected place."""

from datetime import date
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query, Request

from app.config import get_settings
from app.dependencies import get_history_service
from app.schemas.history import DayDetail, HistoryReport
from app.security import limiter
from app.services.history_service import MAX_DAYS, HistoryService

router = APIRouter(prefix="/api", tags=["history"])


@router.get("/history", response_model=HistoryReport)
@limiter.limit(lambda: get_settings().data_rate_limit)
async def history(
    request: Request,
    service: Annotated[HistoryService, Depends(get_history_service)],
    lat: Annotated[float, Query(ge=-90, le=90)],
    lon: Annotated[float, Query(ge=-180, le=180)],
    days: Annotated[int, Query(ge=7, le=MAX_DAYS)] = 30,
) -> HistoryReport:
    """Yesterday's weather and air, a daily trend, and the hottest, coldest and worst-air records."""
    return await service.report(lat, lon, days)


@router.get("/history/day", response_model=DayDetail)
@limiter.limit(lambda: get_settings().data_rate_limit)
async def history_day(
    request: Request,
    service: Annotated[HistoryService, Depends(get_history_service)],
    lat: Annotated[float, Query(ge=-90, le=90)],
    lon: Annotated[float, Query(ge=-180, le=180)],
    day: Annotated[date, Query(alias="date")],
) -> DayDetail:
    """One past day (up to 90 days back): its summary and every hour of weather and PM2.5."""
    detail = await service.day(lat, lon, day)
    if detail is None:
        raise HTTPException(status_code=404, detail="Pick a day from the last 90 days, before today.")
    return detail
