"""Accounts and sessions, stored in Postgres or SQLite (see `database.py`).

Session tokens are random 256-bit values sent only in an HttpOnly cookie; the database keeps
just their SHA-256, so a leaked database cannot be replayed as a login.
"""

import asyncio
import hashlib
import secrets
import time
from collections.abc import Callable

from app.schemas.auth import User
from app.services.database import Connection, Database
from app.services.passwords import DUMMY_HASH, hash_password, verify_password


class EmailTakenError(ValueError):
    """An account with this e-mail already exists."""


def _token_hash(token: str) -> str:
    return hashlib.sha256(token.encode()).hexdigest()


class AuthService:
    def __init__(self, db: Database, session_days: int) -> None:
        self._db = db
        self._ttl = session_days * 24 * 60 * 60

    def close(self) -> None:
        self._db.close()

    async def transact[T](self, fn: Callable[[Connection], T]) -> T:
        """Run `fn` in one database transaction."""
        return await self._db.run(fn)

    async def signup(self, name: str, email: str, password: str) -> User:
        hashed = await asyncio.to_thread(hash_password, password)

        def insert(db: Connection) -> User:
            row = db.execute(
                "INSERT INTO users (name, email, password_hash, created_at) VALUES (?, ?, ?, ?) "
                "ON CONFLICT (email) DO NOTHING RETURNING id",
                (name, email, hashed, int(time.time())),
            ).fetchone()
            if row is None:
                raise EmailTakenError(email)
            return User(id=int(row[0]), name=name, email=email)

        return await self.transact(insert)

    async def ensure_user(self, name: str, email: str, password: str) -> User:
        """Create the account, or reset its name and password if it exists (used for the demo)."""
        hashed = await asyncio.to_thread(hash_password, password)

        def upsert(db: Connection) -> User:
            row = db.execute(
                "INSERT INTO users (name, email, password_hash, created_at) VALUES (?, ?, ?, ?) "
                "ON CONFLICT (email) DO UPDATE SET name = excluded.name, password_hash = excluded.password_hash "
                "RETURNING id",
                (name, email, hashed, int(time.time())),
            ).fetchone()
            return User(id=int(row[0]), name=name, email=email)

        return await self.transact(upsert)

    async def authenticate(self, email: str, password: str) -> User | None:
        row = await self.transact(
            lambda db: db.execute(
                "SELECT id, name, email, password_hash FROM users WHERE email = ?", (email,)
            ).fetchone()
        )
        stored = row[3] if row else DUMMY_HASH
        ok = await asyncio.to_thread(verify_password, password, stored)
        return User(id=row[0], name=row[1], email=row[2]) if row and ok else None

    async def create_session(self, user: User) -> str:
        token = secrets.token_urlsafe(32)
        now = int(time.time())

        def insert(db: Connection) -> None:
            db.execute("DELETE FROM sessions WHERE expires_at < ?", (now,))
            db.execute(
                "INSERT INTO sessions (token_hash, user_id, expires_at) VALUES (?, ?, ?)",
                (_token_hash(token), user.id, now + self._ttl),
            )

        await self.transact(insert)
        return token

    async def user_for(self, token: str) -> User | None:
        row = await self.transact(
            lambda db: db.execute(
                "SELECT u.id, u.name, u.email FROM sessions s JOIN users u ON u.id = s.user_id "
                "WHERE s.token_hash = ? AND s.expires_at > ?",
                (_token_hash(token), int(time.time())),
            ).fetchone()
        )
        return User(id=row[0], name=row[1], email=row[2]) if row else None

    async def end_session(self, token: str) -> None:
        await self.transact(lambda db: db.execute("DELETE FROM sessions WHERE token_hash = ?", (_token_hash(token),)))

    @property
    def session_seconds(self) -> int:
        return self._ttl
