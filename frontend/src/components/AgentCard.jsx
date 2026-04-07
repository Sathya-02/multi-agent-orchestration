// Strip ANSI escape codes so raw terminal output never leaks into the UI
const stripAnsi = (str) =>
  typeof str === 'string'
    ? str.replace(/\x1b\[[\d;]*[A-Za-z]/g, '').replace(/\x1b\][^\x07]*\x07/g, '').trim()
    : str

/**
 * Props (matches what App.jsx passes):
 *   agentId      – role id string
 *   label        – display name
 *   icon         – emoji icon
 *   color        – hex accent colour
 *   isActive     – bool, agent is currently working
 *   isDone       – bool, agent has finished its phase
 *   lastMessage  – last status string (may contain ANSI)
 */
export default function AgentCard({ agentId, label, icon, color, isActive, isDone, lastMessage }) {
  const accentColor = color || '#6366f1'
  const displayLabel = label || (agentId ? agentId.toUpperCase() : 'Agent')
  const displayIcon  = icon  || '🤖'

  const cleanMessage = stripAnsi(lastMessage || '')
  const statusText = isActive
    ? '● thinking…'
    : cleanMessage
      ? cleanMessage.slice(0, 42) + (cleanMessage.length > 42 ? '…' : '')
      : 'idle'

  return (
    <div className={`agent-card ${isActive ? 'active' : ''} ${isDone ? 'done' : ''}`}>
      <div
        className="agent-avatar"
        style={{
          background: `${accentColor}22`,
          border: `1px solid ${accentColor}55`,
        }}
      >
        {displayIcon}
      </div>

      <div className="agent-info">
        <div className="agent-role-label">{displayLabel}</div>
        <div className={`agent-status ${isActive ? 'thinking' : ''}`}>
          {statusText}
        </div>
      </div>

      <div
        className="agent-indicator"
        style={{
          background: isActive
            ? accentColor
            : isDone
              ? 'var(--success)'
              : '#334155',
        }}
      />
    </div>
  )
}
