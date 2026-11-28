"""Keep tests hermetic: no real Gemini key, generous rate limits.

Account tests use in-memory SQLite. Set TEST_DATABASE_URL to a throwaway Postgres database to run
them against Postgres instead; its tables are emptied before every test.
"""

import os
from collections.abc import Iterator

import psycopg
import pytest

from app.services.database import POSTGRES_SCHEMA

os.environ["GEMINI_API_KEY"] = ""
os.environ["AI_RATE_LIMIT"] = "1000/minute"
os.environ["DATA_RATE_LIMIT"] = "1000/minute"
os.environ["AUTH_RATE_LIMIT"] = "1000/minute"
os.environ["DATABASE_PATH"] = ":memory:"
os.environ.pop("DATABASE_URL", None)


@pytest.fixture(autouse=True)
def _empty_postgres() -> Iterator[None]:
    url = os.environ.get("TEST_DATABASE_URL")
    if url:
        with psycopg.connect(url, autocommit=True) as conn:
            conn.execute(POSTGRES_SCHEMA)
            conn.execute("TRUNCATE households, sessions, users RESTART IDENTITY")
    yield
