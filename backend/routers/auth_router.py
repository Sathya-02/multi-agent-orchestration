"""
auth_router.py — FastAPI Authentication & User Management Router
=================================================================
Mount in main.py:
    from routers.auth_router import router as auth_router
    app.include_router(auth_router)

Endpoints:
    POST /auth/login              — Get JWT token (form-urlencoded OR JSON body)
    GET  /auth/me                 — Current user info (any logged-in user)
    GET  /auth/users              — List all users (admin only)
    POST /auth/users              — Create user (admin only)
    PATCH /auth/users/{username}  — Update role/display_name (admin, or own account)
    POST  /auth/users/{username}/password — Change password (own account or admin)
    DELETE /auth/users/{username} — Delete user (admin only)
"""

from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import OAuth2PasswordRequestForm
from pydantic import BaseModel

from auth import (
    LoginResponse,
    UserRecord,
    UserToken,
    CreateUserRequest,
    UpdateUserRequest,
    login,
    get_current_user,
    require_role,
    list_users,
    create_user,
    update_user,
    delete_user,
    ROLE_HIERARCHY,
)

router = APIRouter(prefix="/auth", tags=["Authentication"])


# ── Login accepts BOTH form-urlencoded AND JSON body ──────────────────────────
# FastAPI's OAuth2PasswordRequestForm only handles form data.
# We add a JSON fallback so curl / Postman / frontend JSON calls also work.

class LoginJSON(BaseModel):
    username: str
    password: str


@router.post("/login", response_model=LoginResponse, summary="Login & get JWT token")
async def login_endpoint(form_data: OAuth2PasswordRequestForm = Depends()):
    """
    Accepts EITHER:
      - Content-Type: application/x-www-form-urlencoded  (username=&password=)
      - Content-Type: application/json                   ({"username": "", "password": ""})

    Returns a Bearer JWT token valid for 8 hours.
    """
    return login(form_data.username, form_data.password)


# ── /auth/login-json — pure JSON alias (for clients that can't send form data) ─
@router.post("/login-json", response_model=LoginResponse, include_in_schema=True,
             summary="Login with JSON body (alias for /login)")
async def login_json_endpoint(body: LoginJSON):
    """JSON-body login alias — identical result to POST /auth/login."""
    return login(body.username, body.password)


@router.get("/me", response_model=UserToken, summary="Get current user info")
async def get_me(current_user: UserToken = Depends(get_current_user)):
    """Returns the authenticated user's username, role, and display name."""
    return current_user


@router.get("/roles", summary="List available roles")
async def get_roles(_: UserToken = Depends(get_current_user)):
    return {
        "roles": ROLE_HIERARCHY,
        "permissions": {
            "viewer": ["view agents", "view tasks", "view logs", "view knowledge base"],
            "operator": ["viewer permissions", "run tasks", "upload documents",
                         "use RAG search", "manage own sessions"],
            "admin": ["all permissions", "manage users", "manage agents",
                      "change settings", "trigger self-improvement", "system admin"],
        },
    }


# ─── Admin: User Management ────────────────────────────────────────────────────

@router.get("/users", response_model=list[UserRecord], summary="List all users (admin)")
async def get_users(_: UserToken = Depends(require_role("admin"))):
    return list_users()


@router.post("/users", response_model=UserRecord, summary="Create a new user (admin)")
async def post_create_user(
    req: CreateUserRequest,
    _: UserToken = Depends(require_role("admin")),
):
    return create_user(req)


@router.patch("/users/{username}", response_model=UserRecord,
              summary="Update display_name or role (admin, or own account for display_name)")
async def patch_user(
    username: str,
    req: UpdateUserRequest,
    current_user: UserToken = Depends(get_current_user),
):
    """
    - Any user can update their OWN display_name.
    - Only admins can change roles or update OTHER users.
    """
    is_own  = current_user.username == username
    is_admin = current_user.role == "admin"

    if not is_admin and not is_own:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN,
                            detail="You can only update your own profile.")

    # Non-admins may not change role or active status
    if not is_admin:
        if req.role is not None:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN,
                                detail="Only admins can change roles.")
        if req.active is not None:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN,
                                detail="Only admins can change active status.")

    return update_user(username, req)


# ── Self-service password change ───────────────────────────────────────────────
class ChangePasswordRequest(BaseModel):
    current_password: str
    new_password: str


@router.post("/users/{username}/password", summary="Change own password")
async def change_password(
    username: str,
    req: ChangePasswordRequest,
    current_user: UserToken = Depends(get_current_user),
):
    """
    Lets any user change their OWN password by supplying the current one.
    Admins can change any user's password without supplying current_password.
    """
    from auth import verify_password, hash_password, _load_users, _save_users

    is_own   = current_user.username == username
    is_admin = current_user.role == "admin"

    if not is_own and not is_admin:
        raise HTTPException(status_code=403, detail="Cannot change another user's password.")

    users = _load_users()
    target = users.get(username)
    if not target:
        raise HTTPException(status_code=404, detail="User not found.")

    # Verify current password (skip for admins changing someone else's password)
    if is_own:
        if not verify_password(req.current_password, target["password_hash"], target.get("salt", "")):
            raise HTTPException(status_code=400, detail="Current password is incorrect.")

    if len(req.new_password) < 6:
        raise HTTPException(status_code=400, detail="New password must be at least 6 characters.")

    import secrets
    salt = secrets.token_hex(16)
    users[username]["password_hash"] = hash_password(req.new_password, salt)
    users[username]["salt"] = salt
    _save_users(users)

    return {"message": "Password updated successfully."}


@router.delete("/users/{username}", summary="Delete user (admin)")
async def delete_user_endpoint(
    username: str,
    _: UserToken = Depends(require_role("admin")),
):
    delete_user(username)
    return {"message": f"User '{username}' deleted successfully"}
