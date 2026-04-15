/**
 * UserManagementPanel.jsx  — Admin only
 *
 * Features:
 *   - List all users with role badges
 *   - Create new user (username, display name, password, role)
 *   - Change user role (viewer / operator / admin)
 *   - Toggle user active/inactive
 *   - Grant / revoke individual extra permissions beyond their base role
 *   - Delete user (cannot delete self)
 *   - Reset password
 */
import { useState, useEffect, useCallback } from 'react'
import '../../styles/App.css'
import { useAuth } from '../../auth.jsx'
import { can, ROLES, PERMISSION_GROUPS, PERMISSION_LABELS } from '../../rbac.js'

const API = (path) => `http://localhost:8000${path}`

const ROLE_META = {
  admin:    { label: 'Admin',    color: '#f87171', bg: 'rgba(239,68,68,0.12)' },
  operator: { label: 'Operator', color: '#a5b4fc', bg: 'rgba(99,102,241,0.12)' },
  viewer:   { label: 'Viewer',   color: '#94a3b8', bg: 'rgba(100,116,139,0.12)' },
}

function RoleBadge({ role }) {
  const m = ROLE_META[role] || ROLE_META.viewer
  return (
    <span style={{
      fontSize:10, fontWeight:700, padding:'2px 8px', borderRadius:999,
      textTransform:'uppercase', letterSpacing:'0.05em',
      background: m.bg, color: m.color, border: `1px solid ${m.color}40`
    }}>{m.label}</span>
  )
}

