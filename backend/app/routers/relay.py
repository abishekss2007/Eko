"""Accepts provider data fetched by the visitor's browser when a provider refuses this server."""

from fastapi import APIRouter, HTTPException, Request

from app.config import get_settings
from app.schemas.relay import RelayReceipt, RelayRequest
from app.security import limiter
from app.services.relay import ProviderRequest, RelayHub

router = APIRouter(prefix="/api", tags=["relay"])


@router.post("/relay", response_model=RelayReceipt)
@limiter.limit(lambda: get_settings().data_rate_limit)
async def relay(request: Request, body: RelayRequest) -> RelayReceipt:
    """Store the browser's provider responses under a private id for its next requests."""
    hub: RelayHub = request.app.state.relay_hub
    entries = [(ProviderRequest.of(item.url, dict(item.params)), item.data) for item in body.responses]
    try:
        relay_id = hub.add(body.id, entries)
    except ValueError as exc:
        raise HTTPException(status_code=413, detail=str(exc)) from exc
    return RelayReceipt(id=relay_id)
