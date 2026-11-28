"""The accounts database: hosted Postgres when DATABASE_URL is set, otherwise a local SQLite file.

Services write one SQL dialect that both engines accept: `?` placeholders (translated to `%s`
for Postgres), `INSERT ... ON CONFLICT ... RETURNING`, and integer Unix timestamps.
"""

import asyncio
import sqlite3
from collections.abc import Callable, Sequence
from pathlib import Path
from typing import Any, Protocol

from psycopg_pool import ConnectionPool

SQLITE_SCHEMA = """
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
CREATE INDEX IF NOT EXISTS sessions_user ON sessions(user_id);
CREATE TABLE IF NOT EXISTS households (
    user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    data TEXT NOT NULL,
    updated_at INTEGER NOT NULL
);
"""

# Row level security is on with no policies, so Supabase's public Data API (anon and
# authenticated keys) can read nothing. The backend connects as the table owner, which RLS
# does not restrict.
POSTGRES_SCHEMA = """
CREATE TABLE IF NOT EXISTS users (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    name TEXT NOT NULL,
    email TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    created_at BIGINT NOT NULL
);
CREATE TABLE IF NOT EXISTS sessions (
    token_hash TEXT PRIMARY KEY,
    user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    expires_at BIGINT NOT NULL
);
CREATE INDEX IF NOT EXISTS sessions_expiry ON sessions(expires_at);
CREATE INDEX IF NOT EXISTS sessions_user ON sessions(user_id);
CREATE TABLE IF NOT EXISTS households (
    user_id BIGINT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    data TEXT NOT NULL,
    updated_at BIGINT NOT NULL
);
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE households ENABLE ROW LEVEL SECURITY;
"""


class Cursor(Protocol):
    def fetchone(self) -> Any: ...


class Connection(Protocol):
    """The part of a DB-API connection the services use."""

    def execute(self, sql: str, params: Sequence[Any] = ()) -> Cursor: ...


class Database(Protocol):
    engine: str

    async def run[T](self, fn: Callable[[Connection], T]) -> T:
        """Run `fn` in one transaction, off the event loop."""
        ...

    def close(self) -> None: ...


class SQLiteDatabase:
    """One shared connection; every call is serialized by a lock."""

    engine = "sqlite"

    def __init__(self, path: Path) -> None:
        if str(path) != ":memory:":
            path.parent.mkdir(parents=True, exist_ok=True)
        self._db = sqlite3.connect(path, check_same_thread=False, isolation_level=None)
        self._db.execute("PRAGMA foreign_keys = ON")
        self._db.executescript(SQLITE_SCHEMA)
        self._lock = asyncio.Lock()

    def _transaction[T](self, fn: Callable[[Connection], T]) -> T:
        self._db.execute("BEGIN")
        try:
            result = fn(self._db)
        except BaseException:
            self._db.execute("ROLLBACK")
            raise
        self._db.execute("COMMIT")
        return result

    async def run[T](self, fn: Callable[[Connection], T]) -> T:
        async with self._lock:
            return await asyncio.to_thread(self._transaction, fn)

    def close(self) -> None:
        self._db.close()


class _PostgresConnection:
    """Adapts psycopg to the `?` placeholders the services write."""

    def __init__(self, conn: Any) -> None:
        self._conn = conn

    def execute(self, sql: str, params: Sequence[Any] = ()) -> Cursor:
        cursor: Cursor = self._conn.execute(sql.replace("?", "%s"), params)
        return cursor


class PostgresDatabase:
    """A small connection pool, checked before each use so dropped connections are replaced."""

    engine = "postgres"

    def __init__(self, url: str, *, max_size: int = 5, timeout_s: float = 15.0) -> None:
        # prepare_threshold=None turns off server-side prepared statements, which Supabase's
        # transaction pooler (port 6543) does not support.
        self._pool = ConnectionPool(
            url,
            min_size=1,
            max_size=max_size,
            timeout=timeout_s,
            kwargs={"autocommit": True, "prepare_threshold": None},
            check=ConnectionPool.check_connection,
            open=False,
        )
        self._timeout_s = timeout_s

    def open(self) -> None:
        """Connect and create the tables; raises if the database is unreachable."""
        self._pool.open(wait=True, timeout=self._timeout_s)
        with self._pool.connection() as conn, conn.transaction():
            conn.execute(POSTGRES_SCHEMA)

    def _transaction[T](self, fn: Callable[[Connection], T]) -> T:
        with self._pool.connection() as conn, conn.transaction():
            return fn(_PostgresConnection(conn))

    async def run[T](self, fn: Callable[[Connection], T]) -> T:
        return await asyncio.to_thread(self._transaction, fn)

    def close(self) -> None:
        self._pool.close()


def normalize_url(url: str) -> str:
    """Accept the `postgres://` scheme that some hosts print."""
    return "postgresql://" + url.removeprefix("postgres://") if url.startswith("postgres://") else url


async def open_database(database_url: str | None, database_path: Path) -> Database:
    """Postgres when a URL is given, else SQLite at `database_path`."""
    if database_url and database_url.strip():
        db = PostgresDatabase(normalize_url(database_url.strip()))
        try:
            await asyncio.to_thread(db.open)
        except BaseException:
            db.close()
            raise
        return db
    return await asyncio.to_thread(SQLiteDatabase, database_path)