export default function UserManagementPanel({ onClose }) {
  const { user: me, token } = useAuth()
  const canManage = can(me, 'manage_users')

  const [users,   setUsers]   = useState([])
  const [loading, setLoading] = useState(false)
  const [error,   setError]   = useState('')
  const [tab,     setTab]     = useState('users')   // 'users' | 'create'

  // Create form
  const [newUsername,    setNewUsername]    = useState('')
  const [newDisplayName, setNewDisplayName] = useState('')
  const [newPassword,    setNewPassword]    = useState('')
  const [newRole,        setNewRole]        = useState('viewer')
  const [creating,       setCreating]       = useState(false)

  // Permission editor (per user)
  const [expandedUser,   setExpandedUser]   = useState(null)
  const [pwdUser,        setPwdUser]        = useState(null)
  const [newPwd,         setNewPwd]         = useState('')
  const [saving,         setSaving]         = useState({})

  const authHeaders = useCallback(() => ({
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  }), [token])

  const fetchUsers = useCallback(async () => {
    setLoading(true); setError('')
    try {
      const r = await fetch(API('/auth/users'), { headers: authHeaders() })
      if (!r.ok) throw new Error(await r.text())
      const d = await r.json()
      setUsers(Array.isArray(d) ? d : (d.users || []))
    } catch (e) { setError(e.message) }
    finally { setLoading(false) }
  }, [authHeaders])

  useEffect(() => { if (canManage) fetchUsers() }, [canManage, fetchUsers])

  const patchUser = async (username, body) => {
    setSaving(p => ({ ...p, [username]: true }))
    try {
      const r = await fetch(API(`/auth/users/${username}`), {
        method: 'PATCH',
        headers: authHeaders(),
        body: JSON.stringify(body),
      })
      if (!r.ok) throw new Error(await r.text())
      await fetchUsers()
    } catch (e) { setError(e.message) }
    finally { setSaving(p => ({ ...p, [username]: false })) }
  }

  const deleteUser = async (username) => {
    if (!window.confirm(`Delete user "${username}"? This cannot be undone.`)) return
    try {
      const r = await fetch(API(`/auth/users/${username}`), {
        method: 'DELETE', headers: authHeaders()
      })
      if (!r.ok) throw new Error(await r.text())
      await fetchUsers()
    } catch (e) { setError(e.message) }
  }

  const resetPassword = async (username) => {
    if (!newPwd.trim()) return
    try {
      const r = await fetch(API(`/auth/users/${username}/password`), {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify({ new_password: newPwd, admin_override: true }),
      })
      if (!r.ok) throw new Error(await r.text())
      setPwdUser(null); setNewPwd('')
    } catch (e) { setError(e.message) }
  }

  const createUser = async () => {
    if (!newUsername.trim() || !newPassword.trim()) return
    setCreating(true)
    try {
      const r = await fetch(API('/auth/users'), {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify({
          username: newUsername.trim(),
          display_name: newDisplayName.trim() || newUsername.trim(),
          password: newPassword,
          role: newRole,
        }),
      })
      if (!r.ok) throw new Error(await r.text())
      setNewUsername(''); setNewDisplayName(''); setNewPassword(''); setNewRole('viewer')
      setTab('users')
      await fetchUsers()
    } catch (e) { setError(e.message) }
    finally { setCreating(false) }
  }

  const toggleExtraPerm = async (u, perm) => {
    const cur = Array.isArray(u.extra_permissions) ? u.extra_permissions : []
    const next = cur.includes(perm) ? cur.filter(p => p !== perm) : [...cur, perm]
    await patchUser(u.username, { extra_permissions: next })
  }

  if (!canManage) return (
    <div className="overlay-panel" style={{ padding:24 }}>
      <div className="overlay-header"><span>👥 Users</span><button className="overlay-close" onClick={onClose}>✕</button></div>
      <div style={viewerBanner}>🔒 User management requires Admin role.</div>
    </div>
  )

  return (
    <div className="overlay-panel" style={{ maxWidth:640, width:'100%' }}>
      <div className="overlay-header">
        <span>👥 User Management</span>
        <button className="overlay-close" onClick={onClose}>✕</button>
      </div>

      {/* Tabs */}
      <div className="agent-tabs">
        <button className={`agent-tab${tab==='users'  ? ' active':''}`} onClick={() => setTab('users')}>👥 Users</button>
        <button className={`agent-tab${tab==='create' ? ' active':''}`} onClick={() => setTab('create')}>➕ Create User</button>
      </div>

      {error && <div style={{ margin:'8px 14px', padding:'7px 10px', borderRadius:6, background:'rgba(239,68,68,0.1)', border:'1px solid rgba(239,68,68,0.3)', color:'#f87171', fontSize:12 }}>{error}</div>}

      {/* ── USERS LIST ── */}
      {tab === 'users' && (
        <div style={{ flex:1, overflowY:'auto', padding:'10px 14px' }}>
          {loading && <div className="empty-hint">Loading users…</div>}
          {!loading && users.length === 0 && <div className="empty-hint">No users found.</div>}

          {users.map(u => {
            const isSelf    = u.username === me.username
            const isExpanded = expandedUser === u.username
            const isPwdOpen  = pwdUser     === u.username
            return (
              <div key={u.username} style={{
                borderRadius:8, marginBottom:8,
                background:'rgba(255,255,255,0.03)',
                border:`1px solid ${isExpanded ? 'rgba(99,102,241,0.4)' : 'var(--bd-subtle)'}`,
                overflow:'hidden'
              }}>
                {/* User row */}
                <div style={{ display:'flex', alignItems:'center', gap:8, padding:'10px 12px' }}>
                  {/* Avatar */}
                  <div style={{
                    width:32, height:32, borderRadius:'50%', flexShrink:0,
                    background: `oklch(0.55 0.18 ${Math.abs(u.username.split('').reduce((h,c)=>((h<<5)+h)+c.charCodeAt(0),5381)) % 360})`,
                    display:'flex', alignItems:'center', justifyContent:'center',
                    fontSize:12, fontWeight:700, color:'#fff'
                  }}>
                    {(u.display_name || u.username)[0].toUpperCase()}
                  </div>

                  {/* Name + username */}
                  <div style={{ flex:1, minWidth:0 }}>
                    <div style={{ fontSize:13, fontWeight:600, color:'var(--tx-primary)' }}>
                      {u.display_name || u.username}
                      {isSelf && <span style={{ fontSize:10, color:'var(--tx-muted)', marginLeft:6 }}>(you)</span>}
                    </div>
                    <div style={{ fontSize:11, color:'var(--tx-muted)' }}>@{u.username}</div>
                  </div>

                  <RoleBadge role={u.role} />

                  {/* Active toggle */}
                  <button
                    className={`si-toggle ${u.active !== false ? 'on' : 'off'}`}
                    style={{ fontSize:11 }}
                    disabled={isSelf}
                    onClick={() => patchUser(u.username, { active: !(u.active !== false) })}
                    title={u.active !== false ? 'Deactivate' : 'Activate'}>
                    {u.active !== false ? '🟢' : '🔴'}
                  </button>

                  {/* Expand permissions */}
                  <button
                    className="agent-action-btn"
                    onClick={() => setExpandedUser(isExpanded ? null : u.username)}
                    title="Edit permissions">
                    {isExpanded ? '▲ Less' : '▼ Perms'}
                  </button>

                  {/* Delete */}
                  {!isSelf && (
                    <button className="del-btn" onClick={() => deleteUser(u.username)} title="Delete user">🗑</button>
                  )}
                </div>

                {/* ── Expanded: role + extra permissions editor ── */}
                {isExpanded && (
                  <div style={{ padding:'0 12px 12px', borderTop:'1px solid var(--bd-subtle)' }}>

                    {/* Role selector */}
                    <div style={{ display:'flex', alignItems:'center', gap:8, marginTop:10, marginBottom:10 }}>
                      <span style={{ fontSize:12, color:'var(--tx-secondary)', fontWeight:600, minWidth:80 }}>Role</span>
                      {ROLES.map(r => (
                        <button key={r}
                          disabled={isSelf}
                          onClick={() => !isSelf && patchUser(u.username, { role: r })}
                          style={{
                            padding:'3px 12px', borderRadius:999, fontSize:11, fontWeight:700,
                            cursor: isSelf ? 'default' : 'pointer',
                            border: `1px solid ${u.role===r ? ROLE_META[r].color : 'var(--bd-subtle)'}`,
                            background: u.role===r ? ROLE_META[r].bg : 'transparent',
                            color: u.role===r ? ROLE_META[r].color : 'var(--tx-muted)',
                            opacity: isSelf ? 0.5 : 1,
                          }}>
                          {ROLE_META[r].label}
                        </button>
                      ))}
                      {saving[u.username] && <span style={{ fontSize:11, color:'var(--tx-muted)' }}>Saving…</span>}
                    </div>

                    {/* Extra permissions (grant above base role) */}
                    <div style={{ fontSize:11, fontWeight:700, color:'var(--tx-muted)', textTransform:'uppercase', letterSpacing:'0.08em', marginBottom:6 }}>
                      Extra Permissions
                      <span style={{ fontWeight:400, textTransform:'none', marginLeft:6, color:'var(--tx-muted)' }}>
                        — grant specific capabilities beyond their role
                      </span>
                    </div>
                    {PERMISSION_GROUPS.map(grp => (
                      <div key={grp.label} style={{ marginBottom:8 }}>
                        <div style={{ fontSize:10, color:'var(--tx-muted)', marginBottom:4 }}>{grp.label}</div>
                        <div style={{ display:'flex', flexWrap:'wrap', gap:5 }}>
                          {grp.perms.map(perm => {
                            const hasIt  = Array.isArray(u.extra_permissions) && u.extra_permissions.includes(perm)
                            const byRole = (() => { const ROLE_RANK={viewer:0,operator:1,admin:2}; const PERM_MIN={view_dashboard:'viewer',view_files:'viewer',view_filesystem:'viewer',view_kb:'viewer',view_tools:'viewer',view_agents:'viewer',view_settings:'viewer',view_models:'viewer',kb_search:'viewer',kb_rag_query:'viewer',upload_files:'operator',delete_files:'operator',ingest_kb:'operator',delete_kb_source:'operator',clear_kb:'operator',save_kb_config:'operator',run_task:'operator',chat_send:'operator',web_search:'operator',filesystem_write:'operator',approve_spawn:'operator',add_tool:'operator',edit_tool:'operator',delete_tool:'operator',edit_agent:'operator',edit_skills_md:'operator',manage_users:'admin',create_agent:'admin',delete_agent:'admin',edit_settings:'admin',change_model:'admin',self_improve:'admin',assign_roles:'admin'}; return (ROLE_RANK[u.role]??-1) >= (ROLE_RANK[PERM_MIN[perm]]??99) })()
                            return (
                              <button
                                key={perm}
                                disabled={byRole}
                                title={byRole ? 'Already granted by role' : (hasIt ? 'Revoke extra permission' : 'Grant extra permission')}
                                onClick={() => !byRole && toggleExtraPerm(u, perm)}
                                style={{
                                  padding:'2px 8px', borderRadius:999, fontSize:10, cursor: byRole ? 'default' : 'pointer',
                                  border: `1px solid ${byRole ? 'var(--bd-subtle)' : hasIt ? 'rgba(16,185,129,0.5)' : 'var(--bd-subtle)'}`,
                                  background: byRole ? 'rgba(255,255,255,0.03)' : hasIt ? 'rgba(16,185,129,0.1)' : 'transparent',
                                  color: byRole ? 'var(--tx-muted)' : hasIt ? '#6ee7b7' : 'var(--tx-secondary)',
                                  opacity: byRole ? 0.6 : 1,
                                }}>
                                {byRole ? '✓ ' : hasIt ? '✅ ' : '○ '}
                                {PERMISSION_LABELS[perm] || perm}
                              </button>
                            )
                          })}
                        </div>
                      </div>
                    ))}

                    {/* Password reset */}
                    <div style={{ marginTop:8, display:'flex', gap:8, alignItems:'center' }}>
                      {isPwdOpen ? (
                        <>
                          <input className="topic-input" style={{ flex:1, marginBottom:0 }}
                            type="password" placeholder="New password"
                            value={newPwd} onChange={e => setNewPwd(e.target.value)} />
                          <button className="agent-action-btn" onClick={() => resetPassword(u.username)}>Set</button>
                          <button className="agent-action-btn" onClick={() => { setPwdUser(null); setNewPwd('') }}>Cancel</button>
                        </>
                      ) : (
                        <button className="agent-action-btn" onClick={() => { setPwdUser(u.username); setNewPwd('') }}>🔑 Reset Password</button>
                      )}
                    </div>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      {/* ── CREATE USER ── */}
      {tab === 'create' && (
        <div className="kb-body">
          <div style={sectionTitle}>➕ Create New User</div>
          <input className="topic-input" placeholder="Username *" value={newUsername}
            onChange={e => setNewUsername(e.target.value)} style={{ marginBottom:6 }} />
          <input className="topic-input" placeholder="Display name" value={newDisplayName}
            onChange={e => setNewDisplayName(e.target.value)} style={{ marginBottom:6 }} />
          <input className="topic-input" type="password" placeholder="Password *" value={newPassword}
            onChange={e => setNewPassword(e.target.value)} style={{ marginBottom:8 }} />

          <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:12 }}>
            <span style={{ fontSize:12, color:'var(--tx-secondary)' }}>Role:</span>
            {ROLES.map(r => (
              <button key={r}
                onClick={() => setNewRole(r)}
                style={{
                  padding:'3px 12px', borderRadius:999, fontSize:11, fontWeight:700, cursor:'pointer',
                  border: `1px solid ${newRole===r ? ROLE_META[r].color : 'var(--bd-subtle)'}`,
                  background: newRole===r ? ROLE_META[r].bg : 'transparent',
                  color: newRole===r ? ROLE_META[r].color : 'var(--tx-muted)',
                }}>
                {ROLE_META[r].label}
              </button>
            ))}
          </div>

          <button className="run-btn"
            onClick={createUser}
            disabled={creating || !newUsername.trim() || !newPassword.trim()}>
            {creating ? '⟳ Creating…' : '➕ Create User'}
          </button>
        </div>
      )}
    </div>
  )
}

const sectionTitle = {
  fontSize:10, fontWeight:700, textTransform:'uppercase',
  letterSpacing:'0.08em', color:'var(--tx-muted)', marginBottom:10
}
const viewerBanner = {
  padding:'8px 12px', borderRadius:7,
  background:'rgba(99,102,241,0.08)',
  border:'1px solid rgba(99,102,241,0.2)',
  color:'#a5b4fc', fontSize:12
}
