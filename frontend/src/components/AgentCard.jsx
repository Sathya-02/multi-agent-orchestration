// Strip ANSI escape codes so raw terminal output never leaks into the UI
// Covers: CSI sequences (including 256-colour & truecolor), OSC sequences,
// other Fe escapes (\x1bO, \x1b=, \x1b> …), and bare carriage returns.
const stripAnsi = (str) => {
  if (typeof str !== 'string') return str
  return str
    .replace(/\x1b\[[\d;]*[A-Za-z]/g, '')       // CSI sequences (SGR, cursor, etc.)
    .replace(/\x1b\][^\x07\x1b]*(?:\x07|\x1b\\)/g, '') // OSC sequences
    .replace(/\x1b[O=><][\d;]*[A-Za-z]?/g, '')  // Fe / Fp / Fs escapes
    .replace(/\x1b[^[\]O=><]/g, '')             // any remaining lone ESC + char
    .replace(/\r/g, '')                           // bare carriage returns
    .trim()
}

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
  // Increased truncation limit 42 → 80 chars for better readability
  const statusText = isActive
    ? '● thinking…'
    : cleanMessage
      ? cleanMessage.slice(0, 80) + (cleanMessage.length > 80 ? '…' : '')
      : 'idle'

  return (
    <div className={`agent-card ${isActive ? 'active' : ''} ${isDone ? 'done' : ''}`}>
      <div
        className="agent-avatar"
        style={{
          background: `${accentColor}22`,
          border: `1px solid ${accentColor}55`,
          // Expose accent colour as CSS custom property for the pulse ring in AgentCard.css
          '--agent-pulse': `${accentColor}4d`,
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
