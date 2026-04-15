/**
 * auth.jsx — Auth context + hooks
 *
 * Supports two login modes:
 *   1. Local JWT  — POST /auth/login (username + password) → stores token in memory
 *   2. Google OAuth — redirect to /auth/login/google (existing flow)
 *
 * Provides:
 *   <AuthProvider>    — wraps the app, checks session on mount
 *   <RequireAuth>     — renders children only when logged in, else shows <LoginPage>
 *   useAuth()         — { user, authLoading, authError, loginLocal, loginGoogle, logout }
 */
import { createContext, useContext, useEffect, useState, useCallback } from 'react'

const API_URL =
  typeof __API_URL__ !== 'undefined'
    ? __API_URL__
    : (import.meta.env.VITE_API_URL || 'http://localhost:8000')

// Token stored in memory only (no localStorage — sandboxed iframe safe)
let _memToken = null

export function getToken() { return _memToken }
export function setToken(t) { _memToken = t }
export function clearToken() { _memToken = null }

/** Attach Authorization header when a local JWT token is available. */
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

  // On mount: check /auth/me with either JWT token or session cookie
  useEffect(() => {
    fetch(`${API_URL}/auth/me`, {
      credentials: 'include',
      headers: authHeaders(),
    })
      .then(r => (r.ok ? r.json() : null))
      .then(u => setUser(u && typeof u === 'object' ? u : null))
      .catch(() => {
        setAuthError('Could not reach auth endpoint')
        setUser(null)
      })
      .finally(() => setAuthLoading(false))
  }, [])

  /** Local login: POST /auth/login with username + password form data. */
  const loginLocal = useCallback(async (username, password) => {
    setAuthError(null)
    const body = new URLSearchParams({ username, password })
    const res = await fetch(`${API_URL}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body,
    })
    if (!res.ok) {
      const err = await res.json().catch(() => ({}))
      throw new Error(err.detail || 'Invalid username or password')
    }
    const data = await res.json()
    setToken(data.access_token)
    setUser({
      username: data.username,
      role: data.role,
      display_name: data.display_name || data.username,
      name: data.display_name || data.username,
    })
    return data
  }, [])

  /** Google OAuth: redirect browser to consent screen. */
  const loginGoogle = useCallback(() => {
    window.location.href = `${API_URL}/auth/login/google`
  }, [])

  // Keep backward compat: `login` still triggers Google OAuth
  const login = loginGoogle

  const logout = useCallback(async () => {
    clearToken()
    await fetch(`${API_URL}/auth/logout`, {
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
 * Shows a loading spinner while checking session.
 * Renders <LoginPage> if not authenticated.
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
            width: 40, height: 40, border: '3px solid #334155',
            borderTop: '3px solid #6366f1', borderRadius: '50%',
            animation: 'spin 0.8s linear infinite', margin: '0 auto 16px',
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
