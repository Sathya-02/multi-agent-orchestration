import '../../styles/App.css'

export default function AgentEditorPanel({
  agents, agentTab, setAgentTab,
  editingAgent, setEditingAgent, newAgentForm, setNewAgentForm,
  skillsText, setSkillsText, skillsSaving, skillsAgentId, setSkillsAgentId,
  pendingSpawns, spawnEnabled, spawnToggling,
  handleCreateAgent, handleUpdateAgent, handleDeleteAgent,
  handleToggleActive, handleSaveSkills, handleOpenSkills, handleSpawnDecision, handleToggleSpawn,
  onClose
}) {
  const form = editingAgent || newAgentForm
  const setForm = (patch) => editingAgent
    ? setEditingAgent({ ...editingAgent, ...patch })
    : setNewAgentForm({ ...newAgentForm, ...patch })

  const Field = ({ label, field, placeholder, multiline }) => (
    <div style={{ display:'flex', flexDirection:'column', gap:3, marginBottom:8 }}>
      <label style={{ fontSize:'10px', color:'var(--tx-muted)', fontWeight:700, textTransform:'uppercase', letterSpacing:'0.08em' }}>
        {label}
      </label>
      {multiline
        ? <textarea className="topic-input" value={form[field] ?? ''} onChange={e => setForm({ [field]: e.target.value })} placeholder={placeholder} rows={3} />
        : <input    className="topic-input" value={form[field] ?? ''} onChange={e => setForm({ [field]: e.target.value })} placeholder={placeholder} />
      }
    </div>
  )

  return (
    <div className="overlay-panel agent-panel">
      <div className="overlay-header">
        <span>🤖 Agent Editor</span>
        <button className="overlay-close" onClick={onClose}>✕</button>
      </div>

      {/* Tabs */}
      <div className="agent-tabs">
        {['list','create','skills','spawns'].map(t => (
          <button key={t} className={`agent-tab${agentTab === t ? ' active' : ''}`} onClick={() => {
            // When switching to skills tab directly (from header), reload content for current agent
            if (t === 'skills' && skillsAgentId && handleOpenSkills) {
              handleOpenSkills(skillsAgentId)
            }
            setAgentTab(t)
          }}>
            {{
              list:   '📋 Agents',
              create: editingAgent ? '✏️ Edit' : '➕ Create',
              skills: '📄 Skills',
              spawns: `🔔 Spawns${pendingSpawns.length ? ` (${pendingSpawns.length})` : ''}`,
            }[t]}
          </button>
        ))}
      </div>

      {/* ── LIST TAB ── */}
      {agentTab === 'list' && (
        <div style={{ padding:'10px 14px', overflowY:'auto', flex:1 }}>
          {agents.length === 0 && <div className="empty-hint">No agents yet. Click ➕ Create to add one.</div>}
          {agents.map(a => (
            <div key={a.id} className={`agent-list-item${a.active === false ? ' agent-action-btn inactive' : ''}`}>
              <div className="agent-list-avatar" style={{ background: a.color ? `${a.color}22` : 'rgba(58,127,255,0.1)' }}>
                {a.icon || '🤖'}
              </div>
              <div className="agent-list-info">
                <div className="agent-list-name">{a.label || a.role}</div>
                <div className="agent-list-role">{a.role}</div>
                {a.goal && <div className="agent-list-goal">{a.goal}</div>}
              </div>
              <div className="agent-actions">
                <button className="agent-action-btn" title="Edit"
                  onClick={() => { setEditingAgent({ ...a }); setAgentTab('create') }}>✏️</button>
                <button className="agent-action-btn" title={a.active === false ? 'Activate' : 'Deactivate'}
                  onClick={() => handleToggleActive(a)}>
                  {a.active === false ? '▶' : '⏸'}
                </button>
                <button className="agent-action-btn" title="Edit Skills"
                  onClick={() => handleOpenSkills(a.id)}>📄</button>
                <button className="agent-action-btn danger" title="Delete"
                  onClick={() => handleDeleteAgent(a.id)}>🗑</button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ── CREATE / EDIT TAB ── */}
      {agentTab === 'create' && (
        <div className="agent-form">
          {editingAgent && (
            <div style={{ padding:'6px 12px', background:'rgba(58,127,255,0.08)', borderRadius:6, marginBottom:8, fontSize:11, color:'#80b4ff', display:'flex', justifyContent:'space-between', alignItems:'center' }}>
              <span>Editing: <strong>{editingAgent.label || editingAgent.role}</strong></span>
              <button style={{ background:'none', border:'none', color:'var(--tx-muted)', cursor:'pointer', fontSize:13 }} onClick={() => { setEditingAgent(null) }}>✕ Cancel</button>
            </div>
          )}
          <Field label="Label"     field="label"     placeholder="Display name" />
          <Field label="Role"      field="role"      placeholder="e.g. security_analyst" />
          <Field label="Goal"      field="goal"      placeholder="What this agent aims to do" multiline />
          <Field label="Backstory" field="backstory" placeholder="Persona / context" multiline />
          <div style={{ display:'flex', gap:8, marginBottom:8 }}>
            <div style={{ flex:1 }}><Field label="Icon" field="icon" placeholder="🤖" /></div>
            <div>
              <label style={{ fontSize:'10px', color:'var(--tx-muted)', fontWeight:700, textTransform:'uppercase', letterSpacing:'0.08em', display:'block', marginBottom:6 }}>Color</label>
              <input type="color" className="agent-color-input"
                value={form.color || '#a78bfa'}
                onChange={e => setForm({ color: e.target.value })} />
            </div>
          </div>
          <button className="agent-save-btn" onClick={editingAgent ? handleUpdateAgent : handleCreateAgent}>
            {editingAgent ? '💾 Save Changes' : '➕ Create Agent'}
          </button>
        </div>
      )}

      {/* ── SKILLS TAB ── */}
      {agentTab === 'skills' && (
        <div style={{ padding:'12px 16px', display:'flex', flexDirection:'column', flex:1, gap:8 }}>
          {skillsAgentId ? (
            <>
              <div style={{ fontSize:'11px', color:'var(--tx-muted)' }}>
                Editing <strong>SKILLS.md</strong> for agent: <code style={{ fontFamily:'var(--mono)', color:'var(--accent)' }}>{skillsAgentId}</code>
              </div>
              <textarea
                className="skills-editor"
                value={skillsText}
                onChange={e => setSkillsText(e.target.value)}
                rows={18}
                placeholder="# Skills&#10;&#10;Describe what this agent is good at..."
              />
              <button className="agent-save-btn" onClick={handleSaveSkills} disabled={skillsSaving}>
                {skillsSaving ? '⟳ Saving…' : '💾 Save Skills'}
              </button>
            </>
          ) : (
            <div className="empty-hint">
              Select an agent from the 📋 Agents list and click 📄 to edit its skills.
            </div>
          )}
        </div>
      )}

      {/* ── SPAWNS TAB ── */}
      {agentTab === 'spawns' && (
        <div style={{ padding:'12px 16px', overflowY:'auto', flex:1 }}>
          {/* Toggle */}
          <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:14, padding:'8px 12px', background:'rgba(58,127,255,0.06)', border:'1px solid var(--bd-subtle)', borderRadius:7 }}>
            <span style={{ fontSize:12, color:'var(--tx-secondary)' }}>Auto-spawn requests</span>
            <button
              className={`si-toggle ${spawnEnabled ? 'on' : 'off'}`}
              onClick={handleToggleSpawn}
              disabled={spawnToggling}
            >
              {spawnEnabled ? '🟢 Enabled' : '🔴 Disabled'}
            </button>
          </div>

          {pendingSpawns.length === 0 && (
            <div className="empty-hint">No pending spawn requests.</div>
          )}

          {pendingSpawns.map(r => (
            <div key={r.request_id} className="spawn-request-banner">
              <div className="spawn-banner-title">🔔 SPAWN REQUEST</div>
              <div className="spawn-banner-role">{r.icon || '🤖'} {r.label || r.role}</div>
              <div className="spawn-banner-reason">{r.reason || r.message}</div>
              <div className="spawn-banner-actions">
                <button className="spawn-approve-btn" onClick={() => handleSpawnDecision(r.request_id, true)}>✓ Approve</button>
                <button className="spawn-reject-btn"  onClick={() => handleSpawnDecision(r.request_id, false)}>✗ Reject</button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
