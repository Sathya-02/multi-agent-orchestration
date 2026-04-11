import '../../styles/App.css'

export default function DashboardPanel({ stats, currentModel, onClose }) {
  // ── Map actual /stats API field names ──────────────────────────────────
  // Backend returns: ram_pct, ram_used_gb, ram_total_gb, disk_pct,
  //   disk_used_gb, disk_total_gb, cpu_percent, active_jobs,
  //   total_jobs, tokens_in, tokens_out, tokens_last, ollama{}
  const loading = stats == null

  const cpu      = stats?.cpu_percent    ?? 0
  const ram      = stats?.ram_pct        ?? 0
  const ramU     = stats?.ram_used_gb    != null ? Number(stats.ram_used_gb).toFixed(1)  : '?'
  const ramT     = stats?.ram_total_gb   != null ? Number(stats.ram_total_gb).toFixed(1) : '?'
  const disk     = stats?.disk_pct       ?? 0
  const diskU    = stats?.disk_used_gb   != null ? Number(stats.disk_used_gb).toFixed(1)  : '?'
  const diskT    = stats?.disk_total_gb  != null ? Number(stats.disk_total_gb).toFixed(1) : '?'
  const jobsRun  = stats?.active_jobs    ?? 0
  const jobsTot  = stats?.total_jobs     ?? 0
  const tokIn    = stats?.tokens_in      ?? 0
  const tokOut   = stats?.tokens_out     ?? 0
  const tokLast  = stats?.tokens_last    ?? 0
  const ollamaModels = stats?.ollama?.model_count ?? '—'
  const ollamaModel  = stats?.ollama?.model_current ?? currentModel ?? '—'

  const fmtNum = (n) => n >= 1000 ? `${(n/1000).toFixed(1)}k` : String(n)

  if (loading) {
    return (
      <div className="overlay-panel dashboard-panel">
        <div className="overlay-header">
          <span>📊 System Dashboard</span>
          <button className="overlay-close" onClick={onClose}>✕</button>
        </div>
        <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--tx-secondary)', fontSize: '0.9rem' }}>
          ⏳ Loading stats…
        </div>
      </div>
    )
  }

  return (
    <div className="overlay-panel dashboard-panel">
      <div className="overlay-header">
        <span>📊 System Dashboard</span>
        <button className="overlay-close" onClick={onClose}>✕</button>
      </div>

      <div className="dashboard-grid">

        {/* Active Model — full width */}
        <div className="stat-card" style={{ gridColumn: '1 / -1' }}>
          <div className="stat-label">Active Model</div>
          <div className="stat-value" style={{ fontSize: '0.95rem', color: 'var(--accent)', wordBreak: 'break-all' }}>
            {typeof ollamaModel === 'string' ? ollamaModel : '—'}
          </div>
          <div className="stat-sub">Ollama models installed: {ollamaModels}</div>
        </div>

        {/* CPU */}
        <div className="stat-card">
          <div className="stat-label">CPU</div>
          <div className="stat-value" style={{ color: cpu > 80 ? 'var(--danger)' : 'var(--accent)' }}>
            {cpu.toFixed(1)}%
          </div>
          <div className="stat-bar-bg">
            <div className="stat-bar-fill" style={{
              width: `${Math.min(cpu, 100)}%`,
              background: cpu > 80 ? 'var(--danger)' : 'var(--accent)'
            }} />
          </div>
        </div>

        {/* RAM */}
        <div className="stat-card">
          <div className="stat-label">RAM</div>
          <div className="stat-value" style={{ color: '#a78bfa' }}>{ram.toFixed(1)}%</div>
          <div className="stat-sub">{ramU} / {ramT} GB</div>
          <div className="stat-bar-bg">
            <div className="stat-bar-fill" style={{ width: `${Math.min(ram, 100)}%`, background: '#a78bfa' }} />
          </div>
        </div>

        {/* Disk */}
        <div className="stat-card">
          <div className="stat-label">Disk</div>
          <div className="stat-value" style={{ color: disk > 85 ? 'var(--danger)' : 'var(--warning)' }}>
            {disk.toFixed(1)}%
          </div>
          <div className="stat-sub">{diskU} / {diskT} GB</div>
          <div className="stat-bar-bg">
            <div className="stat-bar-fill" style={{
              width: `${Math.min(disk, 100)}%`,
              background: disk > 85 ? 'var(--danger)' : 'var(--warning)'
            }} />
          </div>
        </div>

        {/* Jobs Running */}
        <div className="stat-card">
          <div className="stat-label">Jobs Running</div>
          <div className="stat-value" style={{ color: 'var(--accent)' }}>{jobsRun}</div>
          <div className="stat-sub">of {jobsTot} total</div>
        </div>

        {/* Tokens — last job */}
        <div className="stat-card">
          <div className="stat-label">Tokens (last job)</div>
          <div className="stat-value" style={{ color: '#34d399' }}>{fmtNum(tokLast)}</div>
          <div className="stat-sub">in: {fmtNum(tokIn)} · out: {fmtNum(tokOut)}</div>
        </div>

      </div>

      {/* Footer */}
      <div className="dashboard-model-row">
        <span>🤖 Model:</span>
        <span style={{ fontFamily: 'var(--mono)', color: 'var(--tx-secondary)', fontSize: '11px' }}>
          {typeof ollamaModel === 'string' ? ollamaModel : '—'}
        </span>
      </div>
    </div>
  )
}
