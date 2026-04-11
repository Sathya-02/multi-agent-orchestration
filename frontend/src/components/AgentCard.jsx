/**
 * AgentCard
 * Accepts a single `agent` object prop (the full agent record from /agents)
 * plus `active`, `lastMessage`, and `inactive` helpers.
 *
 * Also accepts the legacy split-prop API (agentId + agentMeta) for any
 * other callers that haven't been updated yet.
 */
export default function AgentCard({ agent, agentId, agentMeta, active, lastMessage, inactive }) {
  // Support both calling conventions:
  //   <AgentCard agent={agent} />              ← new (SidePanel)
  //   <AgentCard agentId={id} agentMeta={m} /> ← legacy
  const id       = agent?.id    || agentId    || ''
  const meta     = agent        || agentMeta  || {}

  const isInactive = inactive ?? (agent?.active === false)
  const color  = isInactive ? '#94a3b8' : (meta.color || '#6366f1')
  const icon   = meta.icon  || '🤖'
  const role   = meta.role  || id
  const label  = meta.label || (id ? id.toUpperCase() : '?')

  return (
    <div className={`agent-card ${active ? 'active' : ''} ${isInactive ? 'agent-card-inactive' : ''}`}>
      <div className="agent-avatar"
        style={{ background: `${color}22`, border: `1px solid ${color}55`,
                 opacity: isInactive ? 0.45 : 1 }}>
        {icon}
      </div>
      <div className="agent-info">
        <div style={{display:'flex',alignItems:'center',gap:5}}>
          <div className="agent-role" style={{ color: isInactive ? 'var(--tx-muted)' : undefined }}>
            {role}
          </div>
          {isInactive && (
            <span style={{
              fontSize:9, fontWeight:800, color:'#94a3b8',
              background:'rgba(148,163,184,0.15)',
              border:'1px solid rgba(148,163,184,0.3)',
              borderRadius:4, padding:'1px 5px', letterSpacing:'.05em'
            }}>INACTIVE</span>
          )}
        </div>
        <div className={`agent-status ${active && !isInactive ? 'thinking' : ''}`}
          style={{ color: isInactive ? 'var(--tx-hint)' : undefined }}>
          {isInactive
            ? 'Deactivated — not joining jobs'
            : active
              ? '● thinking…'
              : lastMessage
                ? lastMessage.slice(0, 36) + (lastMessage.length > 36 ? '…' : '')
                : 'idle'}
        </div>
      </div>
      <div className="agent-indicator"
        style={{ background: isInactive ? '#334155' : active ? color : '#334155',
                 opacity: isInactive ? 0.35 : 1 }} />
    </div>
  )
}
