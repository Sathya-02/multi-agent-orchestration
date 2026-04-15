/**
 * ProfilePage.jsx
 * Full-screen overlay panel for user profile management.
 *
 * Features:
 *  - View current profile info (username, display name, role)
 *  - Change display name
 *  - Change password
 *  - Admin tab: list all users, change roles, add/delete users
 *
 * Accessible via the UserWidget dropdown → "My Profile"
 */
import { useState, useEffect } from 'react'
import { useAuth } from '../auth.jsx'

const API_BASE = import.meta.env.VITE_API_URL?.replace(/\/$/, '') || 'http://localhost:8000'
const AUTH_API = `${API_BASE}/auth`

const ROLE_COLORS = {
  admin:    { bg: 'rgba(239,68,68,0.15)',    color: '#f87171',  border: 'rgba(239,68,68,0.3)' },
  operator: { bg: 'rgba(99,102,241,0.15)',  color: '#a5b4fc',  border: 'rgba(99,102,241,0.3)' },
  viewer:   { bg: 'rgba(100,116,139,0.15)', color: '#94a3b8',  border: 'rgba(100,116,139,0.3)' },
}

function RoleBadge({ role }) {
  const rc = ROLE_COLORS[role] || ROLE_COLORS.viewer
  return (
    <span style={{
      fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 999,
      letterSpacing: '0.05em', textTransform: 'uppercase',
      background: rc.bg, color: rc.color, border: `1px solid ${rc.border}`,
    }}>
      {role}
    </span>
  )
}

function hashColor(str) {
  let h = 5381
  for (let i = 0; i < str.length; i++) h = ((h << 5) + h) + str.charCodeAt(i)
  return `oklch(0.55 0.18 ${Math.abs(h) % 360})`
}

function getInitials(name) {
  if (!name) return '?'
  return name.split(/[\s._-]+/).map(p => p[0]).join('').slice(0, 2).toUpperCase()
}

