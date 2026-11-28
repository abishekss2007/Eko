"""Accounts and sessions in SQLite.

Session tokens are random 256-bit values sent only in an HttpOnly cookie; the database keeps
just their SHA-256, so a leaked database cannot be replayed as a login.
"""

import asyncio
import hashlib
import secrets
import sqlite3
import time
from collections.abc import Callable
from pathlib import Path

from app.schemas.auth import User
from app.services.passwords import DUMMY_HASH, hash_password, verify_password

SCHEMA = """
CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    email TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS sessions (
    token_hash TEXT PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    expires_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS sessions_expiry ON sessions(expires_at);
CREATE TABLE IF NOT EXISTS households (
    user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    data TEXT NOT NULL,
    updated_at INTEGER NOT NULL
);
"""


class EmailTakenError(ValueError):
    """An account with this e-mail already exists."""


def _token_hash(token: str) -> str:
    return hashlib.sha256(token.encode()).hexdigest()


class AuthService:
    def __init__(self, path: Path, session_days: int) -> None:
        self._path = path
        self._ttl = session_days * 24 * 60 * 60
        if str(path) != ":memory:":
            path.parent.mkdir(parents=True, exist_ok=True)
        self._db = sqlite3.connect(path, check_same_thread=False, isolation_level=None)
        self._db.execute("PRAGMA foreign_keys = ON")
        self._db.executescript(SCHEMA)
        self._lock = asyncio.Lock()

    def close(self) -> None:
        self._db.close()

    async def _run[T](self, fn: Callable[[], T]) -> T:
        async with self._lock:
            return await asyncio.to_thread(fn)

    async def transact[T](self, fn: Callable[[sqlite3.Connection], T]) -> T:
        """Run `fn` against the shared connection, serialized with every other query."""
        return await self._run(lambda: fn(self._db))

    async def signup(self, name: str, email: str, password: str) -> User:
        hashed = await asyncio.to_thread(hash_password, password)

        def insert() -> User:
            try:
                cur = self._db.execute(
                    "INSERT INTO users (name, email, password_hash, created_at) VALUES (?, ?, ?, ?)",
                    (name, email, hashed, int(time.time())),
                )
            except sqlite3.IntegrityError as exc:
                raise EmailTakenError(email) from exc
            return User(id=int(cur.lastrowid or 0), name=name, email=email)

        return await self._run(insert)

    async def ensure_user(self, name: str, email: str, password: str) -> User:
        """Create the account, or reset its name and password if it exists (used for the demo)."""
        hashed = await asyncio.to_thread(hash_password, password)

        def upsert() -> User:
            self._db.execute(
                "INSERT INTO users (name, email, password_hash, created_at) VALUES (?, ?, ?, ?) "
                "ON CONFLICT(email) DO UPDATE SET name = excluded.name, password_hash = excluded.password_hash",
                (name, email, hashed, int(time.time())),
            )
            row = self._db.execute("SELECT id FROM users WHERE email = ?", (email,)).fetchone()
            return User(id=row[0], name=name, email=email)

        return await self._run(upsert)

    async def authenticate(self, email: str, password: str) -> User | None:
        row = await self._run(
            lambda: self._db.execute(
                "SELECT id, name, email, password_hash FROM users WHERE email = ?", (email,)
            ).fetchone()
        )
        stored = row[3] if row else DUMMY_HASH
        ok = await asyncio.to_thread(verify_password, password, stored)
        return User(id=row[0], name=row[1], email=row[2]) if row and ok else None

    async def create_session(self, user: User) -> str:
        token = secrets.token_urlsafe(32)
        now = int(time.time())

        def insert() -> None:
            self._db.execute("DELETE FROM sessions WHERE expires_at < ?", (now,))
            self._db.execute(
                "INSERT INTO sessions (token_hash, user_id, expires_at) VALUES (?, ?, ?)",
                (_token_hash(token), user.id, now + self._ttl),
            )

        await self._run(insert)
        return token

    async def user_for(self, token: str) -> User | None:
        row = await self._run(
            lambda: self._db.execute(
                "SELECT u.id, u.name, u.email FROM sessions s JOIN users u ON u.id = s.user_id "
                "WHERE s.token_hash = ? AND s.expires_at > ?",
                (_token_hash(token), int(time.time())),
            ).fetchone()
        )
        return User(id=row[0], name=row[1], email=row[2]) if row else None

    async def end_session(self, token: str) -> None:
        await self._run(lambda: self._db.execute("DELETE FROM sessions WHERE token_hash = ?", (_token_hash(token),)))

    @property
    def session_seconds(self) -> int:
        return self._ttl
