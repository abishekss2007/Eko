from pathlib import Path
from typing import Any

import pytest

from app.routers import auth as auth_router
from app.security import limiter
from app.services.passwords import hash_password, verify_password
from tests.helpers import api_client, make_settings

SIGNUP: dict[str, Any] = {"name": "Asha Verma", "email": "Asha@Example.com", "password": "smog-safe-2026"}


def test_password_hash_is_salted_scrypt() -> None:
    first, second = hash_password("smog-safe-2026"), hash_password("smog-safe-2026")
    assert first.startswith("scrypt$") and first != second
    assert verify_password("smog-safe-2026", first)
    assert not verify_password("wrong-password", first)
    assert not verify_password("x", "not-a-hash")
    assert not verify_password("x", "bcrypt$1$2$3$aa$bb")


async def test_signup_login_me_logout_flow() -> None:
    async with api_client() as client:
        created = await client.post("/api/auth/signup", json=SIGNUP)
        assert created.status_code == 201
        assert created.json() == {"id": 1, "name": "Asha Verma", "email": "asha@example.com"}
        cookie = created.headers["set-cookie"].lower()
        assert "httponly" in cookie and "samesite=strict" in cookie and "path=/api" in cookie
        assert "password" not in created.text

        assert (await client.get("/api/auth/me")).json()["email"] == "asha@example.com"
        assert (await client.post("/api/auth/logout")).status_code == 204
        client.cookies.clear()
        assert (await client.get("/api/auth/me")).status_code == 401

        login = await client.post(
            "/api/auth/login", json={"email": " ASHA@example.com ", "password": SIGNUP["password"]}
        )
        assert login.status_code == 200
        assert (await client.get("/api/auth/me")).json()["name"] == "Asha Verma"


async def test_logout_invalidates_the_session_server_side() -> None:
    async with api_client() as client:
        await client.post("/api/auth/signup", json=SIGNUP)
        token = client.cookies.get("saanssafe_session")
        await client.post("/api/auth/logout")
        client.cookies.set("saanssafe_session", token or "", path="/api")
        assert (await client.get("/api/auth/me")).status_code == 401


async def test_duplicate_email_and_wrong_password() -> None:
    async with api_client() as client:
        await client.post("/api/auth/signup", json=SIGNUP)
        dup = await client.post("/api/auth/signup", json={**SIGNUP, "email": "asha@example.com"})
        wrong = await client.post("/api/auth/login", json={"email": "asha@example.com", "password": "nope-nope-1"})
        unknown = await client.post("/api/auth/login", json={"email": "who@example.com", "password": "nope-nope-1"})
    assert dup.status_code == 409
    assert wrong.status_code == unknown.status_code == 401
    assert wrong.json() == unknown.json(), "no hint whether the e-mail exists"


@pytest.mark.parametrize(
    "body",
    [
        {**SIGNUP, "email": "not-an-email"},
        {**SIGNUP, "password": "short"},
        {**SIGNUP, "password": "11111111"},
        {**SIGNUP, "password": "x" * 129},
        {**SIGNUP, "name": "<>"},
        {**SIGNUP, "role": "admin"},
    ],
)
async def test_signup_validation(body: dict[str, Any]) -> None:
    async with api_client() as client:
        assert (await client.post("/api/auth/signup", json=body)).status_code == 422


async def test_cross_site_post_is_blocked() -> None:
    async with api_client() as client:
        response = await client.post("/api/auth/signup", json=SIGNUP, headers={"Origin": "https://evil.example"})
        same = await client.post("/api/auth/signup", json=SIGNUP, headers={"Origin": "http://test"})
    assert response.status_code == 403
    assert same.status_code == 201


async def test_allowed_origin_can_sign_in_through_a_proxy(monkeypatch: pytest.MonkeyPatch) -> None:
    settings = make_settings(allowed_origins="https://saanssafe.vercel.app, https://other.example")
    monkeypatch.setattr(auth_router, "get_settings", lambda: settings)
    async with api_client(settings=settings) as client:
        proxied = await client.post("/api/auth/signup", json=SIGNUP, headers={"Origin": "https://saanssafe.vercel.app"})
        evil = await client.post("/api/auth/login", json=SIGNUP, headers={"Origin": "https://evil.example"})
    assert proxied.status_code == 201
    assert evil.status_code == 403


async def test_secure_cookie_flag_in_production() -> None:
    async with api_client(settings=make_settings(cookie_secure=True)) as client:
        response = await client.post("/api/auth/signup", json=SIGNUP)
    assert "secure" in response.headers["set-cookie"].lower()


async def test_login_is_rate_limited(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(auth_router, "get_settings", lambda: make_settings(auth_rate_limit="2/minute"))
    limiter.reset()
    body = {"email": "who@example.com", "password": "nope-nope-1"}
    async with api_client() as client:
        codes = [(await client.post("/api/auth/login", json=body)).status_code for _ in range(3)]
    limiter.reset()
    assert codes == [401, 401, 429]


async def test_accounts_persist_in_sqlite_file(tmp_path: Path) -> None:
    settings = make_settings(database_url=None, database_path=tmp_path / "db" / "accounts.db")
    async with api_client(settings=settings) as client:
        await client.post("/api/auth/signup", json=SIGNUP)
    async with api_client(settings=settings) as client:
        login = await client.post("/api/auth/login", json={"email": SIGNUP["email"], "password": SIGNUP["password"]})
    assert login.status_code == 200
    stored = (tmp_path / "db" / "accounts.db").read_bytes()
    assert b"smog-safe-2026" not in stored


async def test_spa_routes_serve_index(tmp_path: Path) -> None:
    (tmp_path / "index.html").write_text("<!doctype html><title>SaansSafe</title>")
    (tmp_path / "assets").mkdir()
    (tmp_path / "assets" / "app-1234.js").write_text("console.log(1)")
    async with api_client(settings=make_settings(static_dir=tmp_path)) as client:
        for path in ("/", "/login", "/signup", "/app"):
            response = await client.get(path)
            assert response.status_code == 200 and "SaansSafe" in response.text, path
            assert response.headers["cache-control"] == "no-cache", path
        asset = await client.get("/assets/app-1234.js")
        assert asset.status_code == 200 and "immutable" in asset.headers["cache-control"]
        assert (await client.get("/missing.js")).status_code == 404
        assert (await client.get("/api/nope")).status_code == 404
