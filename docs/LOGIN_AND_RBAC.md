# Login & Role-Based Access Control (RBAC)

This document covers the local login system and role-based feature gating added
to the Multi-Agent Orchestration workspace.

---

## Overview

The auth system uses **JWT Bearer tokens** with local user management via `users.json`.
No external auth provider is needed — everything runs offline.

### Three Roles

| Role | Level | What they can do |
|------|-------|------------------|
| `viewer` | 1 | Read agents, tasks, logs, knowledge base |
| `operator` | 2 | Viewer + run tasks, upload docs, RAG search, chat |
| `admin` | 3 | All + manage users, agents, settings, self-improver |

---

## Quick Setup

### 1. Install dependency

```bash
pip install PyJWT
# or: it is already in requirements.txt if you update it:
# PyJWT>=2.8.0
```

### 2. Register the router in `main.py`

Add these lines near the top of `backend/main.py`:

```python
from routers.auth_router import router as auth_router
app.include_router(auth_router)
```

### 3. Set a strong secret key in `.env.local`

```bash
AUTH_SECRET_KEY=your-random-256-bit-secret-here
ACCESS_TOKEN_EXPIRE_MINUTES=480
# Set to true ONLY for pure local dev with no shared access:
# AUTH_DISABLED=false
```

### 4. Change default passwords immediately

Default seed users (all have password `password`):
- `admin` / `operator` / `viewer`

Change via API:
```bash
curl -X PATCH http://localhost:8000/auth/users/admin \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{"password": "your-new-strong-password"}'
```

---

## API Endpoints

### Login

```bash
curl -X POST http://localhost:8000/auth/login \
  -d "username=admin&password=password"
# Returns: { "access_token": "eyJ...", "role": "admin", ... }
```

### Get current user

```bash
curl http://localhost:8000/auth/me \
  -H "Authorization: Bearer <token>"
```

### Create a new user (admin only)

```bash
curl -X POST http://localhost:8000/auth/users \
  -H "Authorization: Bearer <admin-token>" \
  -H "Content-Type: application/json" \
  -d '{"username": "alice", "password": "secure123", "role": "operator", "display_name": "Alice"}'
```

### Change a user's role

```bash
curl -X PATCH http://localhost:8000/auth/users/alice \
  -H "Authorization: Bearer <admin-token>" \
  -H "Content-Type: application/json" \
  -d '{"role": "admin"}'
```

### Disable a user

```bash
curl -X PATCH http://localhost:8000/auth/users/alice \
  -H "Authorization: Bearer <admin-token>" \
  -H "Content-Type: application/json" \
  -d '{"active": false}'
```

---

## Protecting Existing Routes in `main.py`

```python
from middleware.auth_middleware import (
    viewer_required, operator_required, admin_required, UserToken
)

# Read-only route:
@app.get("/agents")
async def get_agents(user: UserToken = viewer_required):
    ...

# Task execution route:
@app.post("/run")
async def run_task(data: dict, user: UserToken = operator_required):
    ...

# Admin management route:
@app.post("/agents")
async def create_agent(data: dict, user: UserToken = admin_required):
    ...
```

The `user` object contains:
- `user.username` — the logged-in username
- `user.role` — `viewer` | `operator` | `admin`
- `user.display_name` — friendly name

---

## Recommended Role Assignments

See the full mapping in `backend/middleware/auth_middleware.py`.

| Route Pattern | Guard |
|---------------|-------|
| `GET /agents*`, `GET /tasks*`, `GET /logs*` | `viewer_required` |
| `POST /run*`, `POST /upload*`, `POST /chat*` | `operator_required` |
| `POST/DELETE /agents*`, `POST /settings*` | `admin_required` |
| `POST /self-improve*`, `POST /tools*` | `admin_required` |

---

## Security Notes

- Passwords are **SHA-256 + salt** hashed at rest in `users.json`
- Tokens expire after 8 hours by default (`ACCESS_TOKEN_EXPIRE_MINUTES`)
- `AUTH_DISABLED=true` in `.env.local` bypasses all guards for dev convenience — never use in production
- `users.json` is already in `.gitignore` — verify this before committing
- For team/shared deployments, consider migrating to a proper DB (SQLite + SQLAlchemy) using the same `require_role()` interface
