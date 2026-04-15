"""
auth.py — Local Login & RBAC Engine
=====================================
Provides JWT-based authentication and role-based access control
for the local Multi-Agent Orchestration workspace.

Roles (least → most privileged):
  viewer   — read-only: view agents, tasks, logs
  operator — viewer + run tasks, upload docs, use RAG
  admin    — full access: manage users, agents, settings, self-improver

Usage (in any FastAPI route):
    from auth import require_role, UserToken

    @router.get("/admin-only")
    async def admin_route(user: UserToken = Depends(require_role("admin"))):
        ...
"""

import json
import os
import hashlib
import secrets
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Optional

from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from pydantic import BaseModel

try:
    import jwt as pyjwt
except ImportError:
    pyjwt = None

# ─── Configuration ────────────────────────────────────────────────────────────

BASE_DIR = Path(__file__).parent
USERS_FILE = BASE_DIR / "users.json"

SECRET_KEY = os.environ.get("AUTH_SECRET_KEY", "local-dev-secret-change-in-production")
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = int(os.environ.get("ACCESS_TOKEN_EXPIRE_MINUTES", "480"))  # 8h

# Role hierarchy — higher index = more privilege
ROLE_HIERARCHY = ["viewer", "operator", "admin"]

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/auth/login", auto_error=False)

# ─── Pydantic Models ──────────────────────────────────────────────────────────

class UserToken(BaseModel):
    """Decoded token payload injected into route handlers."""
    username: str
    role: str
    display_name: Optional[str] = None

class LoginRequest(BaseModel):
    username: str
    password: str

class LoginResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    username: str
    role: str
    display_name: Optional[str] = None

class UserRecord(BaseModel):
    username: str
    display_name: Optional[str] = None
    role: str
    active: bool = True

class CreateUserRequest(BaseModel):
    username: str
    password: str
    role: str = "viewer"
    display_name: Optional[str] = None

class UpdateUserRequest(BaseModel):
    role: Optional[str] = None
    display_name: Optional[str] = None
    active: Optional[bool] = None
    password: Optional[str] = None

# ─── Utilities ────────────────────────────────────────────────────────────────

def _hash_password(password: str, salt: Optional[str] = None) -> tuple[str, str]:
    """Returns (hashed_password, salt). Uses SHA-256 + salt."""
    if salt is None:
        salt = secrets.token_hex(16)
    hashed = hashlib.sha256(f"{salt}{password}".encode()).hexdigest()
    return hashed, salt

def _verify_password(password: str, stored_hash: str, salt: str) -> bool:
    computed, _ = _hash_password(password, salt)
    return computed == stored_hash

def _load_users() -> dict:
    if not USERS_FILE.exists():
        return {}
    with open(USERS_FILE, "r") as f:
        return json.load(f)

def _save_users(users: dict) -> None:
    with open(USERS_FILE, "w") as f:
        json.dump(users, f, indent=2)

def _role_level(role: str) -> int:
    try:
        return ROLE_HIERARCHY.index(role)
    except ValueError:
        return -1

# ─── Token Operations ─────────────────────────────────────────────────────────

def create_access_token(data: dict, expires_delta: Optional[timedelta] = None) -> str:
    if pyjwt is None:
        raise RuntimeError("PyJWT not installed. Run: pip install PyJWT")
    to_encode = data.copy()
    expire = datetime.now(timezone.utc) + (expires_delta or timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES))
    to_encode["exp"] = expire
    return pyjwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)

def decode_access_token(token: str) -> Optional[dict]:
    if pyjwt is None:
        return None
    try:
        return pyjwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
    except Exception:
        return None

# ─── Core Auth Functions ──────────────────────────────────────────────────────

def authenticate_user(username: str, password: str) -> Optional[dict]:
    """Verify credentials. Returns user record dict or None."""
    users = _load_users()
    user = users.get(username)
    if not user:
        return None
    if not user.get("active", True):
        return None
    if not _verify_password(password, user["password_hash"], user["salt"]):
        return None
    return user

