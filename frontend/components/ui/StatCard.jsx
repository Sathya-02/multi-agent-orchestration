export default function StatCard({ label, value, sub, pct, color }) {
  return (
    <div className="stat-card">
      <div className="stat-label">{label}</div>
      <div className="stat-value" style={{ color }}>{value}</div>
      <div className="stat-sub">{sub}</div>
      {pct != null && (
        <div className="stat-bar-bg">
          <div className="stat-bar-fill"
            style={{ width: `${Math.min(pct,100)}%`, background: color }} />
        </div>
      )}
    </div>
  )
}