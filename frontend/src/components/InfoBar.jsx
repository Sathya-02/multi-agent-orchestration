import '../styles/App.css'
import { PHASE_ORDER, PHASE_META } from '../utils/constants'

/**
 * InfoBar
 * Slim status strip below the header: connection pill, model, phase
 * progress stepper, and the Board Room (3-D view) toggle.
 */
export default function InfoBar({
  connected, currentModel, currentPhase, running,
  stats, jobId, show3DRoom, setShow3DRoom, modelBadgeColor,
}) {
  const currentPhaseIndex = currentPhase ? PHASE_ORDER.indexOf(currentPhase) : -1

  return (
    <div className="info-bar">
      {/* ── Left cluster ─────────────────────────────────── */}
      <div className="info-bar-left">

        <span className={`info-pill conn-pill ${connected ? 'conn-ok' : 'conn-bad'}`}>
          <span className="info-pill-value">{connected ? '● Connected' : '○ Disconnected'}</span>
        </span>

        {currentModel && (
          <span className="info-pill model-pill">
            <span className="info-pill-label">🧠</span>
            <span className="info-pill-value" style={{ color: modelBadgeColor(), fontFamily: 'var(--mono)', fontSize: 10 }}>
              {currentModel}
            </span>
          </span>
        )}

        {stats && (
          <span className="info-pill">
            <span className="info-pill-label">RAM</span>
            <span className="info-pill-value">{stats.ram_used_gb}GB</span>
            <span className="info-pill-label" style={{ marginLeft: 6 }}>CPU</span>
            <span className="info-pill-value">{stats.cpu_pct}%</span>
          </span>
        )}

        {jobId && (
          <span className="info-pill">
            <span className="info-pill-label">Job</span>
            <span className="info-pill-value">#{jobId} {running ? '⏳' : '✓'}</span>
          </span>
        )}
      </div>

      {/* ── Phase stepper ─────────────────────────────────── */}
      {(running || currentPhase) && (
        <div className="phase-bar">
          {PHASE_ORDER.map((phase, i) => {
            const meta   = PHASE_META[phase]
            const done   = i < currentPhaseIndex
            const active = i === currentPhaseIndex
            return (
              <div key={phase} className={`phase-step${active ? ' active' : ''}${done ? ' done' : ''}`}>
                <span className="phase-icon">{meta.icon}</span>
                <span className="phase-name">{meta.name}</span>
                {i < PHASE_ORDER.length - 1 && <span className="phase-arrow">›</span>}
              </div>
            )
          })}
        </div>
      )}

      {/* ── Right cluster ─────────────────────────────────── */}
      <div className="info-bar-right">
        <button
          className={`nav-btn boardroom-btn${show3DRoom ? ' active' : ''}`}
          onClick={() => setShow3DRoom(v => !v)}
          title="Toggle 3-D Agent Office"
        >
          🏛️ Board Room
        </button>
      </div>
    </div>
  )
}
