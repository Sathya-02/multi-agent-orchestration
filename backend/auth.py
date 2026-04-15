"""
auth.py — Local workspace authentication + RBAC engine.

Users are stored in users.json (next to this file).
Tokens are JWTs signed with AUTH_SECRET_KEY from .env.local.

Role hierarchy: viewer < operator < admin

New in this version:
  - extra_permissions list stored per-user (admin-assignable)
  - update_user / delete_user / list_users / create_user helpers
  - hash_password / verify_password exposed for router
"""
import os, json, time, hashlib, secrets
from pathlib import Path
from typing import Optional, List
from dataclasses import dataclass

try:
    import jwt
except ImportError:
    jwt = None  # graceful degradation — token will be a plain JSON string

from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer

# ── Config ────────────────────────────────────────────────────────────────────
SECRET_KEY   = os.getenv("AUTH_SECRET_KEY", "dev-secret-change-me")
ALGORITHM   = "HS256"
TOKEN_EXPIRE = int(os.getenv("AUTH_TOKEN_EXPIRE_HOURS", "24")) * 3600
USERS_FILE   = Path(__file__).parent / "users.json"
ROLE_RANK    = {"viewer": 0, "operator": 1, "admin": 2}

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/auth/login", auto_error=False)


# ── User store ────────────────────────────────────────────────────────────────
def _load() -> dict:
    if not USERS_FILE.exists():
        return {}
    with open(USERS_FILE) as f:
        return json.load(f)

def _save(data: dict):
    with open(USERS_FILE, "w") as f:
        json.dump(data, f, indent=2)

def list_users() -> List[dict]:
    return list(_load().values())

def get_user(username: str) -> Optional[dict]:
    return _load().get(username)

def create_user(username: str, password: str, display_name: str = "",
                role: str = "viewer", extra_permissions: List[str] = None) -> dict:
    data = _load()
    user = {
        "username":          username,
        "display_name":      display_name or username,
        "role":              role,
        "active":            True,
        "extra_permissions": extra_permissions or [],
        "password_hash":     hash_password(password),
    }
    data[username] = user
    _save(data)
    return user

def update_user(username: str, **kwargs) -> dict:
    data = _load()
    if username not in data:
        raise KeyError(f"User '{username}' not found")
    data[username].update(kwargs)
    _save(data)
    return data[username]

def delete_user(username: str):
    data = _load()
    if username in data:
        del data[username]
        _save(data)


# ── Password hashing ──────────────────────────────────────────────────────────
def hash_password(password: str, salt: str = None) -> str:
    salt = salt or secrets.token_hex(16)
    h = hashlib.sha256(f"{salt}{password}".encode()).hexdigest()
    return f"{salt}:{h}"

def verify_password(password: str, stored: str) -> bool:
    try:
        salt, _ = stored.split(":", 1)
        return hash_password(password, salt) == stored
    except Exception:
        return False


# ── JWT ───────────────────────────────────────────────────────────────────────
def create_token(payload: dict) -> str:
    data = {**payload, "exp": int(time.time()) + TOKEN_EXPIRE, "iat": int(time.time())}
    if jwt:
        return jwt.encode(data, SECRET_KEY, algorithm=ALGORITHM)
    import base64
    return base64.b64encode(json.dumps(data).encode()).decode()

def decode_token(token: str) -> Optional[dict]:
    if jwt:
        try:
            return jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        except Exception:
            return None
    try:
        import base64
        return json.loads(base64.b64decode(token.encode()).decode())
    except Exception:
        return None


# ── FastAPI dependencies ───────────────────────────────────────────────────────
@dataclass
class UserToken:
    username: str
    role:     str
    extra_permissions: List[str] = None

    def can(self, perm: str) -> bool:
        PERMISSIONS = {
            "view_dashboard":"viewer","view_files":"viewer","view_filesystem":"viewer",
            "view_kb":"viewer","view_tools":"viewer","view_agents":"viewer",
            "view_settings":"viewer","view_models":"viewer","kb_search":"viewer",
            "kb_rag_query":"viewer","upload_files":"operator","delete_files":"operator",
            "ingest_kb":"operator","delete_kb_source":"operator","clear_kb":"operator",
            "save_kb_config":"operator","run_task":"operator","chat_send":"operator",
            "web_search":"operator","filesystem_write":"operator","approve_spawn":"operator",
            "add_tool":"operator","edit_tool":"operator","delete_tool":"operator",
            "edit_agent":"operator","edit_skills_md":"operator","manage_users":"admin",
            "create_agent":"admin","delete_agent":"admin","edit_settings":"admin",
            "change_model":"admin","self_improve":"admin","assign_roles":"admin",
        }
        req = PERMISSIONS.get(perm)
        if req and (ROLE_RANK.get(self.role, -1) >= ROLE_RANK.get(req, 99)):
            return True
        if self.extra_permissions and perm in self.extra_permissions:
            return True
        return False


def authenticate_user(username: str, password: str) -> Optional[dict]:
    user = get_user(username)
    if not user:
        return None
    if not user.get("active", True):
        return None
    if not verify_password(password, user.get("password_hash", "")):
        return None
    return user


async def get_current_user(token: str = Depends(oauth2_scheme)) -> UserToken:
    if not token:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED,
                            detail="Not authenticated",
                            headers={"WWW-Authenticate": "Bearer"})
    payload = decode_token(token)
    if not payload or "sub" not in payload:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED,
                            detail="Invalid or expired token")
    exp = payload.get("exp", 0)
    if exp and time.time() > exp:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED,
                            detail="Token expired")
    # Load fresh user to pick up latest role/extra_permissions
    user = get_user(payload["sub"])
    role  = user["role"] if user else payload.get("role", "viewer")
    extra = user.get("extra_permissions", []) if user else []
    return UserToken(username=payload["sub"], role=role, extra_permissions=extra)


def require_role(min_role: str):
    """Dependency factory — rejects requests below the required role."""
    async def _check(current: UserToken = Depends(get_current_user)) -> UserToken:
        if ROLE_RANK.get(current.role, -1) < ROLE_RANK.get(min_role, 99):
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN,
                                detail=f"Requires role: {min_role} or higher")
        return current
    return _check
