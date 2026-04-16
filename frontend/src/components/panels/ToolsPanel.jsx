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
 *   newToolForm, setNewToolForm        ← form state owned by App
 *   toolTab, setToolTab                ← tab state owned by App
 *   toolMdText, setToolMdText          ← MD editor state owned by App
 *   toolMdSaving                       ← save-in-progress flag
 *   handleCreateTool()                 ← reads newToolForm from App state
 *   handleUpdateTool()                 ← reads editingTool from App state
 *   handleDeleteTool(id)               ← tool.id
 *   handleToggleToolActive(tool)       ← full tool object
 *   handleOpenToolMd(tool)             ← loads MD into App state
 *   handleSaveToolMd()                 ← saves from App state (no args)
 *   handleToolSpawnDecision(req, bool) ← approve/deny
 *   onClose
 */
import '../../styles/App.css'
import { useAuth } from '../../auth.jsx'
import { can } from '../../rbac.js'

export default function ToolsPanel({
  tools, pendingToolSpawns,
  newToolForm, setNewToolForm,
  toolTab, setToolTab,
  toolMdText, setToolMdText,
  toolMdSaving,
  handleCreateTool, handleDeleteTool,
  handleToggleToolActive,
  handleOpenToolMd, handleSaveToolMd,
  handleToolSpawnDecision,
  onClose,
}) {
  const { user } = useAuth()
  const canAdd     = can(user, 'add_tool')
  const canEditMd  = can(user, 'edit_tool')
  const canDelete  = can(user, 'delete_tool')
  const canToggle  = can(user, 'add_tool')
  const canApprove = can(user, 'approve_spawn')

  const TABS = [
    { key: 'list', label: '🔧 Tools' },
    ...(canAdd ? [{ key: 'add', label: '➕ Add Tool' }] : []),
    ...(toolMdText !== undefined && toolTab === 'toolmd' ? [{ key: 'toolmd', label: '📄 Edit MD' }] : []),
  ]

  return (
    <div className="overlay-panel tools-panel">
      <div className="overlay-header">
        <span>🔧 Tools <span style={{ fontSize: 11, color: 'var(--tx-muted)', fontWeight: 400 }}>({tools.length})</span></span>
        <button className="overlay-close" onClick={onClose}>✕</button>
      </div>

      {/* Tabs */}
      <div className="agent-tabs">
        {TABS.map(t => (
          <button
            key={t.key}
            className={`agent-tab${toolTab === t.key ? ' active' : ''}`}
            onClick={() => setToolTab(t.key)}
          >{t.label}</button>
        ))}
      </div>

      {/* ── LIST tab ── */}
      {toolTab === 'list' && (
        <>
          {/* Pending tool spawn requests */}
          {pendingToolSpawns?.length > 0 && (
            <div style={{ padding: '10px 14px', borderBottom: '1px solid var(--bd-subtle)' }}>
              <div style={sectionTitle}>⏳ Pending Tool Requests</div>
              {pendingToolSpawns.map((s, i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6, fontSize: 12 }}>
                  <span style={{ flex: 1, color: 'var(--tx-secondary)' }}>{s.name || s.tool_name || `Tool #${i + 1}`}</span>
                  {canApprove ? (
                    <>
                      <button className="agent-action-btn" onClick={() => handleToolSpawnDecision(s, true)}>✅ Approve</button>
                      <button className="agent-action-btn danger" onClick={() => handleToolSpawnDecision(s, false)}>✕ Deny</button>
                    </>
                  ) : (
                    <span style={{ fontSize: 11, color: 'var(--tx-muted)' }}>Operator+ required</span>
                  )}
                </div>
              ))}
            </div>
          )}

          {!canToggle && (
            <div style={{ ...viewerBanner, margin: '10px 14px 0' }}>🔒 Tool management requires Operator or Admin role.</div>
          )}

          <div style={{ flex: 1, overflowY: 'auto', padding: '10px 14px' }}>
            {tools.length === 0 && <div className="empty-hint">No tools registered.</div>}
            {tools.map((t, i) => (
              <div key={t.id || t.name || i} style={toolCard}>
                <span style={{ fontSize: 18 }}>{t.icon || '🔧'}</span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--tx-primary)' }}>{t.display_name || t.name}</div>
                  {t.description && <div style={{ fontSize: 11, color: 'var(--tx-muted)', marginTop: 2 }}>{t.description}</div>}
                  {Array.isArray(t.tags) && t.tags.length > 0 && (
                    <div className="tool-tags" style={{ marginTop: 4 }}>
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
                    className={`si-toggle ${t.active !== false ? 'on' : 'off'}`}
                    onClick={() => handleToggleToolActive(t)}
                    title={t.active !== false ? 'Disable' : 'Enable'}
                  >
                    {t.active !== false ? '🟢' : '🔴'}
                  </button>
                ) : (
                  <span style={{ fontSize: 16 }}>{t.active !== false ? '🟢' : '🔴'}</span>
                )}

                {/* Delete — admin (delete_tool) */}
                {canDelete && (
                  <button className="del-btn" onClick={() => handleDeleteTool(t.id || t.name)} title="Delete tool">🗑</button>
                )}
              </div>
            ))}
          </div>
        </>
      )}

      {/* ── ADD TOOL tab ── */}
      {toolTab === 'add' && canAdd && (
        <div className="kb-body">
          <div style={sectionTitle}>➕ Register New Tool</div>
          <input
            className="topic-input"
            placeholder="Tool name *"
            value={newToolForm.name}
            onChange={e => setNewToolForm(f => ({ ...f, name: e.target.value }))}
            style={{ marginBottom: 6 }}
          />
          <input
            className="topic-input"
            placeholder="Display name"
            value={newToolForm.display_name}
            onChange={e => setNewToolForm(f => ({ ...f, display_name: e.target.value }))}
            style={{ marginBottom: 6 }}
          />
          <input
            className="topic-input"
            placeholder="Description"
            value={newToolForm.description}
            onChange={e => setNewToolForm(f => ({ ...f, description: e.target.value }))}
            style={{ marginBottom: 6 }}
          />
          <input
            className="topic-input"
            placeholder="Tags (comma-separated)"
            value={newToolForm.tags}
            onChange={e => setNewToolForm(f => ({ ...f, tags: e.target.value }))}
            style={{ marginBottom: 8 }}
          />
          <div style={{ fontSize: 11, color: 'var(--tx-muted)', marginBottom: 6 }}>Tool code (Python function body):</div>
          <textarea
            className="topic-input"
            placeholder="    return str(input_data)"
            value={newToolForm.code}
            onChange={e => setNewToolForm(f => ({ ...f, code: e.target.value }))}
            rows={5}
            style={{ marginBottom: 8, fontFamily: 'monospace', fontSize: 12 }}
          />
          <button
            className="run-btn"
            onClick={handleCreateTool}
            disabled={!newToolForm.name.trim()}
          >
            ➕ Add Tool
          </button>
        </div>
      )}

      {/* ── EDIT TOOL MD tab ── */}
      {toolTab === 'toolmd' && canEditMd && (
        <div className="kb-body">
          <div style={sectionTitle}>📄 Edit Tool MD</div>
          <textarea
            className="topic-input"
            value={toolMdText}
            onChange={e => setToolMdText(e.target.value)}
            rows={18}
            style={{ fontFamily: 'monospace', fontSize: 12, marginBottom: 8 }}
          />
          <button className="run-btn" onClick={handleSaveToolMd} disabled={toolMdSaving}>
            {toolMdSaving ? '⟳ Saving…' : '💾 Save MD'}
          </button>
        </div>
      )}
    </div>
  )
}

const sectionTitle = {
  fontSize: 10, fontWeight: 700, textTransform: 'uppercase',
  letterSpacing: '0.08em', color: 'var(--tx-muted)', marginBottom: 8,
}
const toolCard = {
  display: 'flex', alignItems: 'center', gap: 10, padding: '8px 10px',
  borderRadius: 7, marginBottom: 6,
  background: 'rgba(255,255,255,0.03)', border: '1px solid var(--bd-subtle)',
}
const viewerBanner = {
  padding: '8px 12px', borderRadius: 7,
  background: 'rgba(99,102,241,0.08)',
  border: '1px solid rgba(99,102,241,0.2)',
  color: '#a5b4fc', fontSize: 12,
}
