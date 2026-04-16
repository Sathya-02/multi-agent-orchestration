/**
 * ToolsPanel.jsx
 *
 * RBAC:
 *   viewer   : read-only list
 *   operator : toggle on/off, add tool, edit tool MD, delete tool, approve spawns
 *   admin    : all of the above
 *
 * Tabs:
 *   List     → all roles
 *   Add Tool → operator+
 *   Edit MD  → operator+ (edit tool markdown/config file)
 *
 * Prop contract (must match App.jsx):
 *   tools, pendingToolSpawns
 *   handleToggleToolActive(tool)        ← full tool object
 *   handleToolSpawnDecision(req, bool)  ← approve/deny
 *   handleCreateTool(formObj)
 *   handleDeleteTool(id)                ← tool.id
 *   handleOpenToolMd(tool)              ← loads MD into App state
 *   handleSaveToolMd()                  ← saves from App state (no args)
 *   onClose
 */
import { useState } from 'react'
import '../../styles/App.css'
import { useAuth } from '../../auth.jsx'
import { can } from '../../rbac.js'

export default function ToolsPanel({
  tools, pendingToolSpawns,
  handleToggleToolActive,
  handleToolSpawnDecision,
  handleCreateTool, handleDeleteTool,
  handleOpenToolMd, handleSaveToolMd,
  onClose
}) {
  const { user } = useAuth()
  const canAdd     = can(user, 'add_tool')
  const canEditMd  = can(user, 'edit_tool')
  const canDelete  = can(user, 'delete_tool')
  const canToggle  = can(user, 'add_tool')
  const canApprove = can(user, 'approve_spawn')

  const TABS = [
    { key: 'list',   label: '🔧 Tools' },
    ...(canAdd    ? [{ key: 'add',    label: '➕ Add Tool' }] : []),
  ]

  const [tab, setTab] = useState('list')

  // Add tool form state
  const [newName,    setNewName]    = useState('')
  const [newDesc,    setNewDesc]    = useState('')
  const [newIcon,    setNewIcon]    = useState('')
  const [newTags,    setNewTags]    = useState('')
  const [newEnabled, setNewEnabled] = useState(true)

  const onAddTool = () => {
    if (!newName.trim() || !canAdd) return
    handleCreateTool({
      name:        newName.trim(),
      description: newDesc.trim(),
      icon:        newIcon.trim() || '🔧',
      tags:        newTags.split(',').map(t => t.trim()).filter(Boolean),
      enabled:     newEnabled,
    })
    setNewName(''); setNewDesc(''); setNewIcon(''); setNewTags('')
    setTab('list')
  }

  return (
    <div className="overlay-panel tools-panel">
      <div className="overlay-header">
        <span>🔧 Tools <span style={{ fontSize:11, color:'var(--tx-muted)', fontWeight:400 }}>({tools.length})</span></span>
        <button className="overlay-close" onClick={onClose}>✕</button>
      </div>

      {/* Tabs */}
      <div className="agent-tabs">
        {TABS.map(t => (
          <button key={t.key} className={`agent-tab${tab === t.key ? ' active' : ''}`}
            onClick={() => setTab(t.key)}>{t.label}</button>
        ))}
      </div>

      {/* ── LIST tab ── */}
      {tab === 'list' && (
        <>
          {/* Pending tool spawn requests */}
          {pendingToolSpawns?.length > 0 && (
            <div style={{ padding:'10px 14px', borderBottom:'1px solid var(--bd-subtle)' }}>
              <div style={sectionTitle}>⏳ Pending Tool Requests</div>
              {pendingToolSpawns.map((s, i) => (
                <div key={i} style={{ display:'flex', alignItems:'center', gap:8, marginBottom:6, fontSize:12 }}>
                  <span style={{ flex:1, color:'var(--tx-secondary)' }}>{s.name || s.tool_name || `Tool #${i+1}`}</span>
                  {canApprove ? (
                    <>
                      <button className="agent-action-btn" onClick={() => handleToolSpawnDecision(s, true)}>✅ Approve</button>
                      <button className="agent-action-btn danger" onClick={() => handleToolSpawnDecision(s, false)}>✕ Deny</button>
                    </>
                  ) : (
                    <span style={{ fontSize:11, color:'var(--tx-muted)' }}>Operator+ required</span>
                  )}
                </div>
              ))}
            </div>
          )}

          {!canToggle && (
            <div style={{ ...viewerBanner, margin:'10px 14px 0' }}>🔒 Tool management requires Operator or Admin role.</div>
          )}

          <div style={{ flex:1, overflowY:'auto', padding:'10px 14px' }}>
            {tools.length === 0 && <div className="empty-hint">No tools registered.</div>}
            {tools.map((t, i) => (
              <div key={t.id || t.name || i} style={toolCard}>
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
                {/* Edit MD button — operator+ */}
                {canEditMd && handleOpenToolMd && (
                  <button className="agent-action-btn" onClick={() => handleOpenToolMd(t)} title="Edit tool MD">✏️</button>
                )}
                {/* Toggle enable/disable — operator+ */}
                {canToggle ? (
                  <button
                    className={`si-toggle ${t.enabled !== false ? 'on' : 'off'}`}
                    onClick={() => handleToggleToolActive(t)}
                    title={t.enabled !== false ? 'Disable' : 'Enable'}>
                    {t.enabled !== false ? '🟢' : '🔴'}
                  </button>
                ) : (
                  <span style={{ fontSize:16 }}>{t.enabled !== false ? '🟢' : '🔴'}</span>
                )}
                {/* Delete — operator+ */}
                {canDelete && (
                  <button className="del-btn" onClick={() => handleDeleteTool(t.id || t.name)} title="Delete tool">🗑</button>
                )}
              </div>
            ))}
          </div>
        </>
      )}

      {/* ── ADD TOOL tab ── */}
      {tab === 'add' && canAdd && (
        <div className="kb-body">
          <div style={sectionTitle}>➕ Register New Tool</div>
          <input className="topic-input" placeholder="Tool name *" value={newName}
            onChange={e => setNewName(e.target.value)} style={{ marginBottom:6 }} />
          <input className="topic-input" placeholder="Description" value={newDesc}
            onChange={e => setNewDesc(e.target.value)} style={{ marginBottom:6 }} />
          <input className="topic-input" placeholder="Icon emoji (default 🔧)" value={newIcon}
            onChange={e => setNewIcon(e.target.value)} style={{ marginBottom:6 }} />
          <input className="topic-input" placeholder="Tags (comma-separated)" value={newTags}
            onChange={e => setNewTags(e.target.value)} style={{ marginBottom:8 }} />
          <div className="si-row" style={{ marginBottom:10 }}>
            <span className="si-label">Enabled on creation</span>
            <button className={`si-toggle ${newEnabled ? 'on' : 'off'}`}
              onClick={() => setNewEnabled(v => !v)}>
              {newEnabled ? '🟢 Yes' : '🔴 No'}
            </button>
          </div>
          <button className="run-btn" onClick={onAddTool} disabled={!newName.trim()}>
            ➕ Add Tool
          </button>
        </div>
      )}
    </div>
  )
}

const sectionTitle = {
  fontSize:10, fontWeight:700, textTransform:'uppercase',
  letterSpacing:'0.08em', color:'var(--tx-muted)', marginBottom:8
}
const toolCard = {
  display:'flex', alignItems:'center', gap:10, padding:'8px 10px',
  borderRadius:7, marginBottom:6,
  background:'rgba(255,255,255,0.03)', border:'1px solid var(--bd-subtle)'
}
const viewerBanner = {
  padding:'8px 12px', borderRadius:7,
  background:'rgba(99,102,241,0.08)',
  border:'1px solid rgba(99,102,241,0.2)',
  color:'#a5b4fc', fontSize:12
}
