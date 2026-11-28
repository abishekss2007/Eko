"""Liveness probe for Cloud Run."""

from fastapi import APIRouter, Request

router = APIRouter(prefix="/api", tags=["meta"])


@router.get("/health")
async def health(request: Request) -> dict[str, str | bool]:
    return {"status": "ok", "ai_enabled": request.app.state.ai_enabled}
