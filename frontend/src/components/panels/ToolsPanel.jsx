/**
 * ToolsPanel.jsx  (RBAC-gated)
 *
 * viewer   : read-only list, no toggles
 * operator : can toggle tools on/off
 * admin    : toggle + pending tool spawn approval
 */
import '../../styles/App.css'
import { useAuth } from '../../auth.jsx'
import { can } from '../../rbac.js'

export default function ToolsPanel({
  tools, pendingToolSpawns,
  handleToggleTool, handleApproveToolSpawn, handleDenyToolSpawn,
  onClose
}) {
  const { user } = useAuth()
  const canToggle  = can(user, 'approve_spawn')   // operator+
  const canApprove = can(user, 'approve_spawn')

  return (
    <div className="overlay-panel tools-panel">
      <div className="overlay-header">
        <span>🔧 Tools <span style={{ fontSize:11, color:'var(--tx-muted)', fontWeight:400 }}>({tools.length})</span></span>
        <button className="overlay-close" onClick={onClose}>✕</button>
      </div>

      {/* Pending tool spawn requests */}
      {pendingToolSpawns?.length > 0 && (
        <div style={{ padding:'10px 14px', borderBottom:'1px solid var(--bd-subtle)' }}>
          <div style={{ fontSize:10, fontWeight:700, textTransform:'uppercase', letterSpacing:'0.08em', color:'var(--tx-muted)', marginBottom:8 }}>
            ⏳ Pending Tool Requests
          </div>
          {pendingToolSpawns.map((s, i) => (
            <div key={i} style={{ display:'flex', alignItems:'center', gap:8, marginBottom:6, fontSize:12 }}>
              <span style={{ flex:1, color:'var(--tx-secondary)' }}>{s.name || s.tool_name || `Tool #${i+1}`}</span>
              {canApprove ? (
                <>
                  <button className="agent-action-btn" onClick={() => handleApproveToolSpawn(s)}>✅ Approve</button>
                  <button className="agent-action-btn danger" onClick={() => handleDenyToolSpawn(s)}>✕ Deny</button>
                </>
              ) : (
                <span style={{ fontSize:11, color:'var(--tx-muted)' }}>Operator+ required</span>
              )}
            </div>
          ))}
        </div>
      )}

      {!canToggle && (
        <div style={{ ...viewerBanner, margin:'10px 14px 0' }}>🔒 Tool toggles require Operator or Admin role.</div>
      )}

      {/* Tool list */}
      <div style={{ flex:1, overflowY:'auto', padding:'10px 14px' }}>
        {tools.length === 0 && <div className="empty-hint">No tools registered.</div>}
        {tools.map((t, i) => (
          <div key={t.name || i} style={{
            display:'flex', alignItems:'center', gap:10, padding:'8px 10px',
            borderRadius:7, marginBottom:6,
            background:'rgba(255,255,255,0.03)', border:'1px solid var(--bd-subtle)'
          }}>
            <span style={{ fontSize:18 }}>{t.icon || '🔧'}</span>
            <div style={{ flex:1, minWidth:0 }}>
              <div style={{ fontSize:13, fontWeight:600, color:'var(--tx-primary)' }}>{t.name}</div>
              {t.description && <div style={{ fontSize:11, color:'var(--tx-muted)', marginTop:2 }}>{t.description}</div>}
              {Array.isArray(t.tags) && t.tags.length > 0 && (
                <div className="tool-tags" style={{ marginTop:4 }}>
                  {t.tags.map(tg => <span key={tg} className="tool-tag">{tg}</span>)}
                </div>
              )}
            </div>
            {canToggle ? (
              <button
                className={`si-toggle ${t.enabled !== false ? 'on' : 'off'}`}
                onClick={() => handleToggleTool(t.name)}
                title={t.enabled !== false ? 'Disable tool' : 'Enable tool'}>
                {t.enabled !== false ? '🟢' : '🔴'}
              </button>
            ) : (
              <span style={{ fontSize:16 }}>{t.enabled !== false ? '🟢' : '🔴'}</span>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}

const viewerBanner = {
  padding: '8px 12px', borderRadius: 7,
  background: 'rgba(99,102,241,0.08)',
  border: '1px solid rgba(99,102,241,0.2)',
  color: '#a5b4fc', fontSize: 12,
}
