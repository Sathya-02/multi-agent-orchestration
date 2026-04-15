/**
 * UserWidget.jsx
 * Shown in AppHeader when the user is authenticated.
 *
 * FIX: The dropdown is rendered via a React portal directly into document.body
 * so it is never clipped by the header's overflow:hidden / z-index stacking.
 *
 * Uses getBoundingClientRect() to position the dropdown beneath the trigger
 * button, updated on every open.
 */
import { useState, useRef, useEffect, useCallback } from 'react'
import { createPortal } from 'react-dom'
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
  return `oklch(0.55 0.18 ${Math.abs(h) % 360})`
}

export default function UserWidget({ onOpenProfile }) {
  const { user, logout } = useAuth()
  const [open, setOpen]   = useState(false)
  const [pos,  setPos]    = useState({ top: 0, right: 0 })
  const triggerRef = useRef(null)
  const dropRef    = useRef(null)

  // Calculate dropdown position from trigger button's bounding rect
  const calcPos = useCallback(() => {
    if (!triggerRef.current) return
    const r = triggerRef.current.getBoundingClientRect()
    setPos({
      top:   r.bottom + window.scrollY + 8,
      right: window.innerWidth - r.right,
    })
  }, [])

  const handleToggle = () => {
    if (!open) calcPos()
    setOpen(v => !v)
  }

  // Close on outside click
  useEffect(() => {
    if (!open) return
    const handler = (e) => {
      const inTrigger = triggerRef.current?.contains(e.target)
      const inDrop    = dropRef.current?.contains(e.target)
      if (!inTrigger && !inDrop) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  // Close on Escape
  useEffect(() => {
    if (!open) return
    const handler = (e) => { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [open])

  // Reposition on scroll / resize
  useEffect(() => {
    if (!open) return
    window.addEventListener('scroll', calcPos, true)
    window.addEventListener('resize', calcPos)
    return () => {
      window.removeEventListener('scroll', calcPos, true)
      window.removeEventListener('resize', calcPos)
    }
  }, [open, calcPos])

  if (!user) return null

  const role     = user.role || 'viewer'
  const rm       = ROLE_META[role] || ROLE_META.viewer
  const initials = getInitials(user.display_name || user.username)
  const avatarBg = hashColor(user.username)

  // ── Dropdown (rendered via portal so header overflow never clips it) ────────
  const dropdown = open ? createPortal(
    <div
      ref={dropRef}
      style={{
        position: 'fixed',
        top:   pos.top,
        right: pos.right,
        width: 224,
        background: '#1e2130',
        border: '1px solid rgba(255,255,255,0.1)',
        borderRadius: 12,
        boxShadow: '0 20px 48px rgba(0,0,0,0.6)',
        zIndex: 99999,
        overflow: 'hidden',
        fontFamily: "'Inter','Segoe UI',sans-serif",
      }}
    >
      {/* User header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '14px 14px 12px' }}>
        <div style={{ ...S.avatar, width: 38, height: 38, fontSize: 14, background: avatarBg }}>{initials}</div>
        <div>
          <div style={{ color: '#f1f5f9', fontWeight: 600, fontSize: 14, lineHeight: 1.3 }}>
            {user.display_name || user.username}
          </div>
          <div style={{ color: '#64748b', fontSize: 12 }}>@{user.username}</div>
        </div>
      </div>

      <div style={S.divider} />

      {/* My Profile */}
      <button
        style={S.item}
        onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.05)'}
        onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
        onClick={() => { setOpen(false); onOpenProfile() }}
      >
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/>
          <circle cx="12" cy="7" r="4"/>
        </svg>
        My Profile
      </button>

      <div style={S.divider} />

      {/* Sign Out */}
      <button
        style={{ ...S.item, color: '#f87171' }}
        onMouseEnter={e => e.currentTarget.style.background = 'rgba(239,68,68,0.08)'}
        onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
        onClick={() => { setOpen(false); logout() }}
      >
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/>
          <polyline points="16 17 21 12 16 7"/>
          <line x1="21" y1="12" x2="9" y2="12"/>
        </svg>
        Sign Out
      </button>
    </div>,
    document.body
  ) : null

  return (
    <div style={{ position: 'relative', fontFamily: "'Inter','Segoe UI',sans-serif" }}>
      {/* Trigger */}
      <button
        ref={triggerRef}
        style={S.trigger}
        onClick={handleToggle}
        aria-label="User menu"
        aria-expanded={open}
        aria-haspopup="true"
      >
        <div style={{ ...S.avatar, background: avatarBg }}>{initials}</div>

        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 2, lineHeight: 1 }}>
          <span style={{ fontSize: 13, fontWeight: 500, color: '#e2e8f0' }}>
            {user.display_name || user.username}
          </span>
          <span style={{
            fontSize: 10, fontWeight: 600, padding: '1px 6px', borderRadius: 999,
            letterSpacing: '0.04em', textTransform: 'uppercase',
            background: rm.bg, color: rm.color, border: `1px solid ${rm.border}`,
          }}>
            {rm.label}
          </span>
        </div>

        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#64748b" strokeWidth="2.5"
          style={{ transform: open ? 'rotate(180deg)' : 'none', transition: 'transform .15s', flexShrink: 0 }}>
          <polyline points="6 9 12 15 18 9"/>
        </svg>
      </button>

      {dropdown}
    </div>
  )
}

// Shared style tokens
const S = {
  trigger: {
    display: 'flex', alignItems: 'center', gap: 8,
    padding: '5px 10px 5px 6px',
    background: 'rgba(255,255,255,0.04)',
    border: '1px solid rgba(255,255,255,0.08)',
    borderRadius: 10, cursor: 'pointer', color: '#e2e8f0',
    transition: 'background .15s',
  },
  avatar: {
    width: 28, height: 28, borderRadius: '50%',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    fontSize: 11, fontWeight: 700, color: '#fff', flexShrink: 0,
  },
  divider: {
    height: 1, background: 'rgba(255,255,255,0.06)',
  },
  item: {
    width: '100%', display: 'flex', alignItems: 'center', gap: 9,
    padding: '10px 14px', background: 'transparent',
    border: 'none', color: '#cbd5e1', fontSize: 13,
    cursor: 'pointer', textAlign: 'left',
    transition: 'background .1s',
  },
}
