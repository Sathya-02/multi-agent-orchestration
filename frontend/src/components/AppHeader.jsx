import '../styles/App.css'
import { useState } from 'react'
import { useAuth } from '../auth.jsx'
import { can } from '../rbac.js'
import UserWidget         from './UserWidget.jsx'
import ProfilePage        from './ProfilePage.jsx'
import UserManagementPanel from './panels/UserManagementPanel.jsx'

/**
 * AppHeader — role-gated nav buttons.
 * Admin-only: Settings, Model picker, User Management button in header.
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
  const [showProfile,  setShowProfile]  = useState(false)
  const [showUsers,    setShowUsers]    = useState(false)

  const canViewDashboard = can(user, 'view_dashboard')
  const canViewFiles     = can(user, 'view_files')
  const canViewFs        = can(user, 'view_filesystem')
  const canViewKb        = can(user, 'view_kb')
  const canViewTools     = can(user, 'view_tools')
  const canViewAgents    = can(user, 'view_agents')
  const canChangeModel   = can(user, 'change_model')
  const canEditSettings  = can(user, 'edit_settings')
  const canApproveSpawn  = can(user, 'approve_spawn')
  const canManageUsers   = can(user, 'manage_users')

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

          {/* Spawn approval alerts — operator+ */}
          {canApproveSpawn && pendingSpawns.length > 0 && (
            <button className="spawn-alert-btn" onClick={() => setShowAgentEditor(true)}>
              🤖 {pendingSpawns.length} spawn{pendingSpawns.length > 1 ? 's' : ''}
            </button>
          )}
          {canApproveSpawn && pendingToolSpawns.length > 0 && (
            <button className="spawn-alert-btn"
              style={{ background:'rgba(16,185,129,.12)', border:'1px solid rgba(16,185,129,.35)', color:'#6ee7b7' }}
              onClick={() => setShowToolPanel(true)}>
              🔧 {pendingToolSpawns.length} tool{pendingToolSpawns.length > 1 ? 's' : ''}
            </button>
          )}

          {canViewDashboard && (
            <button className={`nav-btn ${showDashboard ? 'active' : ''}`}
              onClick={() => { closeAll(); setShowDashboard(v => !v) }}>📊 Dashboard</button>
          )}
          {canViewFiles && (
            <button className={`nav-btn ${showUploadPanel ? 'active' : ''}`}
              onClick={() => { closeAll(); setShowUploadPanel(v => !v) }}>
              📎 Files {uploads.length > 0 && <span className="nav-badge">{uploads.length}</span>}
            </button>
          )}
          {canViewFs && (
            <button className={`nav-btn ${showFsPanel ? 'active' : ''}`}
              onClick={() => { closeAll(); setShowFsPanel(v => !v); if (!showFsPanel) fetchFsConfig() }}>📁 Filesystem</button>
          )}
          {canViewKb && (
            <button className={`nav-btn ${showKbPanel ? 'active' : ''}`}
              onClick={() => { closeAll(); setShowKbPanel(v => !v); if (!showKbPanel) { fetchKbEntries(); fetchKbConfig() } }}>
              📚 KB <span className="nav-badge">{kbEntries.count || 0}</span>
            </button>
          )}
          {canViewTools && (
            <button className={`nav-btn ${showToolPanel ? 'active' : ''}`}
              onClick={() => { closeAll(); setShowToolPanel(v => !v) }}>
              🔧 Tools <span className="nav-badge">{tools.length}</span>
            </button>
          )}
          {canViewAgents && (
            <button className={`nav-btn ${showAgentEditor ? 'active' : ''}`}
              onClick={() => { closeAll(); setShowAgentEditor(v => !v) }}>
              🤖 Agents <span className="nav-badge">{agents.length}</span>
            </button>
          )}
          {canEditSettings && (
            <button className={`nav-btn ${showSettings ? 'active' : ''}`}
              onClick={() => {
                closeAll(); setShowSettings(v => !v)
                if (!showSettings) { fetchTelegramConfig(); fetchSiConfig(); fetchBestPractices(); fetchProposals() }
              }}>⚙️ Settings</button>
          )}
          {canChangeModel && (
            <button className="model-badge"
              onClick={() => { closeAll(); setShowModelPanel(v => !v); fetchModels() }}
              style={{ '--badge-color': modelBadgeColor() }} title="Change model">
              <span className="model-dot" />
              {currentModel}
              <span className="model-chevron">{showModelPanel ? '▲' : '▼'}</span>
            </button>
          )}

          {/* User Management — admin only */}
          {canManageUsers && (
            <button
              className="nav-btn"
              style={{ color: showUsers ? 'var(--accent)' : undefined }}
              onClick={() => { closeAll(); setShowUsers(v => !v) }}
              title="User Management">
              👥 Users
            </button>
          )}

          <div style={{ width:1, height:16, background:'rgba(99,102,241,0.3)', margin:'0 6px' }} />

          {user && <UserWidget onOpenProfile={() => setShowProfile(true)} />}

          {jobId && (
            <span style={{ marginLeft:6, color:'#6366f1', fontSize:11, whiteSpace:'nowrap' }}>Job #{jobId}</span>
          )}
        </div>
      </header>

      {showProfile && <ProfilePage onClose={() => setShowProfile(false)} />}
      {showUsers   && <UserManagementPanel onClose={() => setShowUsers(false)} />}
    </>
  )
}
