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
  const form    = editingTool || newToolForm
  const setForm = (patch) => editingTool
    ? setEditingTool({ ...editingTool, ...patch })
    : setNewToolForm({ ...newToolForm, ...patch })

  const Field = ({ label, field, placeholder, multiline }) => (
    <div style={{ display:'flex', flexDirection:'column', gap:3, marginBottom:8 }}>
      <label style={{ fontSize:'10px', color:'var(--tx-muted)', fontWeight:700, textTransform:'uppercase', letterSpacing:'0.08em' }}>{label}</label>
      {multiline
        ? <textarea className="topic-input code-editor" value={form[field] ?? ''} onChange={e => setForm({ [field]: e.target.value })} placeholder={placeholder} rows={8} />
        : <input    className="topic-input"              value={form[field] ?? ''} onChange={e => setForm({ [field]: e.target.value })} placeholder={placeholder} />
      }
    </div>
  )

  return (
    <div className="overlay-panel tool-panel">
      <div className="overlay-header">
        <span>🔧 Custom Tools</span>
        <button className="overlay-close" onClick={onClose}>✕</button>
      </div>

      {/* Tabs */}
      <div className="agent-tabs">
        {['list','create','toolmd','spawns'].map(t => (
          <button key={t} className={`agent-tab${toolTab === t ? ' active' : ''}`} onClick={() => setToolTab(t)}>
            {{
              list:   `📋 Tools (${tools.length})`,
              create: editingTool ? '✏️ Edit' : '➕ Create',
              toolmd: '📄 TOOL.md',
              spawns: `🔔 Spawns${pendingToolSpawns.length ? ` (${pendingToolSpawns.length})` : ''}`,
            }[t]}
          </button>
        ))}
      </div>

      {/* ── LIST ── */}
      {toolTab === 'list' && (
        <div style={{ padding:'10px 14px', overflowY:'auto', flex:1 }}>
          {tools.length === 0 && <div className="empty-hint">No custom tools yet.</div>}
          {tools.map(tool => (
            <div key={tool.id} className={`tool-list-item${tool.active === false ? ' inactive' : ''}`}>
              <div className="tool-info">
                <div className="tool-name">{tool.display_name || tool.name}</div>
                {tool.description && <div className="tool-desc">{tool.description}</div>}
                {tool.tags?.length > 0 && (
                  <div className="tool-tags">
                    {tool.tags.map(tag => <span key={tag} className="tool-tag">{tag}</span>)}
                  </div>
                )}
              </div>
              <div className="agent-actions">
                <button className="agent-action-btn" onClick={() => { setEditingTool({...tool}); setToolTab('create') }}>✏️</button>
                <button className="agent-action-btn" onClick={() => handleToggleToolActive(tool)}>
                  {tool.active === false ? '▶' : '⏸'}
                </button>
                <button className="agent-action-btn" onClick={() => handleOpenToolMd(tool)}>📄</button>
                <button className="agent-action-btn danger" onClick={() => handleDeleteTool(tool.id)}>🗑</button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ── CREATE / EDIT ── */}
      {toolTab === 'create' && (
        <div className="agent-form">
          {editingTool && (
            <div style={{ padding:'6px 12px', background:'rgba(58,127,255,0.08)', borderRadius:6, marginBottom:8, fontSize:11, color:'#80b4ff', display:'flex', justifyContent:'space-between', alignItems:'center' }}>
              <span>Editing: <strong>{editingTool.display_name || editingTool.name}</strong></span>
              <button style={{ background:'none', border:'none', color:'var(--tx-muted)', cursor:'pointer' }} onClick={() => setEditingTool(null)}>✕</button>
            </div>
          )}
          <Field label="Name (slug)"    field="name"         placeholder="my_tool" />
          <Field label="Display Name"   field="display_name" placeholder="My Tool" />
          <Field label="Description"    field="description"  placeholder="What this tool does" />
          <Field label="Tags (comma-sep)" field="tags"       placeholder="search, data" />
          <Field label="Python Code (body of run(input_data))" field="code" placeholder="    return str(input_data)" multiline />
          <button className="agent-save-btn" onClick={editingTool ? handleUpdateTool : handleCreateTool}>
            {editingTool ? '💾 Save Changes' : '➕ Create Tool'}
          </button>
        </div>
      )}

      {/* ── TOOL.MD ── */}
      {toolTab === 'toolmd' && (
        <div style={{ padding:'12px 16px', display:'flex', flexDirection:'column', flex:1, gap:8 }}>
          <div style={{ fontSize:11, color:'var(--tx-muted)' }}>Editing <strong>TOOL.md</strong> — describe usage, params, examples</div>
          <textarea
            className="code-editor toolmd-editor"
            value={toolMdText}
            onChange={e => setToolMdText(e.target.value)}
            rows={18}
            placeholder="# Tool Name\n\n## Description\n\n## Parameters\n\n## Examples\n"
          />
          <button className="agent-save-btn" onClick={handleSaveToolMd} disabled={toolMdSaving}>
            {toolMdSaving ? '⟳ Saving…' : '💾 Save TOOL.md'}
          </button>
        </div>
      )}

      {/* ── SPAWNS ── */}
      {toolTab === 'spawns' && (
        <div style={{ padding:'12px 16px', overflowY:'auto', flex:1 }}>
          {pendingToolSpawns.length === 0 && (
            <div className="empty-hint">No pending tool spawn requests.</div>
          )}
          {pendingToolSpawns.map(r => (
            <div key={r.request_id} className="tool-spawn-banner">
              <div style={{ fontSize:11, fontWeight:800, color:'#6ee7b7', marginBottom:4 }}>🔧 TOOL SPAWN REQUEST</div>
              <div style={{ fontSize:13, fontWeight:700, color:'var(--tx-primary)', marginBottom:2 }}>
                {r.suggestion?.name || r.name || '?'}
              </div>
              <div style={{ fontSize:11, color:'var(--tx-secondary)', marginBottom:8 }}>
                {r.suggestion?.description || r.reason || ''}
              </div>
              {r.suggestion?.code && (
                <pre style={{ fontFamily:'var(--mono)', fontSize:'10px', color:'var(--tx-secondary)', background:'var(--bg-input)', padding:'6px 10px', borderRadius:5, marginBottom:8, overflowX:'auto' }}>
                  {r.suggestion.code}
                </pre>
              )}
              <div style={{ display:'flex', gap:7 }}>
                <button className="spawn-approve-btn" onClick={() => handleToolSpawnDecision(r.request_id, true)}>✓ Approve</button>
                <button className="spawn-reject-btn"  onClick={() => handleToolSpawnDecision(r.request_id, false)}>✗ Reject</button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
