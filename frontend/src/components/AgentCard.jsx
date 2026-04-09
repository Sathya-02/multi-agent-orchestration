import React from 'react';

const BUILTIN_COLORS = {
  coordinator: 'var(--coord)',
  researcher:  'var(--res)',
  analyst:     'var(--anal)',
  writer:      'var(--writ)',
};

const BUILTIN_IDS = new Set(['coordinator', 'researcher', 'analyst', 'writer']);

function resolveColor(agent) {
  const id = (agent.id || agent.role || '').toLowerCase();
  if (BUILTIN_COLORS[id]) return BUILTIN_COLORS[id];
  return agent.color || 'var(--tx-muted)';
}

export default function AgentCard({ agentId, agentMeta, active, lastMessage, inactive }) {
  if (!agentMeta) return null;

  const { id, role, label, icon, color, builtin } = agentMeta;
  const agentIdKey = (id || role || '').toLowerCase();
  const isBuiltin = builtin || BUILTIN_IDS.has(agentIdKey);
  const resolvedColor = resolveColor(agentMeta);
  const displayLabel = label || role || id || '?';

  const cardClass = [
    'agent-card',
    isBuiltin ? 'builtin' : 'custom',
    active   ? 'active'  : '',
    inactive ? 'inactive': '',
  ].filter(Boolean).join(' ');

  return (
    <div
      className={cardClass}
      style={{ '--agent-col': resolvedColor }}
    >
      <div className="agent-icon" aria-hidden="true">
        {icon || (isBuiltin ? '🤖' : '🖥️')}
      </div>

      <div className="agent-info">
        <div className="agent-label">{displayLabel.toUpperCase()}</div>
        {role && role !== displayLabel && (
          <div className="agent-role">{role}</div>
        )}
        {lastMessage && (
          <div className="agent-last-msg" title={lastMessage}>
            {lastMessage.length > 72 ? lastMessage.slice(0, 72) + '…' : lastMessage}
          </div>
        )}
      </div>

      <div className="agent-badges">
        {isBuiltin && !inactive && (
          <span className="agent-builtin-badge">BUILT-IN</span>
        )}
        {!isBuiltin && !inactive && (
          <span className="agent-custom-badge">CUSTOM</span>
        )}
        {inactive && (
          <span className="agent-inactive-badge">INACTIVE</span>
        )}
      </div>
    </div>
  );
}
