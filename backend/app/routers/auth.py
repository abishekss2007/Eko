"""Sign-up, login, logout and the current user. Session lives in an HttpOnly cookie."""

from typing import Annotated
from urllib.parse import urlsplit

from fastapi import APIRouter, Depends, HTTPException, Request, Response, status

from app.config import get_settings
from app.schemas.auth import LoginRequest, SignupRequest, User
from app.security import limiter
from app.services.auth_service import AuthService, EmailTakenError

router = APIRouter(prefix="/api/auth", tags=["auth"])
COOKIE = "saanssafe_session"


def get_auth_service(request: Request) -> AuthService:
    service: AuthService = request.app.state.auth_service
    return service


def same_origin(request: Request) -> None:
    """CSRF defence in depth (the cookie is also SameSite=Strict): reject cross-site writes."""
    origin = request.headers.get("origin")
    if origin and urlsplit(origin).netloc != request.headers.get("host"):
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Cross-site request blocked")


Auth = Annotated[AuthService, Depends(get_auth_service)]
SameOrigin = Depends(same_origin)


def _auth_limit() -> str:
    return get_settings().auth_rate_limit


def _set_cookie(request: Request, response: Response, token: str, max_age: int) -> None:
    response.set_cookie(
        COOKIE,
        token,
        max_age=max_age,
        httponly=True,
        secure=request.app.state.cookie_secure,
        samesite="strict",
        path="/api",
    )


@router.post("/signup", response_model=User, status_code=201, dependencies=[SameOrigin])
@limiter.limit(_auth_limit)
async def signup(request: Request, response: Response, body: SignupRequest, auth: Auth) -> User:
    """Create an account and sign in."""
    try:
        user = await auth.signup(body.name, body.email, body.password)
    except EmailTakenError as exc:
        raise HTTPException(status.HTTP_409_CONFLICT, "An account with this e-mail already exists.") from exc
    _set_cookie(request, response, await auth.create_session(user), auth.session_seconds)
    return user


@router.post("/login", response_model=User, dependencies=[SameOrigin])
@limiter.limit(_auth_limit)
async def login(request: Request, response: Response, body: LoginRequest, auth: Auth) -> User:
    """Sign in. The same message is returned for an unknown e-mail and a wrong password."""
    user = await auth.authenticate(body.email, body.password)
    if user is None:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "E-mail or password is incorrect.")
    _set_cookie(request, response, await auth.create_session(user), auth.session_seconds)
    return user


@router.post("/logout", status_code=204, dependencies=[SameOrigin])
async def logout(request: Request, response: Response, auth: Auth) -> Response:
    token = request.cookies.get(COOKIE)
    if token:
        await auth.end_session(token)
    response.delete_cookie(
        COOKIE, path="/api", httponly=True, secure=request.app.state.cookie_secure, samesite="strict"
    )
    response.status_code = 204
    return response


@router.get("/me", response_model=User)
async def me(request: Request, auth: Auth) -> User:
    token = request.cookies.get(COOKIE)
    user = await auth.user_for(token) if token else None
    if user is None:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Not signed in.")
    return user
