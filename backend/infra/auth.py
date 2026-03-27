"""
infra/auth.py — API key authentication for multi-user deployments
==================================================================
When REQUIRE_API_KEY=true, all API endpoints require a valid key.
WebSocket connections pass the key as a query parameter: /ws?key=mao_xxx

Key format:  mao_<32-char-hex>
Example:     mao_a1b2c3d4e5f6...

Creating keys:
  import secrets
  raw = "mao_" + secrets.token_hex(32)   # store this → user
  import hashlib
  hashed = hashlib.sha256(raw.encode()).hexdigest()   # store this → DB

Usage in FastAPI:
  from infra.auth import require_auth
  @app.get("/run")
  def start_job(user=Depends(require_auth)):
      ...
"""

import hashlib, logging
from functools import lru_cache
from fastapi import HTTPException, Security, status
from fastapi.security import APIKeyHeader, APIKeyQuery

from settings import REQUIRE_API_KEY, MASTER_API_KEY

logger = logging.getLogger("infra.auth")

# Accept key from header OR query string
_header_scheme = APIKeyHeader(name="X-API-Key", auto_error=False)
_query_scheme  = APIKeyQuery(name="key",         auto_error=False)


class User:
    """Minimal user context passed to authenticated routes."""
    def __init__(self, user_id: str, plan: str, key_id: str = ""):
        self.user_id = user_id
        self.plan    = plan
        self.key_id  = key_id
        self.is_admin= (user_id == "admin")


def _hash_key(raw: str) -> str:
    return hashlib.sha256(raw.encode()).hexdigest()


def _verify_master_key(raw: str) -> User | None:
    """Allow master key for admin/local use."""
    if MASTER_API_KEY and raw == MASTER_API_KEY:
        return User(user_id="admin", plan="enterprise", key_id="master")
    return None


def _verify_db_key(raw: str) -> User | None:
    """
    Verify against PostgreSQL.
    Falls back gracefully if DATABASE_URL is not configured.
    """
    try:
        import os
        db_url = os.getenv("DATABASE_URL", "")
        if not db_url:
            return None
        # Lazy import — psycopg2 only needed in cloud deployments
        import psycopg2
        conn = psycopg2.connect(db_url)
        cur  = conn.cursor()
        cur.execute("SELECT user_id, key_id, plan FROM authenticate_key(%s)", (raw,))
        row = cur.fetchone()
        cur.close(); conn.close()
        if row:
            return User(user_id=str(row[0]), plan=str(row[2]), key_id=str(row[1]))
    except Exception as e:
        logger.debug(f"DB key verification failed: {e}")
    return None


async def require_auth(
    header_key: str | None = Security(_header_scheme),
    query_key:  str | None = Security(_query_scheme),
) -> User:
    """
    FastAPI dependency. Use with Depends(require_auth).
    Returns the authenticated User or raises 401/403.
    Pass REQUIRE_API_KEY=false to skip auth entirely (local dev).
    """
    if not REQUIRE_API_KEY:
        return User(user_id="local", plan="enterprise")

    raw = header_key or query_key
    if not raw:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="API key required. Pass as X-API-Key header or ?key= query param.",
        )

    # Master key check (instant, no DB)
    user = _verify_master_key(raw)
    if user:
        return user

    # Database key check
    user = _verify_db_key(raw)
    if user:
        return user

    raise HTTPException(
        status_code=status.HTTP_403_FORBIDDEN,
        detail="Invalid or expired API key.",
    )


def optional_auth(
    header_key: str | None = Security(_header_scheme),
    query_key:  str | None = Security(_query_scheme),
) -> User | None:
    """
    Like require_auth but returns None instead of raising 401.
    Useful for endpoints that work both authenticated and unauthenticated.
    """
    if not REQUIRE_API_KEY:
        return User(user_id="local", plan="enterprise")
    raw = header_key or query_key
    if not raw:
        return None
    return _verify_master_key(raw) or _verify_db_key(raw)