export default function ProfilePage({ onClose }) {
  const { user, authHeaders, refreshUser } = useAuth()
  const [tab, setTab] = useState('profile')   // 'profile' | 'password' | 'users'

  // ── Profile form ──────────────────────────────────────────
  const [displayName, setDisplayName] = useState(user?.display_name || '')
  const [profileMsg,  setProfileMsg]  = useState('')
  const [profileSaving, setProfileSaving] = useState(false)

  const saveProfile = async () => {
    setProfileSaving(true); setProfileMsg('')
    try {
      const r = await fetch(`${AUTH_API}/users/${user.username}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', ...authHeaders() },
        body: JSON.stringify({ display_name: displayName }),
      })
      const d = await r.json()
      if (!r.ok) { setProfileMsg(`❌ ${d.detail || 'Failed'}`); return }
      await refreshUser()
      setProfileMsg('✅ Display name updated')
    } catch (e) { setProfileMsg(`❌ ${e.message}`) } finally { setProfileSaving(false) }
  }

  // ── Password form ─────────────────────────────────────────
  const [currPw,    setCurrPw]    = useState('')
  const [newPw,     setNewPw]     = useState('')
  const [confirmPw, setConfirmPw] = useState('')
  const [pwMsg,     setPwMsg]     = useState('')
  const [pwSaving,  setPwSaving]  = useState(false)

  const changePassword = async () => {
    if (!currPw || !newPw) { setPwMsg('❌ All fields required'); return }
    if (newPw !== confirmPw) { setPwMsg('❌ Passwords do not match'); return }
    if (newPw.length < 6)   { setPwMsg('❌ Password must be ≥ 6 characters'); return }
    setPwSaving(true); setPwMsg('')
    try {
      const r = await fetch(`${AUTH_API}/users/${user.username}/password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeaders() },
        body: JSON.stringify({ current_password: currPw, new_password: newPw }),
      })
      const d = await r.json()
      if (!r.ok) { setPwMsg(`❌ ${d.detail || 'Failed'}`); return }
      setCurrPw(''); setNewPw(''); setConfirmPw('')
      setPwMsg('✅ Password changed successfully')
    } catch (e) { setPwMsg(`❌ ${e.message}`) } finally { setPwSaving(false) }
  }

  // ── Users admin tab ───────────────────────────────────────
  const [users,      setUsers]      = useState([])
  const [usersLoading, setUsersLoading] = useState(false)
  const [usersMsg,   setUsersMsg]   = useState('')
  const [newUser,    setNewUser]    = useState({ username: '', password: '', role: 'viewer', display_name: '' })
  const [creating,   setCreating]   = useState(false)

  const fetchUsers = async () => {
    setUsersLoading(true)
    try {
      const r = await fetch(`${AUTH_API}/users`, { headers: authHeaders() })
      const d = await r.json()
      setUsers(Array.isArray(d) ? d : (d.users || []))
    } catch {} finally { setUsersLoading(false) }
  }

  useEffect(() => { if (tab === 'users' && user?.role === 'admin') fetchUsers() }, [tab])

  const changeRole = async (username, role) => {
    try {
      await fetch(`${AUTH_API}/users/${username}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', ...authHeaders() },
        body: JSON.stringify({ role }),
      })
      setUsers(p => p.map(u => u.username === username ? { ...u, role } : u))
      setUsersMsg(`✅ Role updated for ${username}`)
    } catch (e) { setUsersMsg(`❌ ${e.message}`) }
  }

  const deleteUser = async (username) => {
    if (!window.confirm(`Delete user "${username}"? This cannot be undone.`)) return
    try {
      await fetch(`${AUTH_API}/users/${username}`, { method: 'DELETE', headers: authHeaders() })
      setUsers(p => p.filter(u => u.username !== username))
      setUsersMsg(`✅ User ${username} deleted`)
    } catch (e) { setUsersMsg(`❌ ${e.message}`) }
  }

  const createUser = async () => {
    if (!newUser.username || !newUser.password) { setUsersMsg('❌ Username and password required'); return }
    setCreating(true)
    try {
      const r = await fetch(`${AUTH_API}/users`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeaders() },
        body: JSON.stringify(newUser),
      })
      const d = await r.json()
      if (!r.ok) { setUsersMsg(`❌ ${d.detail || 'Failed'}`); return }
      setNewUser({ username: '', password: '', role: 'viewer', display_name: '' })
      setUsersMsg(`✅ User "${d.username}" created`)
      await fetchUsers()
    } catch (e) { setUsersMsg(`❌ ${e.message}`) } finally { setCreating(false) }
  }

  const isAdmin = user?.role === 'admin'
  const avatarBg = hashColor(user?.username || '')
  const initials = getInitials(user?.display_name || user?.username || '')

  return (
    <div style={styles.overlay} onClick={e => e.target === e.currentTarget && onClose()}>
      <div style={styles.panel}>
        {/* Header */}
        <div style={styles.panelHeader}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{ ...styles.avatar, background: avatarBg }}>{initials}</div>
            <div>
              <div style={{ color: '#f1f5f9', fontWeight: 700, fontSize: 16 }}>
                {user?.display_name || user?.username}
              </div>
              <div style={{ color: '#64748b', fontSize: 12 }}>@{user?.username} · <RoleBadge role={user?.role} /></div>
            </div>
          </div>
          <button style={styles.closeBtn} onClick={onClose} aria-label="Close">✕</button>
        </div>

        {/* Tabs */}
        <div style={styles.tabBar}>
          {['profile', 'password', ...(isAdmin ? ['users'] : [])].map(t => (
            <button
              key={t}
              style={{ ...styles.tab, ...(tab === t ? styles.tabActive : {}) }}
              onClick={() => setTab(t)}
            >
              {t === 'profile' ? '👤 Profile' : t === 'password' ? '🔑 Password' : '👥 Users'}
            </button>
          ))}
        </div>

        {/* Body */}
        <div style={styles.body}>

          {/* ── Profile tab ──────────────────────────────── */}
          {tab === 'profile' && (
            <div style={styles.section}>
              <h3 style={styles.sectionTitle}>Profile Information</h3>

              <div style={styles.field}>
                <label style={styles.label}>Username</label>
                <input style={{ ...styles.input, opacity: 0.5, cursor: 'not-allowed' }}
                  value={user?.username || ''} disabled />
                <span style={styles.hint}>Username cannot be changed</span>
              </div>

              <div style={styles.field}>
                <label style={styles.label}>Role</label>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 6 }}>
                  <RoleBadge role={user?.role} />
                  <span style={{ color: '#475569', fontSize: 12 }}>Assigned by admin</span>
                </div>
              </div>

              <div style={styles.field}>
                <label style={styles.label} htmlFor="dp-display-name">Display Name</label>
                <input
                  id="dp-display-name"
                  style={styles.input}
                  value={displayName}
                  onChange={e => setDisplayName(e.target.value)}
                  placeholder="Your full name"
                />
              </div>

              {profileMsg && <p style={msgStyle(profileMsg)}>{profileMsg}</p>}

              <button
                style={profileSaving ? { ...styles.btn, opacity: 0.6 } : styles.btn}
                onClick={saveProfile}
                disabled={profileSaving}
              >
                {profileSaving ? 'Saving…' : 'Save Changes'}
              </button>

              {/* Role capabilities table */}
              <div style={{ marginTop: 28 }}>
                <h4 style={{ ...styles.sectionTitle, fontSize: 13, marginBottom: 10 }}>Role Capabilities</h4>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                  <thead>
                    <tr>
                      {['Feature', 'Viewer', 'Operator', 'Admin'].map(h => (
                        <th key={h} style={styles.th}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {[
                      ['View agents & logs',    '✅','✅','✅'],
                      ['Run tasks',             '—', '✅','✅'],
                      ['Upload documents',      '—', '✅','✅'],
                      ['RAG / Chat / Search',   '—', '✅','✅'],
                      ['Create/delete agents',  '—', '—', '✅'],
                      ['Manage users',          '—', '—', '✅'],
                      ['Change settings',       '—', '—', '✅'],
                      ['Trigger self-improver', '—', '—', '✅'],
                    ].map(([feat, ...cells]) => (
                      <tr key={feat}>
                        <td style={styles.td}>{feat}</td>
                        {cells.map((c, i) => (
                          <td key={i} style={{ ...styles.td, textAlign: 'center', color: c === '✅' ? '#4ade80' : '#475569' }}>{c}</td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* ── Password tab ──────────────────────────────── */}
          {tab === 'password' && (
            <div style={styles.section}>
              <h3 style={styles.sectionTitle}>Change Password</h3>

              <div style={styles.field}>
                <label style={styles.label} htmlFor="dp-curr-pw">Current Password</label>
                <input id="dp-curr-pw" type="password" style={styles.input}
                  value={currPw} onChange={e => setCurrPw(e.target.value)} placeholder="••••••••" />
              </div>
              <div style={styles.field}>
                <label style={styles.label} htmlFor="dp-new-pw">New Password</label>
                <input id="dp-new-pw" type="password" style={styles.input}
                  value={newPw} onChange={e => setNewPw(e.target.value)} placeholder="Min 6 characters" />
              </div>
              <div style={styles.field}>
                <label style={styles.label} htmlFor="dp-confirm-pw">Confirm New Password</label>
                <input id="dp-confirm-pw" type="password" style={styles.input}
                  value={confirmPw} onChange={e => setConfirmPw(e.target.value)} placeholder="Repeat password" />
              </div>

              {pwMsg && <p style={msgStyle(pwMsg)}>{pwMsg}</p>}

              <button
                style={pwSaving ? { ...styles.btn, opacity: 0.6 } : styles.btn}
                onClick={changePassword}
                disabled={pwSaving}
              >
                {pwSaving ? 'Updating…' : 'Update Password'}
              </button>
            </div>
          )}

          {/* ── Users admin tab ───────────────────────────── */}
          {tab === 'users' && isAdmin && (
            <div style={styles.section}>
              <h3 style={styles.sectionTitle}>User Management</h3>
              {usersMsg && <p style={msgStyle(usersMsg)}>{usersMsg}</p>}

              {/* Create user */}
              <div style={styles.createBox}>
                <h4 style={{ color: '#94a3b8', fontSize: 12, fontWeight: 600, marginBottom: 10, textTransform: 'uppercase', letterSpacing: '.05em' }}>New User</h4>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                  <div style={styles.field}>
                    <label style={styles.label}>Username *</label>
                    <input style={styles.input} value={newUser.username}
                      onChange={e => setNewUser(p => ({ ...p, username: e.target.value }))}
                      placeholder="username" />
                  </div>
                  <div style={styles.field}>
                    <label style={styles.label}>Password *</label>
                    <input type="password" style={styles.input} value={newUser.password}
                      onChange={e => setNewUser(p => ({ ...p, password: e.target.value }))}
                      placeholder="••••••••" />
                  </div>
                  <div style={styles.field}>
                    <label style={styles.label}>Display Name</label>
                    <input style={styles.input} value={newUser.display_name}
                      onChange={e => setNewUser(p => ({ ...p, display_name: e.target.value }))}
                      placeholder="Full Name" />
                  </div>
                  <div style={styles.field}>
                    <label style={styles.label}>Role</label>
                    <select style={styles.input} value={newUser.role}
                      onChange={e => setNewUser(p => ({ ...p, role: e.target.value }))}>
                      <option value="viewer">Viewer</option>
                      <option value="operator">Operator</option>
                      <option value="admin">Admin</option>
                    </select>
                  </div>
                </div>
                <button
                  style={{ ...styles.btn, marginTop: 10, ...(creating ? { opacity: 0.6 } : {}) }}
                  onClick={createUser} disabled={creating}
                >
                  {creating ? 'Creating…' : '+ Create User'}
                </button>
              </div>

              {/* Users list */}
              {usersLoading ? (
                <p style={{ color: '#475569', textAlign: 'center', padding: 20 }}>Loading users…</p>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 16 }}>
                  {users.map(u => (
                    <div key={u.username} style={styles.userRow}>
                      <div style={{ ...styles.avatar, ...styles.avatarSm, background: hashColor(u.username) }}>
                        {getInitials(u.display_name || u.username)}
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ color: '#e2e8f0', fontSize: 13, fontWeight: 500 }}>
                          {u.display_name || u.username}
                          {u.username === user.username && <span style={{ color: '#6366f1', fontSize: 11, marginLeft: 6 }}>(you)</span>}
                        </div>
                        <div style={{ color: '#64748b', fontSize: 11 }}>@{u.username}</div>
                      </div>

                      {/* Role selector */}
                      <select
                        style={styles.roleSelect}
                        value={u.role}
                        disabled={u.username === user.username}
                        onChange={e => changeRole(u.username, e.target.value)}
                      >
                        <option value="viewer">Viewer</option>
                        <option value="operator">Operator</option>
                        <option value="admin">Admin</option>
                      </select>

                      {/* Delete */}
                      {u.username !== user.username && (
                        <button
                          style={styles.deleteBtn}
                          onClick={() => deleteUser(u.username)}
                          title={`Delete ${u.username}`}
                        >
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <polyline points="3 6 5 6 21 6"/>
                            <path d="M19 6l-1 14H6L5 6"/>
                            <path d="M10 11v6M14 11v6"/>
                            <path d="M9 6V4h6v2"/>
                          </svg>
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

const msgStyle = (msg) => ({
  fontSize: 13,
  color: msg.startsWith('✅') ? '#4ade80' : '#f87171',
  background: msg.startsWith('✅') ? 'rgba(74,222,128,0.08)' : 'rgba(248,113,113,0.08)',
  border: `1px solid ${msg.startsWith('✅') ? 'rgba(74,222,128,0.2)' : 'rgba(248,113,113,0.2)'}`,
  padding: '8px 12px',
  borderRadius: 8,
  margin: '10px 0',
})

const styles = {
  overlay: {
    position: 'fixed', inset: 0,
    background: 'rgba(0,0,0,0.65)',
    backdropFilter: 'blur(4px)',
    display: 'flex', alignItems: 'flex-start', justifyContent: 'flex-end',
    zIndex: 10000,
    padding: '56px 16px 16px',
    fontFamily: "'Inter', 'Segoe UI', sans-serif",
  },
  panel: {
    width: '100%', maxWidth: 560,
    background: '#1e2130',
    border: '1px solid rgba(255,255,255,0.07)',
    borderRadius: 16,
    boxShadow: '0 32px 64px rgba(0,0,0,0.6)',
    display: 'flex', flexDirection: 'column',
    maxHeight: 'calc(100vh - 80px)',
    overflow: 'hidden',
  },
  panelHeader: {
    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    padding: '18px 20px 16px',
    borderBottom: '1px solid rgba(255,255,255,0.06)',
    flexShrink: 0,
  },
  avatar: {
    width: 40, height: 40, borderRadius: '50%',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    fontSize: 14, fontWeight: 700, color: '#fff', flexShrink: 0,
  },
  avatarSm: { width: 32, height: 32, fontSize: 12 },
  closeBtn: {
    background: 'none', border: 'none', color: '#475569',
    fontSize: 18, cursor: 'pointer', padding: '4px 8px', borderRadius: 6,
  },
  tabBar: {
    display: 'flex', borderBottom: '1px solid rgba(255,255,255,0.06)',
    flexShrink: 0,
  },
  tab: {
    flex: 1, padding: '12px 16px', background: 'none',
    border: 'none', borderBottom: '2px solid transparent',
    color: '#64748b', fontSize: 13, cursor: 'pointer', transition: 'all .15s',
  },
  tabActive: {
    color: '#a5b4fc', borderBottomColor: '#6366f1',
  },
  body: {
    flex: 1, overflowY: 'auto', padding: '20px',
  },
  section: {
    display: 'flex', flexDirection: 'column', gap: 4,
  },
  sectionTitle: {
    color: '#94a3b8', fontSize: 14, fontWeight: 600,
    marginBottom: 14, letterSpacing: '-0.2px',
  },
  field: {
    marginBottom: 12,
  },
  label: {
    display: 'block', color: '#64748b', fontSize: 12,
    fontWeight: 500, marginBottom: 6,
  },
  hint: {
    display: 'block', color: '#334155', fontSize: 11, marginTop: 4,
  },
  input: {
    width: '100%', padding: '9px 12px',
    background: '#0f1117', border: '1px solid #1e293b',
    borderRadius: 8, color: '#e2e8f0', fontSize: 13,
    outline: 'none', boxSizing: 'border-box',
  },
  btn: {
    padding: '10px 20px', background: '#6366f1',
    color: '#fff', border: 'none', borderRadius: 8,
    fontSize: 14, fontWeight: 600, cursor: 'pointer',
    transition: 'background .15s', alignSelf: 'flex-start',
  },
  createBox: {
    background: 'rgba(99,102,241,0.05)',
    border: '1px solid rgba(99,102,241,0.12)',
    borderRadius: 10, padding: 14, marginBottom: 8,
  },
  userRow: {
    display: 'flex', alignItems: 'center', gap: 10,
    background: '#161821', border: '1px solid rgba(255,255,255,0.05)',
    borderRadius: 10, padding: '10px 12px',
  },
  roleSelect: {
    background: '#0f1117', border: '1px solid #1e293b',
    color: '#94a3b8', borderRadius: 6, padding: '4px 8px',
    fontSize: 12, cursor: 'pointer',
  },
  deleteBtn: {
    background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)',
    color: '#f87171', borderRadius: 6, padding: '5px 8px',
    cursor: 'pointer', display: 'flex', alignItems: 'center',
  },
}
