import React, { useEffect, useRef } from 'react';

/* Per-agent colour map — matches README colour narrative */
const AGENT_COLORS = {
  coordinator: 'var(--coord)',
  researcher:  'var(--res)',
  analyst:     'var(--anal)',
  writer:      'var(--writ)',
  system:      'var(--sys)',
};

function agentColor(agent, agents = []) {
  if (!agent) return 'var(--sys)';
  const id = agent.toLowerCase();
  if (AGENT_COLORS[id]) return AGENT_COLORS[id];
  const found = agents.find(a => a.id === agent || a.role?.toLowerCase() === id);
  return found?.color ? found.color : 'var(--sys)';
}

function agentLabel(agent, agents = []) {
  if (!agent) return 'SYSTEM';
  const id = agent.toLowerCase();
  const labels = { coordinator: 'COORDINATOR', researcher: 'RESEARCHER', analyst: 'ANALYST', writer: 'WRITER' };
  if (labels[id]) return labels[id];
  const found = agents.find(a => a.id === agent || a.role?.toLowerCase() === id);
  return (found?.label || found?.role || agent).toUpperCase();
}

function formatTs(ts) {
  if (!ts) return '';
  const d = new Date(ts * 1000);
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

export default function ActivityFeed({ logs = [], agents = [] }) {
  const bottomRef = useRef(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [logs.length]);

  if (!logs.length) {
    return (
      <div className="feed-scroll">
        <div className="feed-empty">
          No activity yet — launch agents to begin.
        </div>
      </div>
    );
  }

  return (
    <div className="feed-scroll">
      {logs.map((entry, i) => {
        const col = agentColor(entry.agent, agents);
        const lbl = agentLabel(entry.agent, agents);

        /* 1. Phase banner */
        if (entry.phase) {
          return (
            <div
              key={i}
              className="feed-phase"
              style={{ '--agent-color': col }}
            >
              <span className="feed-phase-icon">
                {entry.agent === 'coordinator' ? '🎯'
                  : entry.agent === 'researcher' ? '🔍'
                  : entry.agent === 'analyst'    ? '📊'
                  : entry.agent === 'writer'     ? '✍️'
                  : '🤖'}
              </span>
              <span className="feed-phase-label">{lbl}</span>
              {entry.label && entry.label !== entry.agent && (
                <span className="feed-phase-role">— {entry.label}</span>
              )}
              {entry.ts && (
                <span style={{ marginLeft: 'auto', fontSize: '9.5px', color: 'var(--tx-hint)' }}>
                  {formatTs(entry.ts)}
                </span>
              )}
            </div>
          );
        }

        /* 2. RESULT block */
        if (entry.taskResult) {
          return (
            <div
              key={i}
              className="feed-result"
              style={{ '--agent-color': col }}
            >
              <div className="feed-result-header">
                <span className="feed-result-badge">RESULT</span>
                <span className="feed-result-agent" style={{ color: col }}>
                  {lbl}
                </span>
                {entry.ts && (
                  <span style={{ marginLeft: 'auto', fontSize: '9.5px', color: 'var(--tx-hint)' }}>
                    {formatTs(entry.ts)}
                  </span>
                )}
              </div>
              <div className="feed-result-body">
                {entry.message}
              </div>
            </div>
          );
        }

        /* 3. Regular log line */
        return (
          <div key={i} className="feed-log" style={{ '--agent-color': col }}>
            <div className="feed-log-bar" />
            <span className="feed-log-text">
              {entry.message}
            </span>
            {entry.ts && (
              <span className="feed-log-ts">{formatTs(entry.ts)}</span>
            )}
          </div>
        );
      })}
      <div ref={bottomRef} />
    </div>
  );
}
