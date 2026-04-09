export default function AgentCard({ agentId, agentMeta, active, lastMessage, inactive }) {
  const color  = inactive ? '#94a3b8' : (agentMeta?.color || '#6366f1')
  const icon   = agentMeta?.icon  || '🤖'
  const role   = agentMeta?.role  || agentId
  const label  = agentMeta?.label || agentId.toUpperCase()

  return (
    <div className={`agent-card ${active ? 'active' : ''} ${inactive ? 'agent-card-inactive' : ''}`}>
      <div className="agent-avatar"
        style={{ background: `${color}22`, border: `1px solid ${color}55`,
                 opacity: inactive ? 0.45 : 1 }}>
        {icon}
      </div>
      <div className="agent-info">
        <div style={{display:'flex',alignItems:'center',gap:5}}>
          <div className="agent-role" style={{ color: inactive ? 'var(--tx-muted)' : undefined }}>
            {role}
          </div>
          {inactive && (
            <span style={{
              fontSize:9, fontWeight:800, color:'#94a3b8',
              background:'rgba(148,163,184,0.15)',
              border:'1px solid rgba(148,163,184,0.3)',
              borderRadius:4, padding:'1px 5px', letterSpacing:'.05em'
            }}>INACTIVE</span>
          )}
        </div>
        <div className={`agent-status ${active && !inactive ? 'thinking' : ''}`}
          style={{ color: inactive ? 'var(--tx-hint)' : undefined }}>
          {inactive
            ? 'Deactivated — not joining jobs'
            : active
              ? '● thinking…'
              : lastMessage
                ? lastMessage.slice(0, 36) + (lastMessage.length > 36 ? '…' : '')
                : 'idle'}
        </div>
      </div>
      <div className="agent-indicator"
        style={{ background: inactive ? '#334155' : active ? color : '#334155',
                 opacity: inactive ? 0.35 : 1 }} />
    </div>
  )
}
