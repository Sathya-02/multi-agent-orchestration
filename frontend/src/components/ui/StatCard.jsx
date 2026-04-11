/**
 * Reusable stat card used in the Dashboard panel.
 *
 * Props:
 *   label   {string}  - card title
 *   value   {string|number} - primary displayed value
 *   sub     {string}  - secondary line beneath the value
 *   pct     {number}  - 0-100 fill percentage for the progress bar (optional)
 *   color   {string}  - CSS color for the value text and bar fill
 */
export default function StatCard({ label, value, sub, pct, color = 'var(--accent)' }) {
  return (
    <div className="stat-card">
      <div className="stat-label">{label}</div>
      <div className="stat-value" style={{ color }}>
        {value ?? '—'}
      </div>
      {sub && <div className="stat-sub">{sub}</div>}
      {pct != null && (
        <div className="stat-bar-bg">
          <div
            className="stat-bar-fill"
            style={{ width: `${Math.min(Math.max(pct, 0), 100)}%`, background: color }}
          />
        </div>
      )}
    </div>
  )
}
