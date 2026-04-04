"""oauth.py — Google OAuth2 login, session JWT, and email-based authorisation.

Flow:
  1. Browser hits GET /auth/login/google  → redirect to Google consent screen.
  2. Google redirects to GET /auth/callback/google?code=…
  3. Exchange code → tokens, verify ID-token, find-or-create user in Postgres.
  4. Set HTTP-only session cookie (mao_session) containing a signed JWT.
  5. All subsequent requests present that cookie; /auth/me returns the user.

Authorisation policy (fully configurable via environment variables):
  ALLOWED_EMAIL_DOMAINS  comma-separated allowed domains  (empty = allow all)
  ALLOWED_EMAILS         explicit additional whitelist
  ADMIN_EMAILS           users promoted to plan=enterprise + is_admin=True
"""
from __future__ import annotations

import logging
import os
import time
from typing import Optional
from urllib.parse import urlencode

import requests as _requests
from fastapi import HTTPException, Request, status
from fastapi.responses import JSONResponse, RedirectResponse
from pydantic import BaseModel

logger = logging.getLogger("infra.oauth")

# ── Settings (read once at import time) ──────────────────────────────────────
GOOGLE_CLIENT_ID = os.getenv("GOOGLE_CLIENT_ID", "")
GOOGLE_CLIENT_SECRET = os.getenv("GOOGLE_CLIENT_SECRET", "")
GOOGLE_REDIRECT_URI = os.getenv(
    "GOOGLE_REDIRECT_URI", "http://localhost:8000/auth/callback/google"
)

ALLOWED_EMAIL_DOMAINS: list[str] = [
    d.strip().lower()
    for d in os.getenv("ALLOWED_EMAIL_DOMAINS", "").split(",")
    if d.strip()
]
ALLOWED_EMAILS: set[str] = {
    e.strip().lower()
    for e in os.getenv("ALLOWED_EMAILS", "").split(",")
    if e.strip()
}
ADMIN_EMAILS: set[str] = {
    e.strip().lower()
    for e in os.getenv("ADMIN_EMAILS", "").split(",")
    if e.strip()
}

SESSION_SECRET = os.getenv("SESSION_SECRET", "change-this-in-production")
SESSION_ALG = "HS256"
SESSION_COOKIE = os.getenv("SESSION_COOKIE_NAME", "mao_session")
SESSION_TTL = int(os.getenv("SESSION_TTL_HOURS", "8")) * 3600


# ── Data models ──────────────────────────────────────────────────────────────
class SessionUser(BaseModel):
    id: str
    email: str
    name: Optional[str] = None
    plan: str = "free"
    is_admin: bool = False


# ── JWT helpers ──────────────────────────────────────────────────────────────
def _create_session_token(user: SessionUser) -> str:
    try:
        import jwt  # pyjwt
    except ImportError:
        raise RuntimeError("pyjwt is not installed. Run: pip install pyjwt")

    now = int(time.time())
    payload = {
        "sub": user.id,
        "email": user.email,
        "name": user.name,
        "plan": user.plan,
        "is_admin": user.is_admin,
        "iat": now,
        "exp": now + SESSION_TTL,
    }
    return jwt.encode(payload, SESSION_SECRET, algorithm=SESSION_ALG)


def _decode_session_token(token: str) -> SessionUser:
    try:
        import jwt
    except ImportError:
        raise RuntimeError("pyjwt is not installed. Run: pip install pyjwt")

    try:
        payload = jwt.decode(token, SESSION_SECRET, algorithms=[SESSION_ALG])
        return SessionUser(
            id=payload["sub"],
            email=payload["email"],
            name=payload.get("name"),
            plan=payload.get("plan", "free"),
            is_admin=bool(payload.get("is_admin", False)),
        )
    except Exception as exc:
        logger.debug("Invalid session token: %s", exc)
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid or expired session"
        )


# ── DB helpers ───────────────────────────────────────────────────────────────
def _get_db_conn():
    try:
        import psycopg2  # type: ignore
    except ImportError:
        raise RuntimeError("psycopg2-binary is not installed. Run: pip install psycopg2-binary")

    db_url = os.getenv("DATABASE_URL", "")
    if not db_url:
        raise RuntimeError("DATABASE_URL environment variable is not set.")
    return psycopg2.connect(db_url)


