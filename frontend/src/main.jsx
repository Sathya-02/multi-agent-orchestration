import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'
import { AuthProvider } from './auth.jsx'
import './styles/App.css'
import './styles/auth.css'

/**
 * ErrorBoundary — catches any render crash and shows a friendly error
 * instead of a blank screen. Open DevTools console for full stack trace.
 */
class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props)
    this.state = { hasError: false, error: null }
  }
  static getDerivedStateFromError(error) {
    return { hasError: true, error }
  }
  componentDidCatch(error, info) {
    console.error('[ErrorBoundary]', error, info.componentStack)
  }
  render() {
    if (this.state.hasError) {
      return (
        <div style={{
          minHeight: '100vh', display: 'flex', flexDirection: 'column',
          alignItems: 'center', justifyContent: 'center',
          background: '#0f1117', color: '#e2e8f0', fontFamily: 'monospace',
          padding: '2rem', textAlign: 'center'
        }}>
          <div style={{ fontSize: 48, marginBottom: 16 }}>⚠️</div>
          <h2 style={{ color: '#f87171', marginBottom: 8 }}>Something went wrong</h2>
          <p style={{ color: '#94a3b8', marginBottom: 24, maxWidth: 480 }}>
            The app hit an unexpected error. Check the browser console (F12) for the full stack trace.
          </p>
          <pre style={{
            background: '#1e293b', padding: '1rem', borderRadius: 8,
            fontSize: 12, color: '#fca5a5', maxWidth: 640,
            overflowX: 'auto', textAlign: 'left', marginBottom: 24
          }}>
            {String(this.state.error)}
          </pre>
          <button
            onClick={() => window.location.reload()}
            style={{
              padding: '10px 24px', background: '#6366f1', color: '#fff',
              border: 'none', borderRadius: 8, cursor: 'pointer', fontSize: 14
            }}>
            🔄 Reload App
          </button>
        </div>
      )
    }
    return this.props.children
  }
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <ErrorBoundary>
      <AuthProvider>
        <App />
      </AuthProvider>
    </ErrorBoundary>
  </React.StrictMode>,
)
