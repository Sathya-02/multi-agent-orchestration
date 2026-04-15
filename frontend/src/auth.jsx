/**
 * auth.jsx — Authentication context for the MAO frontend
 *
 * Provides:
 *   useAuth()  → { user, loginLocal, loginGoogle, logout, authHeaders, refreshUser, authError, setAuthError }
 *   <AuthProvider>   — wrap around <App />
 *   <RequireAuth>    — redirects unauthenticated users to <LoginPage />
 *
 * Token storage:
 *   - sessionStorage by default (survives reload, cleared on tab close)
 *   - localStorage if the user checks "Remember me" (survives browser restart)
 *
 * FIX: POST /auth/login now sends application/x-www-form-urlencoded
 *      (FastAPI OAuth2PasswordRequestForm requires form data, not JSON).
 */
import { createContext, useContext, useState, useEffect, useCallback } from 'react'
import LoginPage from './components/LoginPage.jsx'

const API_BASE   = (import.meta.env.VITE_API_URL || 'http://localhost:8000').replace(/\/$/, '')
const AUTH_BASE  = `${API_BASE}/auth`
const TOKEN_KEY  = 'mao_auth_token'
const PERSIST_KEY= 'mao_auth_persist'

// ── In-memory token (fast path for authHeaders()) ──────────────────────────
let _memToken = null

function _hydrateToken() {
  if (_memToken) return _memToken
  _memToken = localStorage.getItem(TOKEN_KEY) || sessionStorage.getItem(TOKEN_KEY) || null
  return _memToken
}

function _storeToken(token, persist) {
  _memToken = token
  if (persist) {
    localStorage.setItem(TOKEN_KEY, token)
    localStorage.setItem(PERSIST_KEY, '1')
    sessionStorage.removeItem(TOKEN_KEY)
  } else {
    sessionStorage.setItem(TOKEN_KEY, token)
    localStorage.removeItem(TOKEN_KEY)
    localStorage.removeItem(PERSIST_KEY)
  }
}

function _clearToken() {
  _memToken = null
  sessionStorage.removeItem(TOKEN_KEY)
  localStorage.removeItem(TOKEN_KEY)
  localStorage.removeItem(PERSIST_KEY)
}

export function authHeaders() {
  const t = _hydrateToken()
  return t ? { Authorization: `Bearer ${t}` } : {}
}

// ── Context ────────────────────────────────────────────────────────────────
const AuthContext = createContext(null)

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>')
  return ctx
}

export function getUserInitials(name) {
  if (!name) return '?'
  return name.split(/[\s._-]+/).map(p => p[0]).join('').slice(0, 2).toUpperCase()
}

// ── AuthProvider ────────────────────────────────────────────────────────────
export function AuthProvider({ children }) {
  const [user,      setUser]      = useState(null)
  const [loading,   setLoading]   = useState(true)
  const [authError, setAuthError] = useState(null)

  const refreshUser = useCallback(async () => {
    _hydrateToken()
    if (!_memToken) { setUser(null); return null }
    try {
      const r = await fetch(`${AUTH_BASE}/me`, { headers: { Authorization: `Bearer ${_memToken}` } })
      if (r.status === 401) { _clearToken(); setUser(null); return null }
      const d = await r.json()
      if (d.username) { setUser(d); return d }
      _clearToken(); setUser(null); return null
    } catch {
      return user
    }
  }, [user])

  useEffect(() => {
    (async () => {
      setLoading(true)
      await refreshUser()
      setLoading(false)
    })()
  }, [])   // eslint-disable-line react-hooks/exhaustive-deps

  // ── loginLocal ────────────────────────────────────────────────────────
  // FIXED: send as application/x-www-form-urlencoded so FastAPI's
  // OAuth2PasswordRequestForm can parse it (JSON body → 422 Unprocessable Entity)
  const loginLocal = async (username, password, remember = false) => {
    setAuthError(null)

    const body = new URLSearchParams()
    body.append('username', username)
    body.append('password', password)

    const r = await fetch(`${AUTH_BASE}/login`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body,
    })
    const d = await r.json()
    if (!r.ok) throw new Error(d.detail || d.error || 'Login failed')

    _storeToken(d.token || d.access_token, remember)
    const u = await refreshUser()
    return u
  }

  // ── loginGoogle ───────────────────────────────────────────────────────
  const loginGoogle = () => {
    window.location.href = `${AUTH_BASE}/google`
  }

  // ── logout ────────────────────────────────────────────────────────────
  const logout = () => {
    _clearToken()
    setUser(null)
    setAuthError(null)
  }

  const value = {
    user, loading, authError, setAuthError,
    loginLocal, loginGoogle, logout, authHeaders, refreshUser,
  }

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

// ── RequireAuth ─────────────────────────────────────────────────────────────
export function RequireAuth({ children }) {
  const { user, loading } = useAuth()

  if (loading) {
    return (
      <div style={{
        minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: 'linear-gradient(135deg,#0f1117 0%,#1a1f2e 100%)',
        fontFamily: "'Inter','Segoe UI',sans-serif",
      }}>
        <div style={{ textAlign: 'center' }}>
          <svg width="40" height="40" viewBox="0 0 40 40" fill="none" aria-hidden="true"
            style={{ margin: '0 auto 16px', display: 'block' }}>
            <rect width="40" height="40" rx="10" fill="#6366f1" opacity="0.2"/>
            <circle cx="20" cy="14" r="5" stroke="#6366f1" strokeWidth="2" fill="none">
              <animate attributeName="r" values="4;6;4" dur="1.2s" repeatCount="indefinite"/>
            </circle>
          </svg>
          <p style={{ color: '#475569', fontSize: 14 }}>Checking session…</p>
        </div>
      </div>
    )
  }

  if (!user) return <LoginPage />
  return children
}
