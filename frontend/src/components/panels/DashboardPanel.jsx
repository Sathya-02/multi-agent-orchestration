import '../../styles/App.css'

export default function DashboardPanel({ stats, currentModel, onClose }) {
  const cpu  = stats?.cpu_percent ?? 0
  const ram  = stats?.memory_percent ?? 0
  const ramU = stats?.memory_used_gb?.toFixed(1) ?? '?'
  const ramT = stats?.memory_total_gb?.toFixed(1) ?? '?'
  const gpu  = stats?.gpu_percent ?? null
  const uptime = stats?.uptime_seconds
    ? (() => { const s = stats.uptime_seconds; const h = Math.floor(s/3600); const m = Math.floor((s%3600)/60); return `${h}h ${m}m` })()
    : '—'

  return (
    <div className="overlay-panel dashboard-panel">
      <div className="overlay-header">
        <span>📊 System Dashboard</span>
        <button className="overlay-close" onClick={onClose}>✕</button>
      </div>
      <div className="dashboard-body">
        <div className="dash-section">
          <div className="dash-label">MODEL</div>
          <div className="dash-value" style={{ fontSize: '0.82rem', wordBreak: 'break-all' }}>{currentModel}</div>
        </div>
        <div className="dash-section">
          <div className="dash-label">UPTIME</div>
          <div className="dash-value">{uptime}</div>
        </div>
        <div className="dash-section">
          <div className="dash-label">CPU</div>
          <div className="dash-value">{cpu.toFixed(1)}%</div>
          <div className="dash-bar-bg"><div className="dash-bar-fill" style={{ width: `${Math.min(cpu,100)}%`, background: cpu > 80 ? 'var(--error)' : 'var(--accent)' }} /></div>
        </div>
        <div className="dash-section">
          <div className="dash-label">RAM — {ramU} / {ramT} GB</div>
          <div className="dash-value">{ram.toFixed(1)}%</div>
          <div className="dash-bar-bg"><div className="dash-bar-fill" style={{ width: `${Math.min(ram,100)}%`, background: ram > 85 ? 'var(--error)' : '#a78bfa' }} /></div>
        </div>
        {gpu !== null && (
          <div className="dash-section">
            <div className="dash-label">GPU</div>
            <div className="dash-value">{gpu.toFixed(1)}%</div>
            <div className="dash-bar-bg"><div className="dash-bar-fill" style={{ width: `${Math.min(gpu,100)}%`, background: '#34d399' }} /></div>
          </div>
        )}
        {stats?.jobs_completed != null && (
          <div className="dash-section">
            <div className="dash-label">JOBS COMPLETED</div>
            <div className="dash-value">{stats.jobs_completed}</div>
          </div>
        )}
        {stats?.active_agents != null && (
          <div className="dash-section">
            <div className="dash-label">ACTIVE AGENTS</div>
            <div className="dash-value">{stats.active_agents}</div>
          </div>
        )}
      </div>
    </div>
  )
}
