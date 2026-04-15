/**
 * AgentEditorPanel.jsx
 *
 * RBAC:
 *   viewer   : read-only — can see agent list but no create/delete/edit buttons
 *   operator : approve/deny spawn requests only
 *   admin    : full CRUD + spawn approval
 */
import { useState } from 'react'
import '../../styles/App.css'
import { useAuth } from '../../auth.jsx'
import { can } from '../../rbac.js'

export default function AgentEditorPanel({
  agents, pendingSpawns,
  handleApproveSpawn, handleDenySpawn,
  handleCreateAgent, handleDeleteAgent,
  onClose
}) {
  const { user } = useAuth()
  const canCreate  = can(user, 'create_agent')
  const canDelete  = can(user, 'delete_agent')
  const canApprove = can(user, 'approve_spawn')

  const [newName, setNewName]   = useState('')
  const [newRole, setNewRole]   = useState('')
  const [newModel, setNewModel] = useState('')

  const onCreateClick = () => {
    if (!canCreate || !newName.trim()) return
    handleCreateAgent({ name: newName.trim(), role: newRole.trim(), model: newModel.trim() })
    setNewName(''); setNewRole(''); setNewModel('')
  }

  return (
    <div className="overlay-panel agent-editor-panel">
      <div className="overlay-header">
        <span>🤖 Agents</span>
        <button className="overlay-close" onClick={onClose}>✕</button>
      </div>

      {/* ── Pending spawn requests (operator+) ── */}
      {pendingSpawns.length > 0 && (
        <div style={{ padding:'10px 14px', borderBottom:'1px solid var(--bd-subtle)' }}>
          <div style={{ fontSize:10, fontWeight:700, textTransform:'uppercase', letterSpacing:'0.08em', color:'var(--tx-muted)', marginBottom:8 }}>
            ⏳ Pending Spawn Requests
          </div>
          {pendingSpawns.map((s, i) => (
            <div key={i} style={{ display:'flex', alignItems:'center', gap:8, marginBottom:6, fontSize:12 }}>
              <span style={{ flex:1, color:'var(--tx-secondary)' }}>{s.name || s.agent_name || `Spawn #${i+1}`}</span>
              {canApprove ? (
                <>
                  <button className="agent-action-btn" onClick={() => handleApproveSpawn(s)}>✅ Approve</button>
                  <button className="agent-action-btn danger" onClick={() => handleDenySpawn(s)}>✕ Deny</button>
                </>
              ) : (
                <span style={{ fontSize:11, color:'var(--tx-muted)' }}>Operator+ required</span>
              )}
            </div>
          ))}
        </div>
      )}

      {/* ── Create agent form (admin only) ── */}
      {canCreate && (
        <div style={{ padding:'12px 14px', borderBottom:'1px solid var(--bd-subtle)' }}>
          <div style={{ fontSize:10, fontWeight:700, textTransform:'uppercase', letterSpacing:'0.08em', color:'var(--tx-muted)', marginBottom:8 }}>
            ✨ Create Agent
          </div>
          <input className="topic-input" placeholder="Agent name" value={newName} onChange={e => setNewName(e.target.value)} style={{ marginBottom:6 }} />
          <input className="topic-input" placeholder="Role / instructions" value={newRole} onChange={e => setNewRole(e.target.value)} style={{ marginBottom:6 }} />
          <input className="topic-input" placeholder="Model (optional)" value={newModel} onChange={e => setNewModel(e.target.value)} style={{ marginBottom:8 }} />
          <button className="run-btn" onClick={onCreateClick} disabled={!newName.trim()}>➕ Create</button>
        </div>
      )}

      {/* ── Agent list ── */}
      <div style={{ flex:1, overflowY:'auto', padding:'10px 14px' }}>
        {agents.length === 0 && <div className="empty-hint">No agents yet.</div>}
        {agents.map((a, i) => (
          <div key={a.id || a.name || i} style={{
            display:'flex', alignItems:'center', gap:8,
            padding:'8px 10px', borderRadius:7, marginBottom:6,
            background:'rgba(255,255,255,0.03)', border:'1px solid var(--bd-subtle)'
          }}>
            <span style={{ fontSize:18 }}>🤖</span>
            <div style={{ flex:1, minWidth:0 }}>
              <div style={{ fontSize:13, fontWeight:600, color:'var(--tx-primary)', whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>
                {a.name}
              </div>
              {a.role && <div style={{ fontSize:11, color:'var(--tx-muted)' }}>{a.role}</div>}
            </div>
            {a.model && <span style={{ fontSize:10, color:'var(--accent)', background:'rgba(99,102,241,0.1)', padding:'2px 7px', borderRadius:999 }}>{a.model}</span>}
            {canDelete && (
              <button className="del-btn" onClick={() => handleDeleteAgent(a.id || a.name)} title="Delete agent">🗑</button>
            )}
          </div>
        ))}
      </div>

      {!canCreate && !canApprove && (
        <div style={{ ...viewerBanner, margin:'0 14px 10px' }}>🔒 Agents are read-only for your role.</div>
      )}
    </div>
  )
}

const viewerBanner = {
  padding: '8px 12px', borderRadius: 7,
  background: 'rgba(99,102,241,0.08)',
  border: '1px solid rgba(99,102,241,0.2)',
  color: '#a5b4fc', fontSize: 12,
}
