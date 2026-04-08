/**
 * auth.jsx — Auth context + hooks for Google OAuth session
 *
 * Provides:
 *   <AuthProvider>   — wraps the app, loads /auth/me on mount
 *   useAuth()        — returns { user, authLoading, authError, login, logout }
 */
import { createContext, useContext, useEffect, useState } from 'react'

const API_URL =
  typeof __API_URL__ !== 'undefined'
    ? __API_URL__
    : (import.meta.env.VITE_API_URL || 'http://localhost:8000')

const AuthContext = createContext(null)

/** Safely derive initials from a user object — never throws. */
export function getUserInitials(user) {
  if (!user) return '?'
  const name = user.name || user.email || ''
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

  useEffect(() => {
    fetch(`${API_URL}/auth/me`, { credentials: 'include' })
      .then(r => (r.ok ? r.json() : null))
      .then(u => {
        // u may be null (unauthenticated) or an object — both are valid
        setUser(u && typeof u === 'object' ? u : null)
      })
      .catch(() => {
        // Backend unreachable — treat as unauthenticated, don't crash
        setAuthError('Could not reach auth endpoint')
        setUser(null)
      })
      .finally(() => setAuthLoading(false))
  }, [])

  const login = () => {
    window.location.href = `${API_URL}/auth/login/google`
  }

  const logout = async () => {
    await fetch(`${API_URL}/auth/logout`, {
      method: 'POST',
      credentials: 'include',
    })
    setUser(null)
  }

  return (
    <AuthContext.Provider value={{ user, authLoading, authError, login, logout }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>')
  return ctx
}
