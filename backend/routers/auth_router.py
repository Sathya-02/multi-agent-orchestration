"""
auth_router.py — FastAPI Authentication & User Management Router
=================================================================
Mount in main.py:
    from routers.auth_router import router as auth_router
    app.include_router(auth_router)

Endpoints:
    POST /auth/login          — Get JWT token (no auth required)
    GET  /auth/me             — Current user info (any logged-in user)
    GET  /auth/users          — List all users (admin only)
    POST /auth/users          — Create user (admin only)
    PATCH /auth/users/{user}  — Update role/password/status (admin only)
    DELETE /auth/users/{user} — Delete user (admin only)
"""

from fastapi import APIRouter, Depends
from fastapi.security import OAuth2PasswordRequestForm

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


@router.post("/login", response_model=LoginResponse, summary="Login & get JWT token")
async def login_endpoint(form_data: OAuth2PasswordRequestForm = Depends()):
    """
    Accepts form fields `username` and `password`.
    Returns a Bearer JWT token valid for 8 hours (configurable via ACCESS_TOKEN_EXPIRE_MINUTES).
    """
    return login(form_data.username, form_data.password)


@router.get("/me", response_model=UserToken, summary="Get current user info")
async def get_me(current_user: UserToken = Depends(get_current_user)):
    """Returns the authenticated user's username, role, and display name."""
    return current_user


@router.get("/roles", summary="List available roles")
async def get_roles(_: UserToken = Depends(get_current_user)):
    """Returns all roles in order from least to most privileged."""
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


# ─── Admin: User Management ───────────────────────────────────────────────────

@router.get("/users", response_model=list[UserRecord], summary="List all users (admin)")
async def get_users(_: UserToken = Depends(require_role("admin"))):
    return list_users()


@router.post("/users", response_model=UserRecord, summary="Create a new user (admin)")
async def post_create_user(
    req: CreateUserRequest,
    _: UserToken = Depends(require_role("admin")),
):
    """
    Creates a new local user. Roles: viewer | operator | admin.
    Password is hashed with SHA-256 + salt and stored in users.json.
    """
    return create_user(req)


@router.patch("/users/{username}", response_model=UserRecord, summary="Update user (admin)")
async def patch_user(
    username: str,
    req: UpdateUserRequest,
    _: UserToken = Depends(require_role("admin")),
):
    """
    Update a user's role, display name, active status, or password.
    All fields are optional — only provided fields are changed.
    """
    return update_user(username, req)


@router.delete("/users/{username}", summary="Delete user (admin)")
async def delete_user_endpoint(
    username: str,
    _: UserToken = Depends(require_role("admin")),
):
    delete_user(username)
    return {"message": f"User '{username}' deleted successfully"}
