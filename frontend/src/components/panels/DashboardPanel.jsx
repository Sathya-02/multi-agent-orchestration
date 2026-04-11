import '../../styles/App.css'

export default function DashboardPanel({ stats, currentModel, onClose }) {
  const cpu  = stats?.cpu_percent    ?? 0
  const ram  = stats?.memory_percent ?? 0
  const ramU = stats?.memory_used_gb?.toFixed(1)   ?? '?'
  const ramT = stats?.memory_total_gb?.toFixed(1)  ?? '?'
  const gpu  = stats?.gpu_percent    ?? null

  const uptime = stats?.uptime_seconds
    ? (() => {
        const s = stats.uptime_seconds
        const h = Math.floor(s / 3600)
        const m = Math.floor((s % 3600) / 60)
        return `${h}h ${m}m`
      })()
    : '—'

  return (
    <div className="overlay-panel dashboard-panel">
      <div className="overlay-header">
        <span>📊 System Dashboard</span>
        <button className="overlay-close" onClick={onClose}>✕</button>
      </div>

      <div className="dashboard-grid">
        {/* Model */}
        <div className="stat-card" style={{ gridColumn:'1 / -1' }}>
          <div className="stat-label">Active Model</div>
          <div className="stat-value" style={{ fontSize:'0.95rem', color:'var(--accent)', wordBreak:'break-all' }}>
            {typeof currentModel === 'string' ? currentModel : '—'}
          </div>
        </div>

        {/* Uptime */}
        <div className="stat-card">
          <div className="stat-label">Uptime</div>
          <div className="stat-value" style={{ color:'var(--tx-secondary)' }}>{uptime}</div>
        </div>

        {/* CPU */}
        <div className="stat-card">
          <div className="stat-label">CPU</div>
          <div className="stat-value" style={{ color: cpu > 80 ? 'var(--danger)' : 'var(--accent)' }}>
            {cpu.toFixed(1)}%
          </div>
          <div className="stat-bar-bg">
            <div className="stat-bar-fill" style={{ width:`${Math.min(cpu,100)}%`, background: cpu > 80 ? 'var(--danger)' : 'var(--accent)' }} />
          </div>
        </div>

        {/* RAM */}
        <div className="stat-card">
          <div className="stat-label">RAM</div>
          <div className="stat-value" style={{ color:'#a78bfa' }}>{ram.toFixed(1)}%</div>
          <div className="stat-sub">{ramU} / {ramT} GB</div>
          <div className="stat-bar-bg">
            <div className="stat-bar-fill" style={{ width:`${Math.min(ram,100)}%`, background:'#a78bfa' }} />
          </div>
        </div>

        {/* GPU */}
        {gpu !== null && (
          <div className="stat-card">
            <div className="stat-label">GPU</div>
            <div className="stat-value" style={{ color:'var(--success)' }}>{gpu.toFixed(1)}%</div>
            <div className="stat-bar-bg">
              <div className="stat-bar-fill" style={{ width:`${Math.min(gpu,100)}%`, background:'var(--success)' }} />
            </div>
          </div>
        )}

        {/* Jobs completed */}
        {stats?.jobs_completed != null && (
          <div className="stat-card">
            <div className="stat-label">Jobs Done</div>
            <div className="stat-value" style={{ color:'var(--success)' }}>{stats.jobs_completed}</div>
          </div>
        )}

        {/* Active agents */}
        {stats?.active_agents != null && (
          <div className="stat-card">
            <div className="stat-label">Active Agents</div>
            <div className="stat-value" style={{ color:'var(--warning)' }}>{stats.active_agents}</div>
          </div>
        )}

        {/* Jobs running */}
        {stats?.jobs_running != null && (
          <div className="stat-card">
            <div className="stat-label">Jobs Running</div>
            <div className="stat-value" style={{ color:'var(--accent)' }}>{stats.jobs_running}</div>
          </div>
        )}
      </div>

      {/* Bottom model row */}
      <div className="dashboard-model-row">
        <span>🤖 Model:</span>
        <span style={{ fontFamily:'var(--mono)', color:'var(--tx-secondary)', fontSize:'11px' }}>
          {typeof currentModel === 'string' ? currentModel : '—'}
        </span>
      </div>
    </div>
  )
}
