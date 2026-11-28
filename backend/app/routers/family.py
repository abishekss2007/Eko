"""A signed-in account's family. Guests cannot read or save one (401)."""

from typing import Annotated

from fastapi import APIRouter, Depends, Request

from app.config import get_settings
from app.dependencies import get_family_service
from app.routers.auth import CurrentUser, SameOrigin
from app.schemas.family import Household
from app.security import limiter
from app.services.family_service import FamilyService

router = APIRouter(prefix="/api", tags=["family"])
Family = Annotated[FamilyService, Depends(get_family_service)]


@router.get("/family", response_model=Household)
async def get_family(user: CurrentUser, family: Family) -> Household:
    """The family saved to this account (empty if none yet)."""
    return await family.get(user.id)


@router.put("/family", response_model=Household, dependencies=[SameOrigin])
@limiter.limit(lambda: get_settings().data_rate_limit)
async def save_family(request: Request, body: Household, user: CurrentUser, family: Family) -> Household:
    """Replace this account's family. Adding members is only possible when signed in."""
    return await family.save(user.id, body)
