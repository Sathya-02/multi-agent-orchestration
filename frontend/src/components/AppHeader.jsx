import '../styles/App.css'
import { useState } from 'react'
import { useAuth } from '../auth.jsx'
import UserWidget  from './UserWidget.jsx'
import ProfilePage from './ProfilePage.jsx'

/**
 * AppHeader — Top navigation bar.
 *
 * Changes:
 *  - UserWidget dropdown now uses a React portal (no overflow clipping)
 *  - Removed "Connected / Connecting…" status text + status dot from header
 *    (connection status is still visible in the InfoBar below)
 */
export default function AppHeader({
  connected, currentModel, jobId,
  showDashboard,   setShowDashboard,
  showUploadPanel, setShowUploadPanel,
  showFsPanel,     setShowFsPanel,
  showKbPanel,     setShowKbPanel,
  showToolPanel,   setShowToolPanel,
  showAgentEditor, setShowAgentEditor,
  showModelPanel,  setShowModelPanel,
  showSettings,    setShowSettings,
  uploads, agents, tools, kbEntries,
  pendingSpawns, pendingToolSpawns,
  modelBadgeColor,
  fetchModels, fetchFsConfig, fetchKbEntries, fetchKbConfig,
  fetchTelegramConfig, fetchSiConfig, fetchBestPractices, fetchProposals,
}) {
  const { user } = useAuth()
  const [showProfile, setShowProfile] = useState(false)

  const closeAll = () => {
    setShowDashboard(false); setShowUploadPanel(false); setShowFsPanel(false)
    setShowKbPanel(false);   setShowToolPanel(false);   setShowAgentEditor(false)
    setShowModelPanel(false); setShowSettings(false)
  }

  return (
    <>
      <header className="header">
        <span className="header-title">⭡ Multi Agent Orchestration</span>

        <div className="header-right">

          {/* Spawn approval badges */}
          {pendingSpawns.length > 0 && (
            <button className="spawn-alert-btn" onClick={() => setShowAgentEditor(true)}>
              🤖 {pendingSpawns.length} spawn request{pendingSpawns.length > 1 ? 's' : ''}
            </button>
          )}
          {pendingToolSpawns.length > 0 && (
            <button
              className="spawn-alert-btn"
              style={{ background: 'rgba(16,185,129,.12)', border: '1px solid rgba(16,185,129,.35)', color: '#6ee7b7' }}
              onClick={() => setShowToolPanel(true)}
            >
              🔧 {pendingToolSpawns.length} tool request{pendingToolSpawns.length > 1 ? 's' : ''}
            </button>
          )}

          {/* Nav buttons */}
          <button className={`nav-btn ${showDashboard ? 'active' : ''}`}
            onClick={() => { closeAll(); setShowDashboard(v => !v) }}>
            📊 Dashboard
          </button>

          <button className={`nav-btn ${showUploadPanel ? 'active' : ''}`}
            onClick={() => { closeAll(); setShowUploadPanel(v => !v) }}>
            📎 Files {uploads.length > 0 && <span className="nav-badge">{uploads.length}</span>}
          </button>

          <button className={`nav-btn ${showFsPanel ? 'active' : ''}`}
            onClick={() => { closeAll(); setShowFsPanel(v => !v); if (!showFsPanel) fetchFsConfig() }}>
            📁 Filesystem
          </button>

          <button className={`nav-btn ${showKbPanel ? 'active' : ''}`}
            onClick={() => { closeAll(); setShowKbPanel(v => !v); if (!showKbPanel) { fetchKbEntries(); fetchKbConfig() } }}>
            📚 Knowledge Base <span className="nav-badge">{kbEntries.count || 0}</span>
          </button>

          <button className={`nav-btn ${showToolPanel ? 'active' : ''}`}
            onClick={() => { closeAll(); setShowToolPanel(v => !v) }}>
            🔧 Tools <span className="nav-badge">{tools.length}</span>
          </button>

          <button className={`nav-btn ${showAgentEditor ? 'active' : ''}`}
            onClick={() => { closeAll(); setShowAgentEditor(v => !v) }}>
            🤖 Agents <span className="nav-badge">{agents.length}</span>
          </button>

          <button className={`nav-btn ${showSettings ? 'active' : ''}`}
            onClick={() => {
              closeAll(); setShowSettings(v => !v)
              if (!showSettings) { fetchTelegramConfig(); fetchSiConfig(); fetchBestPractices(); fetchProposals() }
            }}>
            ⚙️ Settings
          </button>

          {/* Model badge */}
          <button
            className="model-badge"
            onClick={() => { closeAll(); setShowModelPanel(v => !v); fetchModels() }}
            style={{ '--badge-color': modelBadgeColor() }}
            title="Change model"
          >
            <span className="model-dot" />
            {currentModel}
            <span className="model-chevron">{showModelPanel ? '▲' : '▼'}</span>
          </button>

          {/* Separator */}
          <div style={{ width: 1, height: 16, background: 'rgba(99,102,241,0.3)', margin: '0 6px' }} />

          {/* User widget — avatar + role badge + dropdown (portal-rendered) */}
          {user && <UserWidget onOpenProfile={() => setShowProfile(true)} />}

          {/* Job ID badge (shown only while a job is running) */}
          {jobId && (
            <span style={{ marginLeft: 6, color: '#6366f1', fontSize: 11, whiteSpace: 'nowrap' }}>
              Job #{jobId}
            </span>
          )}

        </div>
      </header>

      {/* Profile page overlay */}
      {showProfile && <ProfilePage onClose={() => setShowProfile(false)} />}
    </>
  )
}
