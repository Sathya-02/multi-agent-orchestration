import '../styles/App.css'
import { MODES } from '../utils/constants'
import ActivityFeed from './ActivityFeed'
import AgentCard    from './AgentCard'

/**
 * SidePanel
 * Left column: mode selector, topic input, run button, agent cards,
 * activity feed, and result/download area.
 */
export default function SidePanel({
  mode, setMode,
  topic, setTopic,
  running,
  selectedFiles, setShowUploadPanel,
  handleRun,
  agents, activeAgent, lastMessages,
  logs, setLogs,
  result, reportFile, reportFormat, handleDownload,
}) {
  return (
    <div className="side-panel">

      {/* ── Mode selector ──────────────────────────────────── */}
      <div className="mode-section">
        {MODES.map(m => (
          <button
            key={m.id}
            className={`mode-btn${mode === m.id ? ' active' : ''}`}
            onClick={() => setMode(m.id)}
            disabled={running}
          >
            <span style={{ display: 'block', fontSize: 11, fontWeight: 700 }}>{m.label}</span>
            <span style={{ display: 'block', fontSize: 9, opacity: 0.6, marginTop: 2 }}>{m.desc}</span>
          </button>
        ))}
      </div>

      {/* ── Topic / Query input ────────────────────────────── */}
      <div className="topic-section">
        <div className="section-heading">Topic / Query</div>
        <textarea
          className="topic-input"
          placeholder={mode === 'query' ? 'Ask a question or give a task…' : 'Enter research topic…'}
          value={topic}
          onChange={e => setTopic(e.target.value)}
          disabled={running}
          rows={3}
        />

        {/* File mode shortcut */}
        {mode === 'file' && (
          <div style={{ marginBottom: 10 }}>
            <button className="nav-btn" style={{ width: '100%', justifyContent: 'center' }} onClick={() => setShowUploadPanel(true)}>
              📎 Select files ({selectedFiles.length} selected)
            </button>
          </div>
        )}

        <button
          className={`run-btn${running ? ' running' : ''}`}
          onClick={handleRun}
          disabled={running || !topic.trim()}
        >
          {running ? <><span className="spinner" /> Running…</> : '▶ Run'}
        </button>
      </div>

      {/* ── Agent cards ────────────────────────────────────── */}
      {agents.length > 0 && (
        <div className="agents-section">
          <div className="section-heading">Agents</div>
          <div className="agents-scroll">
            {agents.map(agent => (
              <AgentCard
                key={agent.id}
                agent={agent}
                active={activeAgent === agent.id}
                lastMessage={lastMessages[agent.id]}
              />
            ))}
          </div>
        </div>
      )}

      {/* ── Activity feed ──────────────────────────────────── */}
      <div className="feed-section">
        <div className="feed-header">
          <span className="section-heading">Activity</span>
          {logs.length > 0 && (
            <button className="feed-clear-btn" onClick={() => setLogs([])}>Clear</button>
          )}
        </div>
        <ActivityFeed logs={logs} agents={agents} />
      </div>

      {/* ── Result / Download ──────────────────────────────── */}
      {result && (
        <div className="result-box">
          <div className="result-header">
            <span className="section-heading">✅ Report ready</span>
            {reportFile && (
              <button className="download-btn" onClick={handleDownload}>
                ⬇️ Download .{reportFormat}
              </button>
            )}
          </div>
          <pre className="result-content">{result}</pre>
        </div>
      )}

    </div>
  )
}
