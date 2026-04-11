import { useEffect, useRef } from 'react'

const BUILTIN_COLORS = {
  coordinator: '#6C63FF',
  researcher:  '#00BFA6',
  analyst:     '#FF6584',
  writer:      '#FFC107',
  fs_agent:    '#38bdf8',
  system:      '#64748b',
}

const BUILTIN_LABELS = {
  coordinator: '🎯 Coordinator',
  researcher:  '🔍 Researcher',
  analyst:     '📊 Analyst',
  writer:      '✍️  Writer',
  fs_agent:    '🗂️  File System',
  system:      '⚙️  System',
}

function cleanMessage(raw) {
  return (raw || '')
    .replace(/\x1b\[[0-9;]*m/g, '')
    .replace(/^\[[\d;]+m/g, '')
    .replace(/^(Thought:|Action:|Action Input:|Observation:)\s*/i, '')
    .replace(/\*\*(.*?)\*\*/g, '$1')
    .trim()
}

function formatTime(ts) {
  if (!ts) return ''
  const d = new Date(ts * 1000)
  return [d.getHours(), d.getMinutes(), d.getSeconds()]
    .map(n => String(n).padStart(2, '0')).join(':')
}

export default function ActivityFeed({ logs, agents }) {
  const bottomRef = useRef()

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [logs])

  const agentColorMap = { ...BUILTIN_COLORS }
  const agentLabelMap = { ...BUILTIN_LABELS }
  if (agents) {
    agents.forEach(a => {
      if (!agentColorMap[a.id]) agentColorMap[a.id] = a.color || '#a78bfa'
      if (!agentLabelMap[a.id]) agentLabelMap[a.id] = `${a.icon || '🤖'} ${a.label || a.role}`
    })
  }

  return (
    <div className="feed-scroll">
      {logs.length === 0 && (
        <div className="feed-empty">Launch agents to see activity here…</div>
      )}

      {logs.map((log, i) => {
        const color   = agentColorMap[log.agent] || agentColorMap.system
        const label   = log.label || agentLabelMap[log.agent] || log.agent
        const message = cleanMessage(log.message)
        const isPhase  = log.phase === true
        const isResult = log.taskResult === true
        const isError  = message.startsWith('❌')
        const isDone   = message.startsWith('✅')

        if (!message) return null

        if (isPhase) {
          return (
            <div key={i} className="feed-phase-banner" style={{ borderLeftColor: color }}>
              <div className="feed-phase-header">
                <span className="feed-agent-label" style={{ color }}>{label}</span>
                {log.ts && <span className="feed-time">{formatTime(log.ts)}</span>}
              </div>
              <div className="feed-phase-msg">{message}</div>
            </div>
          )
        }

        if (isResult) {
          const body = message.replace(/^📋 Task result:\s*/i, '')
          return (
            <div key={i} className="feed-item feed-item-result">
              <div className="feed-bar" style={{ background: color }} />
              <div className="feed-content">
                <div className="feed-row-top">
                  <span className="feed-agent-label" style={{ color }}>{label}</span>
                  <span className="feed-result-badge">RESULT</span>
                  {log.ts && <span className="feed-time">{formatTime(log.ts)}</span>}
                </div>
                <div className="feed-result-body">{body}</div>
              </div>
            </div>
          )
        }

        return (
          <div key={i} className={`feed-item${isError ? ' feed-item-error' : ''}${isDone ? ' feed-item-done' : ''}`}>
            <div className="feed-bar" style={{ background: color }} />
            <div className="feed-content">
              <div className="feed-row-top">
                <span className="feed-agent-label" style={{ color }}>{label}</span>
                {log.ts && <span className="feed-time">{formatTime(log.ts)}</span>}
              </div>
              <div className="feed-message">{message}</div>
            </div>
          </div>
        )
      })}

      <div ref={bottomRef} />
    </div>
  )
}
