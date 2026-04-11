import '../../styles/App.css'

export default function AgentEditorPanel({
  agents, agentTab, setAgentTab,
  editingAgent, setEditingAgent, newAgentForm, setNewAgentForm,
  skillsText, setSkillsText, skillsSaving, skillsAgentId, setSkillsAgentId,
  pendingSpawns, spawnEnabled, spawnToggling,
  handleCreateAgent, handleUpdateAgent, handleDeleteAgent,
  handleToggleActive, handleSaveSkills, handleSpawnDecision, handleToggleSpawn,
  onClose
}) {
  const FIELD = (label, key, ph) => (
    <div className="form-row" key={key}>
      <label className="form-label">{label}</label>
      <input
        className="topic-input"
        value={editingAgent ? editingAgent[key] ?? '' : newAgentForm[key] ?? ''}
        onChange={e => editingAgent
          ? setEditingAgent({ ...editingAgent, [key]: e.target.value })
          : setNewAgentForm({ ...newAgentForm, [key]: e.target.value })}
        placeholder={ph}
      />
    </div>
  )

  return (
    <div className="overlay-panel agent-panel">
      <div className="overlay-header">
        <span>🤖 Agent Editor</span>
        <button className="overlay-close" onClick={onClose}>✕</button>
      </div>

      <div className="agent-tabs">
        {['list','create','skills','spawns'].map(t => (
          <button key={t} className={`agent-tab${agentTab===t?' active':''}`} onClick={() => setAgentTab(t)}>
            {{ list:'📋 Agents', create:'➕ Create', skills:'📄 Skills', spawns:`🔔 Spawns${pendingSpawns.length ? ` (${pendingSpawns.length})` : ''}` }[t]}
          </button>
        ))}
      </div>

      {/* LIST */}
      {agentTab === 'list' && (
        <div className="agent-list">
          {agents.length === 0 && <div className="empty-hint">No agents yet.</div>}
          {agents.map(a => (
            <div key={a.id} className={`agent-card-edit${a.active === false ? ' inactive' : ''}`}>
              <span className="agent-icon">{a.icon || '🤖'}</span>
              <div className="agent-info">
                <div className="agent-name">{a.label || a.role}</div>
                <div className="agent-role">{a.role}</div>
              </div>
              <div className="agent-actions">
                <button className="icon-btn" title="Edit" onClick={() => { setEditingAgent({...a}); setAgentTab('create') }}>✏️</button>
                <button className="icon-btn" title={a.active === false ? 'Activate' : 'Deactivate'} onClick={() => handleToggleActive(a)}>
                  {a.active === false ? '▶' : '⏸'}
                </button>
                <button className="icon-btn" title="Skills" onClick={() => { setSkillsAgentId(a.id); setAgentTab('skills') }}>📄</button>
                <button className="icon-btn del" title="Delete" onClick={() => handleDeleteAgent(a.id)}>🗑</button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* CREATE / EDIT */}
      {agentTab === 'create' && (
        <div className="agent-form">
          {editingAgent && (
            <div className="editing-banner">Editing: {editingAgent.label || editingAgent.role} <button onClick={() => setEditingAgent(null)}>✕ Cancel</button></div>
          )}
          {FIELD('Label', 'label', 'Display name')}
          {FIELD('Role', 'role', 'e.g. security_analyst')}
          {FIELD('Goal', 'goal', 'What this agent aims to do')}
          {FIELD('Backstory', 'backstory', 'Persona / context')}
          {FIELD('Icon', 'icon', '🤖')}
          {FIELD('Color', 'color', '#a78bfa')}
          <button className="run-btn" onClick={editingAgent ? handleUpdateAgent : handleCreateAgent}>
            {editingAgent ? '💾 Save Changes' : '➕ Create Agent'}
          </button>
        </div>
      )}

      {/* SKILLS */}
      {agentTab === 'skills' && (
        <div className="skills-body">
          <div className="skills-hint">Editing SKILLS.md for agent ID: {skillsAgentId || '—'}</div>
          <textarea
            className="skills-editor"
            value={skillsText}
            onChange={e => setSkillsText(e.target.value)}
            rows={20}
          />
          <button className="run-btn" onClick={handleSaveSkills} disabled={skillsSaving}>
            {skillsSaving ? '⟳ Saving…' : '💾 Save Skills'}
          </button>
        </div>
      )}

      {/* SPAWNS */}
      {agentTab === 'spawns' && (
        <div className="spawns-body">
          <div className="spawn-toggle-row">
            <span>Auto-spawn requests</span>
            <button className="toggle-btn" onClick={handleToggleSpawn} disabled={spawnToggling}>
              {spawnEnabled ? '🟢 Enabled' : '🔴 Disabled'}
            </button>
          </div>
          {pendingSpawns.length === 0 && <div className="empty-hint">No pending spawn requests.</div>}
          {pendingSpawns.map(r => (
            <div key={r.id} className="spawn-card">
              <div className="spawn-role">{r.icon || '🤖'} {r.label || r.role}</div>
              <div className="spawn-reason">{r.reason}</div>
              <div className="spawn-btns">
                <button className="run-btn" style={{ background: 'var(--success)' }} onClick={() => handleSpawnDecision(r.id, true)}>✓ Approve</button>
                <button className="run-btn" style={{ background: 'var(--error)' }} onClick={() => handleSpawnDecision(r.id, false)}>✗ Reject</button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
