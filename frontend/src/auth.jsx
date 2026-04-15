/**
 * auth.jsx — Auth context + hooks
 *
 * Supports two login modes:
 *   1. Local JWT  — POST /auth/login (username + password) → stores token in memory
 *   2. Google OAuth — redirect to /auth/login/google (existing flow)
 *
 * URL strategy:
 *   - In development (Vite dev server): use RELATIVE paths (/auth/...) so
 *     vite.config.js proxy forwards them to http://localhost:8000.
 *     This avoids CORS and the "404 from Vite" problem.
 *   - In production builds: VITE_API_URL is injected via __API_URL__ at build
 *     time, so absolute URLs are used (https://api.yourdomain.com/auth/...).
 *
 * Provides:
 *   <AuthProvider>    — wraps the app, checks session on mount
 *   <RequireAuth>     — renders children only when logged in, else shows <LoginPage>
 *   useAuth()         — { user, authLoading, authError, loginLocal, loginGoogle, logout }
 */
import { createContext, useContext, useEffect, useState, useCallback } from 'react'

/**
 * Resolve base API URL:
 *   - Production build: __API_URL__ is injected by Vite define (e.g. "https://api.example.com")
 *   - Dev (Vite proxy): empty string → all fetches use relative paths → proxy forwards to :8000
 */
const API_BASE =
  (typeof __API_URL__ !== 'undefined' && __API_URL__)
    ? __API_URL__
    : (import.meta.env.VITE_API_URL || '')
// API_BASE is '' in local dev — so fetch('/auth/login') goes through Vite proxy to :8000

// Token stored in memory only (no localStorage — sandboxed iframe safe)
let _memToken = null

export function getToken() { return _memToken }
export function setToken(t) { _memToken = t }
export function clearToken() { _memToken = null }

/** Returns headers object with Authorization bearer token if one exists. */
export function authHeaders(extra = {}) {
  return _memToken
    ? { Authorization: `Bearer ${_memToken}`, ...extra }
    : extra
}

const AuthContext = createContext(null)

/** Safely derive initials from a user object. */
export function getUserInitials(user) {
  if (!user) return '?'
  const name = user.display_name || user.name || user.email || user.username || ''
  if (!name) return '?'
  return name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map(p => p[0].toUpperCase())
    .join('')
}

export function AuthProvider({ children }) {
  const [user,        setUser]        = useState(null)
  const [authLoading, setAuthLoading] = useState(true)
  const [authError,   setAuthError]   = useState(null)

  // On mount: check session — works with JWT token (header) or Google OAuth cookie
  useEffect(() => {
    fetch(`${API_BASE}/auth/me`, {
      credentials: 'include',
      headers: authHeaders(),
    })
      .then(r => (r.ok ? r.json() : null))
      .then(u => setUser(u && typeof u === 'object' ? u : null))
      .catch(() => {
        // Backend not reachable — surface error but don't crash
        setAuthError('Could not reach the backend at localhost:8000. Is it running?')
        setUser(null)
      })
      .finally(() => setAuthLoading(false))
  }, [])

  /** Local JWT login: POST /auth/login (form-encoded username + password). */
  const loginLocal = useCallback(async (username, password) => {
    setAuthError(null)
    const body = new URLSearchParams({ username, password })
    const res = await fetch(`${API_BASE}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      credentials: 'include',
      body,
    })
    if (!res.ok) {
      const err = await res.json().catch(() => ({}))
      throw new Error(err.detail || 'Invalid username or password')
    }
    const data = await res.json()
    setToken(data.access_token)
    setUser({
      username:     data.username,
      role:         data.role,
      display_name: data.display_name || data.username,
      name:         data.display_name || data.username,
    })
    return data
  }, [])

  /** Google OAuth: redirect browser to consent screen. */
  const loginGoogle = useCallback(() => {
    // For Google OAuth redirect we always need an absolute URL
    const base = API_BASE || 'http://localhost:8000'
    window.location.href = `${base}/auth/login/google`
  }, [])

  const login = loginGoogle  // backward compat

  const logout = useCallback(async () => {
    clearToken()
    await fetch(`${API_BASE}/auth/logout`, {
      method: 'POST',
      credentials: 'include',
    }).catch(() => {})
    setUser(null)
  }, [])

  return (
    <AuthContext.Provider value={{
      user, authLoading, authError, setAuthError,
      loginLocal, loginGoogle, login, logout,
    }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>')
  return ctx
}

/**
 * <RequireAuth>
 * Renders children when the user is authenticated.
 * Shows a spinner while the session check is in-flight.
 * Shows <LoginPage> if the user is not authenticated.
 */
import LoginPage from './components/LoginPage.jsx'

export function RequireAuth({ children }) {
  const { user, authLoading } = useAuth()

  if (authLoading) {
    return (
      <div style={{
        minHeight: '100vh', display: 'flex', alignItems: 'center',
        justifyContent: 'center', background: '#0f1117',
      }}>
        <div style={{ textAlign: 'center', color: '#94a3b8' }}>
          <div style={{
            width: 40, height: 40,
            border: '3px solid #334155',
            borderTop: '3px solid #6366f1',
            borderRadius: '50%',
            animation: 'spin 0.8s linear infinite',
            margin: '0 auto 16px',
          }} />
          <p style={{ fontSize: 14 }}>Checking session…</p>
          <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
        </div>
      </div>
    )
  }

  if (!user) return <LoginPage />

  return children
}
