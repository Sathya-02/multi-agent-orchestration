/**
 * UserWidget.jsx
 * Shown in AppHeader when the user is authenticated.
 * Displays avatar + username + role badge, and a dropdown with:
 *   - My Profile  → opens ProfilePage
 *   - Logout      → clears session and redirects to login
 */
import { useState, useRef, useEffect } from 'react'
import { useAuth } from '../auth.jsx'

const ROLE_META = {
  admin:    { label: 'Admin',    bg: 'rgba(239,68,68,0.15)',    color: '#f87171',  border: 'rgba(239,68,68,0.3)' },
  operator: { label: 'Operator', bg: 'rgba(99,102,241,0.15)',  color: '#a5b4fc',  border: 'rgba(99,102,241,0.3)' },
  viewer:   { label: 'Viewer',   bg: 'rgba(100,116,139,0.15)', color: '#94a3b8',  border: 'rgba(100,116,139,0.3)' },
}

function getInitials(name) {
  if (!name) return '?'
  return name.split(/[\s._-]+/).map(p => p[0]).join('').slice(0, 2).toUpperCase()
}

function hashColor(str) {
  let h = 5381
  for (let i = 0; i < str.length; i++) h = ((h << 5) + h) + str.charCodeAt(i)
  const hue = Math.abs(h) % 360
  return `oklch(0.55 0.18 ${hue})`
}

export default function UserWidget({ onOpenProfile }) {
  const { user, logout } = useAuth()
  const [open, setOpen] = useState(false)
  const ref = useRef(null)

  // Close dropdown on outside click
  useEffect(() => {
    const handler = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false) }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  if (!user) return null

  const role = user.role || 'viewer'
  const rm   = ROLE_META[role] || ROLE_META.viewer
  const initials = getInitials(user.display_name || user.username)
  const avatarBg = hashColor(user.username)

  return (
    <div ref={ref} style={styles.wrap}>
      {/* Trigger button */}
      <button
        style={styles.trigger}
        onClick={() => setOpen(v => !v)}
        aria-label="User menu"
        aria-expanded={open}
      >
        {/* Avatar */}
        <div style={{ ...styles.avatar, background: avatarBg }}>{initials}</div>

        {/* Name + role */}
        <div style={styles.info}>
          <span style={styles.name}>{user.display_name || user.username}</span>
          <span style={{ ...styles.roleBadge, background: rm.bg, color: rm.color, border: `1px solid ${rm.border}` }}>
            {rm.label}
          </span>
        </div>

        {/* Chevron */}
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"
          style={{ color: '#64748b', transform: open ? 'rotate(180deg)' : 'none', transition: 'transform .15s' }}>
          <polyline points="6 9 12 15 18 9"/>
        </svg>
      </button>

      {/* Dropdown */}
      {open && (
        <div style={styles.dropdown}>
          {/* Header inside dropdown */}
          <div style={styles.dropHeader}>
            <div style={{ ...styles.avatar, ...styles.avatarLg, background: avatarBg }}>{initials}</div>
            <div>
              <div style={{ color: '#f1f5f9', fontWeight: 600, fontSize: 14 }}>{user.display_name || user.username}</div>
              <div style={{ color: '#64748b', fontSize: 12 }}>@{user.username}</div>
            </div>
          </div>

          <div style={styles.divider} />

          <button
            style={styles.dropItem}
            onClick={() => { setOpen(false); onOpenProfile() }}
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/>
              <circle cx="12" cy="7" r="4"/>
            </svg>
            My Profile
          </button>

          <div style={styles.divider} />

          <button
            style={{ ...styles.dropItem, color: '#f87171' }}
            onClick={() => { setOpen(false); logout() }}
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/>
              <polyline points="16 17 21 12 16 7"/>
              <line x1="21" y1="12" x2="9" y2="12"/>
            </svg>
            Sign Out
          </button>
        </div>
      )}
    </div>
  )
}

const styles = {
  wrap: {
    position: 'relative',
    fontFamily: "'Inter', 'Segoe UI', sans-serif",
  },
  trigger: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    padding: '5px 10px 5px 6px',
    background: 'rgba(255,255,255,0.04)',
    border: '1px solid rgba(255,255,255,0.08)',
    borderRadius: 10,
    cursor: 'pointer',
    color: '#e2e8f0',
    transition: 'background .15s',
  },
  avatar: {
    width: 28,
    height: 28,
    borderRadius: '50%',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: 11,
    fontWeight: 700,
    color: '#fff',
    flexShrink: 0,
  },
  avatarLg: {
    width: 38,
    height: 38,
    fontSize: 14,
  },
  info: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'flex-start',
    gap: 2,
    lineHeight: 1,
  },
  name: {
    fontSize: 13,
    fontWeight: 500,
    color: '#e2e8f0',
  },
  roleBadge: {
    fontSize: 10,
    fontWeight: 600,
    padding: '1px 6px',
    borderRadius: 999,
    letterSpacing: '0.04em',
    textTransform: 'uppercase',
  },
  dropdown: {
    position: 'absolute',
    top: 'calc(100% + 8px)',
    right: 0,
    width: 220,
    background: '#1e2130',
    border: '1px solid rgba(255,255,255,0.08)',
    borderRadius: 12,
    boxShadow: '0 16px 40px rgba(0,0,0,0.5)',
    zIndex: 9999,
    overflow: 'hidden',
    animation: 'fadeDown .15s ease',
  },
  dropHeader: {
    display: 'flex',
    alignItems: 'center',
    gap: 10,
    padding: '14px 14px 12px',
  },
  divider: {
    height: 1,
    background: 'rgba(255,255,255,0.06)',
    margin: '0',
  },
  dropItem: {
    width: '100%',
    display: 'flex',
    alignItems: 'center',
    gap: 9,
    padding: '10px 14px',
    background: 'none',
    border: 'none',
    color: '#cbd5e1',
    fontSize: 13,
    cursor: 'pointer',
    textAlign: 'left',
    transition: 'background .12s',
  },
}
