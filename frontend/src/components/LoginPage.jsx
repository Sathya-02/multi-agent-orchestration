/**
 * LoginPage.jsx — Local username/password login form
 *
 * Shown automatically by <RequireAuth> when the user is not logged in.
 * Calls useAuth().loginLocal(username, password) which POSTs to /auth/login.
 *
 * Also shows a "Sign in with Google" button if Google OAuth is configured.
 */
import { useState } from 'react'
import { useAuth, getUserInitials } from '../auth.jsx'

export default function LoginPage() {
  const { loginLocal, loginGoogle, authError, setAuthError } = useAuth()
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [loading,  setLoading]  = useState(false)
  const [error,    setError]    = useState('')

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!username.trim() || !password) {
      setError('Please enter your username and password.')
      return
    }
    setError('')
    setLoading(true)
    try {
      await loginLocal(username.trim(), password)
      // AuthProvider sets user → RequireAuth re-renders with children
    } catch (err) {
      setError(err.message || 'Login failed. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={styles.root}>
      <div style={styles.card}>
        {/* Logo / Brand */}
        <div style={styles.logoWrap}>
          <svg width="40" height="40" viewBox="0 0 40 40" fill="none" aria-label="MAO Logo">
            <rect width="40" height="40" rx="10" fill="#6366f1"/>
            <circle cx="20" cy="14" r="5" fill="#fff"/>
            <circle cx="10" cy="28" r="4" fill="#a5b4fc"/>
            <circle cx="30" cy="28" r="4" fill="#a5b4fc"/>
            <line x1="20" y1="19" x2="10" y2="28" stroke="#fff" strokeWidth="1.5"/>
            <line x1="20" y1="19" x2="30" y2="28" stroke="#fff" strokeWidth="1.5"/>
          </svg>
        </div>

        <h1 style={styles.title}>Multi-Agent Orchestration</h1>
        <p style={styles.subtitle}>Sign in to your workspace</p>

        {/* Error banner */}
        {(error || authError) && (
          <div style={styles.errorBanner} role="alert">
            <span style={{ marginRight: 8 }}>⚠️</span>
            {error || authError}
          </div>
        )}

        {/* Login form */}
        <form onSubmit={handleSubmit} style={styles.form} noValidate>
          <label style={styles.label} htmlFor="mao-username">Username</label>
          <input
            id="mao-username"
            type="text"
            autoComplete="username"
            autoFocus
            placeholder="e.g. admin"
            value={username}
            onChange={e => { setUsername(e.target.value); setError('') }}
            style={styles.input}
            disabled={loading}
            aria-label="Username"
          />

          <label style={styles.label} htmlFor="mao-password">Password</label>
          <input
            id="mao-password"
            type="password"
            autoComplete="current-password"
            placeholder="••••••••"
            value={password}
            onChange={e => { setPassword(e.target.value); setError('') }}
            style={styles.input}
            disabled={loading}
            aria-label="Password"
          />

          <button
            type="submit"
            style={loading ? { ...styles.btn, ...styles.btnDisabled } : styles.btn}
            disabled={loading}
          >
            {loading ? 'Signing in…' : 'Sign In'}
          </button>
        </form>

        {/* Divider */}
        <div style={styles.divider}>
          <span style={styles.dividerLine} />
          <span style={styles.dividerText}>or</span>
          <span style={styles.dividerLine} />
        </div>

        {/* Google OAuth button */}
        <button
          type="button"
          onClick={loginGoogle}
          style={styles.googleBtn}
          disabled={loading}
        >
          <svg width="18" height="18" viewBox="0 0 18 18" style={{ marginRight: 8 }}>
            <path d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844c-.209 1.125-.843 2.078-1.796 2.717v2.258h2.908c1.702-1.567 2.684-3.874 2.684-6.615z" fill="#4285F4"/>
            <path d="M9 18c2.43 0 4.467-.806 5.956-2.184l-2.908-2.258c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 0 0 9 18z" fill="#34A853"/>
            <path d="M3.964 10.707A5.41 5.41 0 0 1 3.682 9c0-.593.102-1.17.282-1.707V4.961H.957A8.996 8.996 0 0 0 0 9c0 1.452.348 2.827.957 4.039l3.007-2.332z" fill="#FBBC05"/>
            <path d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 0 0 .957 4.96l3.007 2.332C4.672 5.163 6.656 3.58 9 3.58z" fill="#EA4335"/>
          </svg>
          Sign in with Google
        </button>

        {/* Role hint */}
        <p style={styles.hint}>
          Default accounts: <code style={styles.code}>admin</code> /
          <code style={styles.code}> operator</code> /
          <code style={styles.code}> viewer</code>
          <br/>
          <span style={{ color: '#f87171' }}>Change passwords after first login.</span>
        </p>
      </div>
    </div>
  )
}