def _find_or_create_user(email: str, name: Optional[str]) -> SessionUser:
    """Look up or insert a user row; apply domain/admin policy."""
    email_l = email.lower().strip()
    domain = email_l.split("@")[-1]

    # ── Domain / explicit allowlist check ────────────────────────────────
    if ALLOWED_EMAIL_DOMAINS:
        allowed = (domain in ALLOWED_EMAIL_DOMAINS) or (email_l in ALLOWED_EMAILS)
        if not allowed:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Email domain '{domain}' is not permitted. "
                       f"Contact your administrator.",
            )

    # ── Role / plan policy ────────────────────────────────────────────────
    is_admin = email_l in ADMIN_EMAILS
    plan = "enterprise" if is_admin else "free"

    conn = _get_db_conn()
    try:
        cur = conn.cursor()
        cur.execute("SELECT id, plan FROM users WHERE email = %s", (email_l,))
        row = cur.fetchone()

        if row:
            user_id, existing_plan = row
            # Upgrade plan for newly-added admins without downgrading others
            if is_admin and existing_plan != plan:
                cur.execute(
                    "UPDATE users SET plan = %s, updated_at = NOW() WHERE id = %s",
                    (plan, user_id),
                )
                conn.commit()
        else:
            cur.execute(
                "INSERT INTO users (email, name, plan) VALUES (%s, %s, %s) RETURNING id, plan",
                (email_l, name, plan),
            )
            user_id, plan = cur.fetchone()
            conn.commit()

        cur.close()
    finally:
        conn.close()

    return SessionUser(id=str(user_id), email=email_l, name=name, plan=plan, is_admin=is_admin)


# ── Google OAuth helpers ──────────────────────────────────────────────────────
def build_google_auth_url(state: str = "mao") -> str:
    params = {
        "client_id": GOOGLE_CLIENT_ID,
        "redirect_uri": GOOGLE_REDIRECT_URI,
        "response_type": "code",
        "scope": "openid email profile",
        "access_type": "offline",
        "include_granted_scopes": "true",
        "state": state,
        "prompt": "consent",
    }
    return "https://accounts.google.com/o/oauth2/v2/auth?" + urlencode(params)


def exchange_code_for_tokens(code: str) -> dict:
    data = {
        "code": code,
        "client_id": GOOGLE_CLIENT_ID,
        "client_secret": GOOGLE_CLIENT_SECRET,
        "redirect_uri": GOOGLE_REDIRECT_URI,
        "grant_type": "authorization_code",
    }
    resp = _requests.post(
        "https://oauth2.googleapis.com/token", data=data, timeout=15
    )
    if resp.status_code != 200:
        logger.error("Token exchange failed: %s", resp.text)
        raise HTTPException(status_code=400, detail="Google OAuth token exchange failed")
    return resp.json()


def verify_google_id_token(id_token: str) -> dict:
    """Verify via Google's tokeninfo endpoint (server-side, no extra library)."""
    resp = _requests.get(
        "https://oauth2.googleapis.com/tokeninfo",
        params={"id_token": id_token},
        timeout=10,
    )
    if resp.status_code != 200:
        raise HTTPException(status_code=400, detail="Invalid Google ID token")
    info = resp.json()
    if info.get("aud") != GOOGLE_CLIENT_ID:
        raise HTTPException(status_code=400, detail="ID token audience mismatch")
    return info


# ── Cookie helpers ────────────────────────────────────────────────────────────
def set_session_cookie(response: RedirectResponse | JSONResponse, token: str) -> None:
    secure = os.getenv("ENV", "local") == "production"
    response.set_cookie(
        key=SESSION_COOKIE,
        value=token,
        httponly=True,
        secure=secure,
        samesite="lax",
        max_age=SESSION_TTL,
        path="/",
    )


def clear_session_cookie(response: JSONResponse) -> None:
    response.delete_cookie(SESSION_COOKIE)


# ── Request helper ────────────────────────────────────────────────────────────
def get_user_from_request(request: Request) -> Optional[SessionUser]:
    """Extract and validate the session cookie; returns None if missing/invalid."""
    token = request.cookies.get(SESSION_COOKIE)
    if not token:
        return None
    try:
        return _decode_session_token(token)
    except HTTPException:
        return None
