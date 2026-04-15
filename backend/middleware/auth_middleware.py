"""
auth_middleware.py — Auth Integration Helpers
=============================================
Provides ready-to-use Depends() guards for all existing routes in main.py.

Quick integration pattern for existing endpoints:

    # Before (unprotected):
    @app.post("/run")
    async def run_task(data: dict):
        ...

    # After (role-protected):
    from middleware.auth_middleware import operator_required, UserToken

    @app.post("/run")
    async def run_task(data: dict, user: UserToken = operator_required):
        ...
"""

from fastapi import Depends
from auth import require_role, get_current_user, UserToken

# ─── Pre-built guards (use directly as Depends values) ────────────────────────

# Any authenticated user
any_user = Depends(get_current_user)

# Viewer or higher (read-only access)
viewer_required = Depends(require_role("viewer"))

# Operator or higher (can run tasks, upload)
operator_required = Depends(require_role("operator"))

# Admin only (user management, settings, self-improver)
admin_required = Depends(require_role("admin"))


# ─── Feature-to-Role mapping reference ───────────────────────────────────────
#
# Apply these guards to the corresponding routes in main.py:
#
# VIEWER (read-only)
#   GET  /agents                → viewer_required
#   GET  /agents/{id}           → viewer_required
#   GET  /tasks                 → viewer_required
#   GET  /logs                  → viewer_required
#   GET  /knowledge-base/list   → viewer_required
#   GET  /models                → viewer_required
#   GET  /settings              → viewer_required
#
# OPERATOR (interactive)
#   POST /run                   → operator_required
#   POST /run-crew              → operator_required
#   POST /upload                → operator_required
#   POST /knowledge-base/search → operator_required
#   POST /knowledge-base/add    → operator_required
#   POST /chat                  → operator_required
#   POST /web-search            → operator_required
#   POST /filesystem/*          → operator_required
#
# ADMIN (management)
#   POST   /agents              → admin_required
#   PUT    /agents/{id}         → admin_required
#   DELETE /agents/{id}         → admin_required
#   POST   /settings            → admin_required
#   POST   /self-improve        → admin_required
#   POST   /tools               → admin_required
#   DELETE /tools/{id}          → admin_required
#   GET    /auth/users          → admin_required  (handled in auth_router)
#   POST   /auth/users          → admin_required  (handled in auth_router)
#   PATCH  /auth/users/{user}   → admin_required  (handled in auth_router)
#   DELETE /auth/users/{user}   → admin_required  (handled in auth_router)


# ─── Optional: disable auth in pure local dev mode ───────────────────────────
# Set AUTH_DISABLED=true in .env.local to bypass all auth for dev convenience.
# NEVER use this in production or shared environments.

import os

_AUTH_DISABLED = os.environ.get("AUTH_DISABLED", "false").lower() == "true"

if _AUTH_DISABLED:
    import warnings
    warnings.warn(
        "[auth_middleware] AUTH_DISABLED=true — all auth guards are BYPASSED. "
        "Do not use in production!",
        stacklevel=1,
    )

    class _MockUser:
        username = "local-dev"
        role = "admin"
        display_name = "Local Dev (Auth Disabled)"

    def _noop_guard(*_args, **_kwargs):
        return _MockUser()

    # Override guards with no-ops when disabled
    any_user = _noop_guard
    viewer_required = _noop_guard
    operator_required = _noop_guard
    admin_required = _noop_guard
