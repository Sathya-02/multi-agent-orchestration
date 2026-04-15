/**
 * auth.jsx — Auth context + hooks
 *
 * Token persistence strategy:
 *   - sessionStorage  (default)  — survives page reload, cleared when tab closes
 *   - localStorage   (remember me) — survives browser restart, cleared on logout
 *
 * On mount, AuthProvider re-hydrates the in-memory token from storage BEFORE
 * calling /auth/me, so the Bearer header is always present after a reload.
 */
import { createContext, useContext, useEffect, useState, useCallback } from 'react'

const API_BASE =
  (typeof __API_URL__ !== 'undefined' && __API_URL__)
    ? __API_URL__
    : (import.meta.env.VITE_API_URL || '')

const TOKEN_KEY = 'mao_token'
const REMEMBER_KEY = 'mao_remember'

// ─── In-memory token (module-level, also backed by storage) ──────────────────

let _memToken = null

/** Read token from storage → memory on app start. Call once before any fetch. */
function _hydrateToken() {
  try {
    const remember = localStorage.getItem(REMEMBER_KEY) === 'true'
    const stored = remember
      ? localStorage.getItem(TOKEN_KEY)
      : sessionStorage.getItem(TOKEN_KEY)
    if (stored) _memToken = stored
  } catch {}
}

export function getToken() { return _memToken }

export function setToken(token, remember = false) {
  _memToken = token
  try {
    if (remember) {
      localStorage.setItem(REMEMBER_KEY, 'true')
      localStorage.setItem(TOKEN_KEY, token)
      sessionStorage.removeItem(TOKEN_KEY)
    } else {
      localStorage.removeItem(REMEMBER_KEY)
      localStorage.removeItem(TOKEN_KEY)
      sessionStorage.setItem(TOKEN_KEY, token)
    }
  } catch {}
}

export function clearToken() {
  _memToken = null
  try {
    sessionStorage.removeItem(TOKEN_KEY)
    localStorage.removeItem(TOKEN_KEY)
    localStorage.removeItem(REMEMBER_KEY)
  } catch {}
}

export function authHeaders(extra = {}) {
  return _memToken
    ? { Authorization: `Bearer ${_memToken}`, ...extra }
    : extra
}

const AuthContext = createContext(null)

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

  // Hydrate token from storage FIRST, then validate with backend
  useEffect(() => {
    _hydrateToken()   // ← re-populate _memToken before the fetch below

    fetch(`${API_BASE}/auth/me`, {
      credentials: 'include',
      headers: authHeaders(),   // now carries the token even after reload
    })
      .then(r => (r.ok ? r.json() : null))
      .then(u => {
        if (u && typeof u === 'object' && u.username) {
          setUser(u)
        } else {
          // Token present but rejected (expired / revoked) — clear storage
          clearToken()
          setUser(null)
        }
      })
      .catch(() => {
        setAuthError('Could not reach the backend at localhost:8000. Is it running?')
        setUser(null)
      })
      .finally(() => setAuthLoading(false))
  }, [])

  /**
   * Local JWT login.
   * @param {string}  username
   * @param {string}  password
   * @param {boolean} remember  — persist across browser restarts via localStorage
   */
  const loginLocal = useCallback(async (username, password, remember = false) => {
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
    setToken(data.access_token, remember)   // persist based on remember flag
    setUser({
      username:     data.username,
      role:         data.role,
      display_name: data.display_name || data.username,
      name:         data.display_name || data.username,
    })
    return data
  }, [])

  const loginGoogle = useCallback(() => {
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