def login(username: str, password: str) -> LoginResponse:
    user = authenticate_user(username, password)
    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect username or password",
            headers={"WWW-Authenticate": "Bearer"},
        )
    token = create_access_token({"sub": username, "role": user["role"]})
    return LoginResponse(
        access_token=token,
        username=username,
        role=user["role"],
        display_name=user.get("display_name"),
    )

# ─── FastAPI Dependencies ─────────────────────────────────────────────────────

async def get_current_user(token: Optional[str] = Depends(oauth2_scheme)) -> UserToken:
    """Dependency: injects UserToken or raises 401."""
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )
    if not token:
        raise credentials_exception
    payload = decode_access_token(token)
    if payload is None:
        raise credentials_exception
    username: str = payload.get("sub")
    role: str = payload.get("role", "viewer")
    if not username:
        raise credentials_exception
    users = _load_users()
    user = users.get(username)
    if not user or not user.get("active", True):
        raise credentials_exception
    return UserToken(username=username, role=role, display_name=user.get("display_name"))

def require_role(minimum_role: str):
    """
    FastAPI Depends factory. Restricts endpoint to users with at least `minimum_role`.

    Example:
        @router.post("/run")
        async def run_task(user: UserToken = Depends(require_role("operator"))):
            ...
    """
    min_level = _role_level(minimum_role)
    if min_level < 0:
        raise ValueError(f"Unknown role: {minimum_role}. Valid: {ROLE_HIERARCHY}")

    async def _check(current_user: UserToken = Depends(get_current_user)) -> UserToken:
        if _role_level(current_user.role) < min_level:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Requires '{minimum_role}' role or higher. Your role: '{current_user.role}'",
            )
        return current_user

    return _check

# ─── User Management (admin operations) ──────────────────────────────────────

def list_users() -> list[UserRecord]:
    users = _load_users()
    return [
        UserRecord(
            username=u,
            display_name=data.get("display_name"),
            role=data["role"],
            active=data.get("active", True),
        )
        for u, data in users.items()
    ]

def create_user(req: CreateUserRequest) -> UserRecord:
    if req.role not in ROLE_HIERARCHY:
        raise HTTPException(status_code=400, detail=f"Invalid role. Choose: {ROLE_HIERARCHY}")
    users = _load_users()
    if req.username in users:
        raise HTTPException(status_code=409, detail=f"User '{req.username}' already exists")
    hashed, salt = _hash_password(req.password)
    users[req.username] = {
        "password_hash": hashed,
        "salt": salt,
        "role": req.role,
        "display_name": req.display_name or req.username,
        "active": True,
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    _save_users(users)
    return UserRecord(username=req.username, role=req.role,
                      display_name=req.display_name, active=True)

def update_user(username: str, req: UpdateUserRequest) -> UserRecord:
    users = _load_users()
    if username not in users:
        raise HTTPException(status_code=404, detail=f"User '{username}' not found")
    user = users[username]
    if req.role is not None:
        if req.role not in ROLE_HIERARCHY:
            raise HTTPException(status_code=400, detail=f"Invalid role. Choose: {ROLE_HIERARCHY}")
        user["role"] = req.role
    if req.display_name is not None:
        user["display_name"] = req.display_name
    if req.active is not None:
        user["active"] = req.active
    if req.password is not None:
        hashed, salt = _hash_password(req.password)
        user["password_hash"] = hashed
        user["salt"] = salt
    users[username] = user
    _save_users(users)
    return UserRecord(username=username, role=user["role"],
                      display_name=user.get("display_name"), active=user.get("active", True))

def delete_user(username: str) -> None:
    users = _load_users()
    if username not in users:
        raise HTTPException(status_code=404, detail=f"User '{username}' not found")
    del users[username]
    _save_users(users)
