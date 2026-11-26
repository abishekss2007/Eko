"""Per-account household storage in the accounts database."""

import json
import logging
import sqlite3
import time

from pydantic import ValidationError

from app.schemas.family import FamilyMember, Household
from app.services.auth_service import AuthService

logger = logging.getLogger("saanssafe.family")

DEMO_NAME = "Demo Family"
DEMO_HOUSEHOLD = Household(
    members=[
        FamilyMember(
            id="demo-dadi",
            name="Dadi",
            age_group="senior",
            sensitivities=["copd"],
            care_note="Dr. Sharma: keep the nebulizer ready in winter and skip the morning walk.",
        ),
        FamilyMember(
            id="demo-aarav",
            name="Aarav",
            age_group="child",
            sensitivities=["asthma"],
            care_note="Rescue inhaler in school bag.",
        ),
        FamilyMember(id="demo-meera", name="Meera", age_group="adult", sensitivities=["pregnancy"]),
        FamilyMember(id="demo-raj", name="Raj", age_group="adult"),
    ],
    doctor_phone="+91 98100 00000",
    hospital_phone="011 2658 8500",
)


class FamilyService:
    """Reads and writes one household per account. Only called for signed-in users."""

    def __init__(self, auth: AuthService) -> None:
        self._auth = auth

    async def get(self, user_id: int) -> Household:
        def read(db: sqlite3.Connection) -> str | None:
            row = db.execute("SELECT data FROM households WHERE user_id = ?", (user_id,)).fetchone()
            return row[0] if row else None

        raw = await self._auth.transact(read)
        if raw is None:
            return Household()
        try:
            return Household.model_validate_json(raw)
        except ValidationError:
            logger.warning("Stored household for user %s failed validation; returning empty", user_id)
            return Household()

    async def save(self, user_id: int, household: Household) -> Household:
        data = json.dumps(household.model_dump(), separators=(",", ":"))

        def write(db: sqlite3.Connection) -> None:
            db.execute(
                "INSERT INTO households (user_id, data, updated_at) VALUES (?, ?, ?) "
                "ON CONFLICT(user_id) DO UPDATE SET data = excluded.data, updated_at = excluded.updated_at",
                (user_id, data, int(time.time())),
            )

        await self._auth.transact(write)
        return household

    async def seed_demo(self, email: str, password: str) -> None:
        """Create (or reset) the shared demo account with a sample family."""
        user = await self._auth.ensure_user(DEMO_NAME, email.strip().lower(), password)
        await self.save(user.id, DEMO_HOUSEHOLD)
