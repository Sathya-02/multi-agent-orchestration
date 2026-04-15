# Admin RBAC — Tools, Agents, Skills & Role Assignment

This document describes the **admin-only** endpoints added in `backend/routers/admin_router.py`
and the fine-grained capability system in `backend/middleware/capability_guard.py`.

---

## 1. Register the router

In `backend/main.py` add:

```python
from routers.admin_router import router as admin_router
app.include_router(admin_router)
```

---

## 2. Role & Capability Model

### Base roles (unchanged)

| Role | Default access |
|------|----------------|
| `viewer` | Read-only: agents, tasks, logs, KB, settings |
| `operator` | viewer + run tasks, upload docs, RAG, chat, web search, filesystem |
| `admin` | Everything + all admin endpoints below |

### Fine-grained capabilities

Admins can **grant specific add/edit powers** to `operator` or `viewer` users without promoting
them to `admin`. Capabilities are stored as a list in `backend/users.json`.

| Capability | What it unlocks |
|---|---|
| `add_tools` | Create new tool JSON entries in `tools_dir/` |
| `edit_tools` | Update / delete existing tool entries |
| `add_agents` | Create new agent JSON entries in `agents_dir/` |
| `edit_agents` | Update / delete existing agent entries |
| `edit_tools_md` | Overwrite `docs/tools.md` |
| `edit_skills_md` | Overwrite `docs/skills.md` |

> **Admins always pass** all capability checks — no explicit grant needed.

---

## 3. API Reference

### Authentication

All routes require a valid JWT in the `Authorization: Bearer <token>` header.
Obtain a token via `POST /auth/login`.

---

### Tools

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/admin/tools` | List all tools |
| `POST` | `/admin/tools` | Add a new tool |
| `GET` | `/admin/tools/{tool_name}` | Get one tool |
| `PUT` | `/admin/tools/{tool_name}` | Edit a tool |
| `DELETE` | `/admin/tools/{tool_name}` | Delete a tool |

**Tool body:**
```json
{
  "name": "my_tool",
  "description": "Does something useful",
  "module": "backend.tools.my_tool",
  "enabled": true,
  "metadata": {}
}
```

---

### tools.md

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/admin/tools-md` | Read current tools.md content |
| `PUT` | `/admin/tools-md` | Overwrite tools.md |

**Body:**
```json
{ "content": "# Tools\n\n..." }
```

---

### Agents

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/admin/agents` | List all agents |
| `POST` | `/admin/agents` | Add a new agent |
| `GET` | `/admin/agents/{agent_name}` | Get one agent |
| `PUT` | `/admin/agents/{agent_name}` | Edit an agent |
| `DELETE` | `/admin/agents/{agent_name}` | Delete an agent |

**Agent body:**
```json
{
  "name": "researcher",
  "role": "Senior Researcher",
  "goal": "Find accurate information",
  "backstory": "Experienced analyst",
  "tools": ["web_search", "rag_search"],
  "enabled": true,
  "metadata": {}
}
```

---

### skills.md

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/admin/skills-md` | Read current skills.md content |
| `PUT` | `/admin/skills-md` | Overwrite skills.md |

---

### User / Role Management

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/admin/users` | List all users with roles & capabilities |
| `GET` | `/admin/users/{username}/capabilities` | Get one user's capabilities |
| `POST` | `/admin/users/capabilities` | Grant or revoke capabilities |
| `PUT` | `/admin/users/{username}/role` | Change a user's base role |

**Grant capabilities:**
```json
{
  "username": "operator",
  "capabilities": ["add_tools", "edit_tools"],
  "action": "grant"
}
```

**Revoke capabilities:**
```json
{
  "username": "operator",
  "capabilities": ["edit_tools"],
  "action": "revoke"
}
```

**Change role:**
```
PUT /admin/users/operator/role?new_role=admin
```

---

## 4. Using Capability Guards in Existing Routes

If you want a non-admin user with a granted capability to access a route:

```python
from middleware.capability_guard import can_add_tools, can_edit_agents

@app.post("/tools")
async def add_tool(data: ToolEntry, user = can_add_tools):
    # operator with 'add_tools' capability can reach here
    ...

@app.put("/agents/{name}")
async def edit_agent(name: str, data: AgentEntry, user = can_edit_agents):
    ...
```

Admins always bypass the capability check; other roles must be explicitly granted.

---

## 5. `users.json` Schema

```json
{
  "username": {
    "password_hash": "<sha256>",
    "salt": "",
    "role": "viewer | operator | admin",
    "capabilities": ["add_tools", "edit_tools", ...]
  }
}
```

---

## 6. Quick-start curl examples

```bash
# Login
TOKEN=$(curl -s -X POST http://localhost:8000/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"username":"admin","password":"password"}' | jq -r .access_token)

# List tools
curl -H "Authorization: Bearer $TOKEN" http://localhost:8000/admin/tools

# Add a tool
curl -X POST -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{"name":"my_tool","description":"A new tool","enabled":true,"metadata":{}}' \
  http://localhost:8000/admin/tools

# Grant operator add_tools capability
curl -X POST -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{"username":"operator","capabilities":["add_tools"],"action":"grant"}' \
  http://localhost:8000/admin/users/capabilities

# Promote operator to admin
curl -X PUT -H "Authorization: Bearer $TOKEN" \
  "http://localhost:8000/admin/users/operator/role?new_role=admin"
```
