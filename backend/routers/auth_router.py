"""
auth_router.py — Authentication + User Management API

Endpoints:
  POST   /auth/login              — form-encoded login → JWT
  POST   /auth/login-json         — JSON login alias
  GET    /auth/me                 — current user info
  GET    /auth/users              — list users (admin)
  POST   /auth/users              — create user (admin)
  GET    /auth/users/{username}   — get user (admin)
  PATCH  /auth/users/{username}   — update role/active/extra_permissions (admin) or display_name (self)
  DELETE /auth/users/{username}   — delete user (admin, not self)
  POST   /auth/users/{username}/password — reset password
"""
from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import OAuth2PasswordRequestForm
from typing import Optional, List
from pydantic import BaseModel
import sys, os
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from auth import (
    authenticate_user, create_token, get_current_user,
    require_role, list_users, get_user, create_user,
    update_user, delete_user, UserToken,
)

router = APIRouter(prefix="/auth", tags=["auth"])


# ── Login ────────────────────────────────────────────────────────────────────

class LoginJSON(BaseModel):
    username: str
    password: str

@router.post("/login")
async def login_form(form: OAuth2PasswordRequestForm = Depends()):
    user = authenticate_user(form.username, form.password)
    if not user:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED,
                            detail="Incorrect username or password")
    token = create_token({"sub": user["username"], "role": user["role"]})
    return {"access_token": token, "token_type": "bearer", "user": _safe(user)}

@router.post("/login-json")
async def login_json(body: LoginJSON):
    user = authenticate_user(body.username, body.password)
    if not user:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED,
                            detail="Incorrect username or password")
    token = create_token({"sub": user["username"], "role": user["role"]})
    return {"access_token": token, "token_type": "bearer", "user": _safe(user)}

@router.get("/me")
async def me(current: UserToken = Depends(get_current_user)):
    user = get_user(current.username)
    return _safe(user) if user else current


# ── User CRUD ────────────────────────────────────────────────────────────────

class CreateUserBody(BaseModel):
    username: str
    password: str
    display_name: Optional[str] = None
    role: Optional[str] = "viewer"
    extra_permissions: Optional[List[str]] = []

class UpdateUserBody(BaseModel):
    display_name: Optional[str] = None
    role: Optional[str] = None
    active: Optional[bool] = None
    extra_permissions: Optional[List[str]] = None

class PasswordBody(BaseModel):
    new_password: str
    current_password: Optional[str] = None
    admin_override: Optional[bool] = False


@router.get("/users")
async def list_all_users(current: UserToken = Depends(require_role("admin"))):
    return [_safe(u) for u in list_users()]

@router.post("/users", status_code=201)
async def create_new_user(
    body: CreateUserBody,
    current: UserToken = Depends(require_role("admin"))
):
    existing = get_user(body.username)
    if existing:
        raise HTTPException(400, f"User '{body.username}' already exists")
    user = create_user(
        username=body.username,
        password=body.password,
        display_name=body.display_name or body.username,
        role=body.role or "viewer",
        extra_permissions=body.extra_permissions or [],
    )
    return _safe(user)

@router.get("/users/{username}")
async def get_one_user(
    username: str,
    current: UserToken = Depends(require_role("admin"))
):
    user = get_user(username)
    if not user:
        raise HTTPException(404, f"User '{username}' not found")
    return _safe(user)

@router.patch("/users/{username}")
async def patch_user(
    username: str,
    body: UpdateUserBody,
    current: UserToken = Depends(get_current_user)
):
    user = get_user(username)
    if not user:
        raise HTTPException(404, f"User '{username}' not found")

    is_admin  = current.role == "admin"
    is_self   = current.username == username

    if not is_admin and not is_self:
        raise HTTPException(403, "Forbidden")

    updates = {}
    if body.display_name is not None:
        updates["display_name"] = body.display_name
    if is_admin:
        if body.role is not None:
            if body.role not in ("viewer", "operator", "admin"):
                raise HTTPException(400, "Invalid role")
            # Prevent admin from demoting themselves
            if is_self and body.role != "admin":
                raise HTTPException(400, "Cannot change own role")
            updates["role"] = body.role
        if body.active is not None:
            if is_self:
                raise HTTPException(400, "Cannot deactivate yourself")
            updates["active"] = body.active
        if body.extra_permissions is not None:
            updates["extra_permissions"] = body.extra_permissions
    elif body.role is not None or body.active is not None or body.extra_permissions is not None:
        raise HTTPException(403, "Only admins can change role, active status, or extra permissions")

    updated = update_user(username, **updates)
    return _safe(updated)

@router.delete("/users/{username}", status_code=204)
async def del_user(
    username: str,
    current: UserToken = Depends(require_role("admin"))
):
    if current.username == username:
        raise HTTPException(400, "Cannot delete yourself")
    if not get_user(username):
        raise HTTPException(404, f"User '{username}' not found")
    delete_user(username)

@router.post("/users/{username}/password")
async def reset_password(
    username: str,
    body: PasswordBody,
    current: UserToken = Depends(get_current_user)
):
    from auth import hash_password, verify_password
    user = get_user(username)
    if not user:
        raise HTTPException(404, f"User '{username}' not found")

    is_admin = current.role == "admin"
    is_self  = current.username == username

    if not is_admin and not is_self:
        raise HTTPException(403, "Forbidden")
    if is_self and not is_admin and not body.current_password:
        raise HTTPException(400, "current_password required for self-service password change")
    if is_self and not is_admin:
        if not verify_password(body.current_password, user["password_hash"]):
            raise HTTPException(400, "Current password is incorrect")

    update_user(username, password_hash=hash_password(body.new_password))
    return {"ok": True}


# ── Helper ────────────────────────────────────────────────────────────────────
def _safe(u: dict) -> dict:
    """Strip password_hash before returning user data to client."""
    if not u:
        return {}
    return {
        k: v for k, v in u.items()
        if k not in ("password_hash", "salt")
    }
