import { MODES } from '../utils/constants'
import ActivityFeed from './ActivityFeed'
import AgentCard    from './AgentCard'

/**
 * SidePanel
 * Left column containing: mode selector, topic/query input, run button,
 * uploaded-file selector (file mode), agent cards, activity feed, and result.
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
      {/* Mode selector */}
      <div className="mode-selector">
        {MODES.map(m => (
          <button
            key={m.id}
            className={`mode-btn ${mode === m.id ? 'active' : ''}`}
            onClick={() => setMode(m.id)}
            disabled={running}
          >
            <span className="mode-label">{m.label}</span>
            <span className="mode-desc">{m.desc}</span>
          </button>
        ))}
      </div>

      {/* Topic / Query input */}
      <div className="topic-row">
        <textarea
          className="topic-input"
          placeholder={mode === 'query' ? 'Ask a question or give a task…' : 'Enter research topic…'}
          value={topic}
          onChange={e => setTopic(e.target.value)}
          disabled={running}
          rows={3}
        />
      </div>

      {/* File mode — file picker shortcut */}
      {mode === 'file' && (
        <div className="file-mode-row">
          <button className="nav-btn" onClick={() => setShowUploadPanel(true)}>
            📎 Select files ({selectedFiles.length} selected)
          </button>
        </div>
      )}

      {/* Run button */}
      <button
        className={`run-btn ${running ? 'running' : ''}`}
        onClick={handleRun}
        disabled={running || !topic.trim()}
      >
        {running ? (
          <><span className="spinner" /> Running…</>
        ) : (
          '▶ Run'
        )}
      </button>

      {/* Agent cards — pass full agent object; AgentCard handles both APIs */}
      {agents.length > 0 && (
        <div className="agent-cards">
          {agents.map(agent => (
            <AgentCard
              key={agent.id}
              agent={agent}
              active={activeAgent === agent.id}
              lastMessage={lastMessages[agent.id]}
            />
          ))}
        </div>
      )}

      {/* Activity feed */}
      <ActivityFeed logs={logs} onClear={() => setLogs([])} />

      {/* Result / Download */}
      {result && (
        <div className="result-box">
          <div className="result-header">
            <span>✅ Report ready</span>
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
