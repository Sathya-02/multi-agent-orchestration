/**
 * AgentEditorPanel.jsx
 *
 * RBAC:
 *   viewer   : read-only list
 *   operator : approve/deny spawn requests, edit agent fields, edit skills MD
 *   admin    : full CRUD (create, edit, delete) + spawn approval + skills MD
 *
 * Tabs:
 *   Agents   → list + edit inline (operator+)
 *   Create   → admin only
 *   Skills   → edit skills.md / best-practices MD (operator+)
 *   Spawns   → pending spawn approvals (operator+)
 *
 * FIX: Edit (✏️) and Delete (🗑) buttons are now correctly shown based on
 *      can(user, 'edit_agent') and can(user, 'delete_agent') RBAC checks.
 *      Admin → sees both; Operator → sees edit only; Viewer → sees neither.
 */
import { useState } from 'react'
import '../../styles/App.css'
import { useAuth } from '../../auth.jsx'
import { can } from '../../rbac.js'

export default function AgentEditorPanel({
  agents, pendingSpawns,
  handleApproveSpawn, handleDenySpawn,
  handleCreateAgent, handleDeleteAgent, handleUpdateAgent,
  skillsMd, handleSaveSkillsMd,
  onClose
}) {
  const { user } = useAuth()
  const canCreate   = can(user, 'create_agent')   // admin only
  const canDelete   = can(user, 'delete_agent')   // admin only — shows 🗑 button
  const canEdit     = can(user, 'edit_agent')     // operator+ — shows ✏️ button
  const canApprove  = can(user, 'approve_spawn')  // operator+
  const canSkillsMd = can(user, 'edit_skills_md') // operator+

  const TABS = [
    { key: 'list',   label: '🤖 Agents' },
    ...(canCreate   ? [{ key: 'create',  label: '✨ Create' }] : []),
    ...(canSkillsMd ? [{ key: 'skills',  label: '📝 Skills MD' }] : []),
    ...(canApprove && pendingSpawns?.length > 0
      ? [{ key: 'spawns', label: `⏳ Spawns (${pendingSpawns.length})` }]
      : []),
  ]

  const [tab, setTab] = useState('list')

  // Create form
  const [newName,  setNewName]  = useState('')
  const [newRole,  setNewRole]  = useState('')
  const [newModel, setNewModel] = useState('')

  // Skills MD editor
  const [mdContent, setMdContent] = useState(skillsMd || '')

  // Inline edit state
  const [editingId,  setEditingId]  = useState(null)
  const [editFields, setEditFields] = useState({})

  const startEdit = (a) => {
    setEditingId(a.id || a.name)
    setEditFields({ name: a.name || '', role: a.role || '', model: a.model || '' })
  }
  const saveEdit = (a) => {
    handleUpdateAgent?.({ ...a, ...editFields })
    setEditingId(null)
  }

  const onCreateClick = () => {
    if (!canCreate || !newName.trim()) return
    handleCreateAgent({ name: newName.trim(), role: newRole.trim(), model: newModel.trim() })
    setNewName(''); setNewRole(''); setNewModel('')
    setTab('list')
  }

  return (
    <div className="overlay-panel agent-editor-panel">
      <div className="overlay-header">
        <span>
          🤖 Agents
          <span style={{ fontSize: 11, color: 'var(--tx-muted)', fontWeight: 400 }}>
            &nbsp;({agents.length})
          </span>
        </span>
        <button className="overlay-close" onClick={onClose}>✕</button>
      </div>

      {/* Tabs */}
      <div className="agent-tabs">
        {TABS.map(t => (
          <button
            key={t.key}
            className={`agent-tab${tab === t.key ? ' active' : ''}`}
            onClick={() => setTab(t.key)}
          >{t.label}</button>
        ))}
      </div>

      {/* ── AGENTS LIST ── */}
      {tab === 'list' && (
        <div style={{ flex: 1, overflowY: 'auto', padding: '10px 14px' }}>
          {agents.length === 0 && (
            <div className="empty-hint">
              No agents yet.{canCreate ? ' Use Create tab to add one.' : ''}
            </div>
          )}

          {agents.map((a, i) => {
            const id = a.id || a.name
            const isEditing = editingId === id
            return (
              <div key={id || i} style={agentCard}>
                {isEditing ? (
                  <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 5 }}>
                    <input
                      className="topic-input"
                      value={editFields.name}
                      onChange={e => setEditFields(p => ({ ...p, name: e.target.value }))}
                      placeholder="Name"
                      style={{ marginBottom: 0 }}
                    />
                    <input
                      className="topic-input"
                      value={editFields.role}
                      onChange={e => setEditFields(p => ({ ...p, role: e.target.value }))}
                      placeholder="Role / instructions"
                      style={{ marginBottom: 0 }}
                    />
                    <input
                      className="topic-input"
                      value={editFields.model}
                      onChange={e => setEditFields(p => ({ ...p, model: e.target.value }))}
                      placeholder="Model"
                      style={{ marginBottom: 0 }}
                    />
                    <div style={{ display: 'flex', gap: 6, marginTop: 2 }}>
                      <button className="agent-action-btn" onClick={() => saveEdit(a)}>💾 Save</button>
                      <button className="agent-action-btn" onClick={() => setEditingId(null)}>✕ Cancel</button>
                    </div>
                  </div>
                ) : (
                  <>
                    <span style={{ fontSize: 18 }}>🤖</span>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{
                        fontSize: 13, fontWeight: 600, color: 'var(--tx-primary)',
                        whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis'
                      }}>{a.name}</div>
                      {a.role && (
                        <div style={{ fontSize: 11, color: 'var(--tx-muted)' }}>{a.role}</div>
                      )}
                    </div>

                    {a.model && (
                      <span style={{
                        fontSize: 10, color: 'var(--accent)',
                        background: 'rgba(99,102,241,0.1)',
                        padding: '2px 7px', borderRadius: 999
                      }}>{a.model}</span>
                    )}

                    {/* ✏️ Edit — operator+ */}
                    {canEdit && (
                      <button
                        className="agent-action-btn"
                        onClick={() => startEdit(a)}
                        title="Edit agent"
                      >✏️</button>
                    )}

                    {/* 🗑 Delete — admin only */}
                    {canDelete && (
                      <button
                        className="del-btn"
                        onClick={() => handleDeleteAgent?.(id)}
                        title="Delete agent"
                      >🗑</button>
                    )}
                  </>
                )}
              </div>
            )
          })}

          {!canEdit && !canCreate && (
            <div style={{ ...viewerBanner, marginTop: 8 }}>
              🔒 Agents are read-only for your role.
            </div>
          )}
        </div>
      )}

      {/* ── CREATE tab (admin only) ── */}
      {tab === 'create' && canCreate && (
        <div className="kb-body">
          <div style={sectionTitle}>✨ Create New Agent</div>
          <input
            className="topic-input"
            placeholder="Agent name *"
            value={newName}
            onChange={e => setNewName(e.target.value)}
            style={{ marginBottom: 6 }}
          />
          <input
            className="topic-input"
            placeholder="Role / system instructions"
            value={newRole}
            onChange={e => setNewRole(e.target.value)}
            style={{ marginBottom: 6 }}
          />
          <input
            className="topic-input"
            placeholder="Model (optional, e.g. llama3)"
            value={newModel}
            onChange={e => setNewModel(e.target.value)}
            style={{ marginBottom: 10 }}
          />
          <button className="run-btn" onClick={onCreateClick} disabled={!newName.trim()}>
            ✨ Create Agent
          </button>
        </div>
      )}

      {/* ── SKILLS MD tab (operator+) ── */}
      {tab === 'skills' && canSkillsMd && (
        <div className="kb-body">
          <div style={sectionTitle}>📝 Edit Skills / Best-Practices Markdown</div>
          <textarea
            className="topic-input"
            value={mdContent}
            onChange={e => setMdContent(e.target.value)}
            rows={16}
            placeholder="# Skills & Best Practices\n\nDocument agent skills, guidelines, and best practices here…"
          />
          <button
            className="run-btn"
            style={{ marginTop: 8 }}
            onClick={() => handleSaveSkillsMd?.(mdContent)}
            disabled={!mdContent.trim()}
          >
            💾 Save Skills MD
          </button>
        </div>
      )}

      {/* ── SPAWN APPROVALS tab (operator+) ── */}
      {tab === 'spawns' && (
        <div style={{ padding: '10px 14px' }}>
          <div style={sectionTitle}>⏳ Pending Spawn Requests</div>
          {pendingSpawns.length === 0 && (
            <div className="empty-hint">No pending spawn requests.</div>
          )}
          {pendingSpawns.map((s, i) => (
            <div key={i} style={{
              display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8,
              padding: '8px 10px', borderRadius: 7,
              background: 'rgba(255,255,255,0.03)', border: '1px solid var(--bd-subtle)'
            }}>
              <span style={{ flex: 1, fontSize: 12, color: 'var(--tx-secondary)' }}>
                {s.name || s.agent_name || `Spawn #${i + 1}`}
              </span>
              {canApprove ? (
                <>
                  <button className="agent-action-btn" onClick={() => handleApproveSpawn(s)}>✅ Approve</button>
                  <button className="agent-action-btn danger" onClick={() => handleDenySpawn(s)}>✕ Deny</button>
                </>
              ) : (
                <span style={{ fontSize: 11, color: 'var(--tx-muted)' }}>Operator+ required</span>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

const sectionTitle = {
  fontSize: 10, fontWeight: 700, textTransform: 'uppercase',
  letterSpacing: '0.08em', color: 'var(--tx-muted)', marginBottom: 8,
}
const agentCard = {
  display: 'flex', alignItems: 'center', gap: 8,
  padding: '8px 10px', borderRadius: 7, marginBottom: 6,
  background: 'rgba(255,255,255,0.03)', border: '1px solid var(--bd-subtle)',
}
const viewerBanner = {
  padding: '8px 12px', borderRadius: 7,
  background: 'rgba(99,102,241,0.08)',
  border: '1px solid rgba(99,102,241,0.2)',
  color: '#a5b4fc', fontSize: 12,
}
