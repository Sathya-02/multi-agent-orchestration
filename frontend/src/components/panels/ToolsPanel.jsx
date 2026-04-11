import '../../styles/App.css'

export default function ToolsPanel({
  tools, toolTab, setToolTab,
  editingTool, setEditingTool, newToolForm, setNewToolForm,
  toolMdText, setToolMdText, toolMdSaving,
  pendingToolSpawns,
  handleCreateTool, handleUpdateTool, handleDeleteTool,
  handleToggleToolActive, handleOpenToolMd, handleSaveToolMd,
  handleToolSpawnDecision,
  onClose
}) {
  const FIELD = (label, key, ph, multiline) => (
    <div className="form-row" key={key}>
      <label className="form-label">{label}</label>
      {multiline
        ? <textarea className="topic-input" style={{ minHeight: 80 }} value={editingTool ? editingTool[key] ?? '' : newToolForm[key] ?? ''} onChange={e => editingTool ? setEditingTool({...editingTool,[key]:e.target.value}) : setNewToolForm({...newToolForm,[key]:e.target.value})} placeholder={ph} />
        : <input className="topic-input" value={editingTool ? editingTool[key] ?? '' : newToolForm[key] ?? ''} onChange={e => editingTool ? setEditingTool({...editingTool,[key]:e.target.value}) : setNewToolForm({...newToolForm,[key]:e.target.value})} placeholder={ph} />
      }
    </div>
  )

  return (
    <div className="overlay-panel tools-panel">
      <div className="overlay-header">
        <span>🔧 Custom Tools</span>
        <button className="overlay-close" onClick={onClose}>✕</button>
      </div>

      <div className="agent-tabs">
        {['list','create','docs','spawns'].map(t => (
          <button key={t} className={`agent-tab${toolTab===t?' active':''}`} onClick={() => setToolTab(t)}>
            {{ list:'📋 Tools', create:'➕ Create', docs:'📄 Docs', spawns:`🔔 Spawns${pendingToolSpawns.length ? ` (${pendingToolSpawns.length})` : ''}` }[t]}
          </button>
        ))}
      </div>

      {toolTab === 'list' && (
        <div className="agent-list">
          {tools.length === 0 && <div className="empty-hint">No custom tools yet.</div>}
          {tools.map(t => (
            <div key={t.id} className={`agent-card-edit${t.active === false ? ' inactive' : ''}`}>
              <span className="agent-icon">🔧</span>
              <div className="agent-info">
                <div className="agent-name">{t.display_name || t.name}</div>
                <div className="agent-role">{t.description?.slice(0,60)}</div>
              </div>
              <div className="agent-actions">
                <button className="icon-btn" title="Edit" onClick={() => { setEditingTool({...t}); setToolTab('create') }}>✏️</button>
                <button className="icon-btn" title={t.active === false ? 'Activate' : 'Deactivate'} onClick={() => handleToggleToolActive(t)}>{t.active === false ? '▶' : '⏸'}</button>
                <button className="icon-btn" title="Docs" onClick={() => handleOpenToolMd(t)}>📄</button>
                <button className="icon-btn del" title="Delete" onClick={() => handleDeleteTool(t.id)}>🗑</button>
              </div>
            </div>
          ))}
        </div>
      )}

      {toolTab === 'create' && (
        <div className="agent-form">
          {editingTool && (
            <div className="editing-banner">Editing: {editingTool.display_name || editingTool.name} <button onClick={() => setEditingTool(null)}>✕ Cancel</button></div>
          )}
          {FIELD('Name (slug)', 'name', 'my_tool')}
          {FIELD('Display Name', 'display_name', 'My Tool')}
          {FIELD('Description', 'description', 'What this tool does', true)}
          {FIELD('Tags (comma)', 'tags', 'search,data')}
          {FIELD('Python Code', 'code', '    return str(input_data)', true)}
          <button className="run-btn" onClick={editingTool ? handleUpdateTool : handleCreateTool}>
            {editingTool ? '💾 Save Tool' : '➕ Create Tool'}
          </button>
        </div>
      )}

      {toolTab === 'docs' && (
        <div className="skills-body">
          <div className="skills-hint">Editing docs for tool</div>
          <textarea className="skills-editor" value={toolMdText} onChange={e => setToolMdText(e.target.value)} rows={20} />
          <button className="run-btn" onClick={handleSaveToolMd} disabled={toolMdSaving}>
            {toolMdSaving ? '⟳ Saving…' : '💾 Save Docs'}
          </button>
        </div>
      )}

      {toolTab === 'spawns' && (
        <div className="spawns-body">
          {pendingToolSpawns.length === 0 && <div className="empty-hint">No pending tool spawn requests.</div>}
          {pendingToolSpawns.map(r => (
            <div key={r.id} className="spawn-card">
              <div className="spawn-role">🔧 {r.name}</div>
              <div className="spawn-reason">{r.reason}</div>
              <div className="spawn-btns">
                <button className="run-btn" style={{ background: 'var(--success)' }} onClick={() => handleToolSpawnDecision(r.id, true)}>✓ Approve</button>
                <button className="run-btn" style={{ background: 'var(--error)' }} onClick={() => handleToolSpawnDecision(r.id, false)}>✗ Reject</button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
