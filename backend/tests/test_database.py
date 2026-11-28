"""The accounts database layer: engine choice, placeholder translation and rollback."""

import os
import sqlite3
from pathlib import Path

import pytest

from app.services.database import SQLiteDatabase, _PostgresConnection, normalize_url, open_database
from tests.helpers import TEST_ACCOUNT, api_client, make_settings


def test_postgres_scheme_is_normalized() -> None:
    assert normalize_url("postgres://u:p@h:5432/db") == "postgresql://u:p@h:5432/db"
    assert normalize_url("postgresql://u:p@h/db") == "postgresql://u:p@h/db"


def test_placeholders_are_translated_for_postgres() -> None:
    seen: list[tuple[str, tuple[object, ...]]] = []

    class FakeConn:
        def execute(self, sql: str, params: tuple[object, ...]) -> None:
            seen.append((sql, params))

    _PostgresConnection(FakeConn()).execute("SELECT ? WHERE x = ?", (1, 2))
    assert seen == [("SELECT %s WHERE x = %s", (1, 2))]


async def test_without_a_url_sqlite_is_used(tmp_path: Path) -> None:
    db = await open_database("  ", tmp_path / "a.db")
    try:
        assert db.engine == "sqlite"
    finally:
        db.close()


async def test_a_failed_transaction_is_rolled_back() -> None:
    db = SQLiteDatabase(Path(":memory:"))

    def insert_then_fail(conn: sqlite3.Connection) -> None:
        conn.execute("INSERT INTO users (name, email, password_hash, created_at) VALUES ('a', 'a@x', 'h', 0)")
        raise RuntimeError("boom")

    with pytest.raises(RuntimeError):
        await db.run(insert_then_fail)  # type: ignore[arg-type]
    count = await db.run(lambda conn: conn.execute("SELECT COUNT(*) FROM users").fetchone()[0])
    db.close()
    assert count == 0


@pytest.mark.skipif(not os.environ.get("TEST_DATABASE_URL"), reason="TEST_DATABASE_URL not set")
async def test_accounts_and_demo_family_persist_in_postgres() -> None:
    settings = make_settings(demo_account=True)
    async with api_client(settings=settings) as client:
        assert (await client.post("/api/auth/signup", json=TEST_ACCOUNT)).status_code == 201
    async with api_client(settings=settings) as client:
        login = await client.post(
            "/api/auth/login", json={"email": TEST_ACCOUNT["email"], "password": TEST_ACCOUNT["password"]}
        )
        demo = await client.post(
            "/api/auth/login", json={"email": "demo@saanssafe.app", "password": "SaansSafe-Demo-2026"}
        )
        family = await client.get("/api/family")
    assert login.status_code == 200 and demo.status_code == 200
    assert len(family.json()["members"]) == 4
