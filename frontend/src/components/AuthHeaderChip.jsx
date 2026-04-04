/**
 * AuthHeaderChip.jsx — Shows logged-in user email + logout button in the header.
 * Renders nothing while auth is loading.
 */
import { useAuth } from '../auth'

export default function AuthHeaderChip() {
  const { user, authLoading, login, logout } = useAuth()

  if (authLoading) return null

  if (!user) {
    return (
      <button className="nav-btn" onClick={login} title="Sign in with Google">
        Sign in
      </button>
    )
  }

  const initials = (user.name || user.email)
    .split(/[\s@]/)[0]
    .slice(0, 2)
    .toUpperCase()

  return (
    <div className="auth-chip">
      <div className="auth-chip-avatar" title={user.email}>{initials}</div>
      <span className="auth-chip-email">{user.email}</span>
      {user.is_admin && <span className="auth-chip-admin">admin</span>}
      <button className="auth-logout-btn" onClick={logout}>Logout</button>
    </div>
  )
}
