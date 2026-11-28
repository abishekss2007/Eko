"""FastAPI dependencies. Services live on `app.state`, so tests can swap them."""

from fastapi import Request

from app.services.air_service import AirService
from app.services.family_service import FamilyService
from app.services.history_service import HistoryService
from app.services.planner_service import PlannerService
from app.services.shield_service import ShieldService


def get_air_service(request: Request) -> AirService:
    service: AirService = request.app.state.air_service
    return service


def get_shield_service(request: Request) -> ShieldService:
    service: ShieldService = request.app.state.shield_service
    return service


def get_planner_service(request: Request) -> PlannerService:
    service: PlannerService = request.app.state.planner_service
    return service


def get_family_service(request: Request) -> FamilyService:
    service: FamilyService = request.app.state.family_service
    return service


def get_history_service(request: Request) -> HistoryService:
    service: HistoryService = request.app.state.history_service
    return service