// ── Styles (inline — no external CSS file needed) ─────────────────────────────────
const styles = {
  root: {
    minHeight: '100vh',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    background: 'linear-gradient(135deg, #0f1117 0%, #1a1f2e 100%)',
    padding: '1.5rem',
    fontFamily: "'Inter', 'Segoe UI', sans-serif",
  },
  card: {
    width: '100%',
    maxWidth: 400,
    background: '#1e2130',
    borderRadius: 16,
    padding: '2.5rem 2rem',
    boxShadow: '0 24px 48px rgba(0,0,0,0.5)',
    border: '1px solid rgba(255,255,255,0.06)',
  },
  logoWrap: {
    display: 'flex',
    justifyContent: 'center',
    marginBottom: '1.25rem',
  },
  title: {
    color: '#f1f5f9',
    fontSize: 20,
    fontWeight: 700,
    textAlign: 'center',
    margin: '0 0 6px',
    letterSpacing: '-0.3px',
  },
  subtitle: {
    color: '#64748b',
    fontSize: 14,
    textAlign: 'center',
    margin: '0 0 1.5rem',
  },
  errorBanner: {
    background: 'rgba(239,68,68,0.12)',
    border: '1px solid rgba(239,68,68,0.3)',
    color: '#fca5a5',
    borderRadius: 8,
    padding: '10px 14px',
    fontSize: 13,
    marginBottom: '1.25rem',
    display: 'flex',
    alignItems: 'center',
  },
  form: {
    display: 'flex',
    flexDirection: 'column',
    gap: 0,
  },
  label: {
    color: '#94a3b8',
    fontSize: 13,
    fontWeight: 500,
    marginBottom: 6,
    marginTop: 14,
    display: 'block',
  },
  input: {
    width: '100%',
    padding: '10px 14px',
    background: '#0f1117',
    border: '1px solid #334155',
    borderRadius: 8,
    color: '#e2e8f0',
    fontSize: 14,
    outline: 'none',
    transition: 'border-color 0.15s',
    boxSizing: 'border-box',
  },
  btn: {
    marginTop: 20,
    width: '100%',
    padding: '11px 0',
    background: '#6366f1',
    color: '#fff',
    border: 'none',
    borderRadius: 8,
    fontSize: 15,
    fontWeight: 600,
    cursor: 'pointer',
    transition: 'background 0.15s',
  },
  btnDisabled: {
    background: '#3730a3',
    cursor: 'not-allowed',
    opacity: 0.7,
  },
  divider: {
    display: 'flex',
    alignItems: 'center',
    margin: '1.5rem 0 1rem',
    gap: 10,
  },
  dividerLine: {
    flex: 1,
    height: 1,
    background: '#1e293b',
  },
  dividerText: {
    color: '#475569',
    fontSize: 12,
    textTransform: 'uppercase',
    letterSpacing: '0.05em',
  },
  googleBtn: {
    width: '100%',
    padding: '10px 0',
    background: '#fff',
    color: '#1e293b',
    border: '1px solid #e2e8f0',
    borderRadius: 8,
    fontSize: 14,
    fontWeight: 500,
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    transition: 'background 0.15s',
  },
  hint: {
    color: '#475569',
    fontSize: 12,
    textAlign: 'center',
    marginTop: '1.5rem',
    lineHeight: 1.7,
  },
  code: {
    background: '#0f1117',
    color: '#a5b4fc',
    padding: '1px 5px',
    borderRadius: 4,
    fontSize: 11,
    fontFamily: 'monospace',
  },
}
