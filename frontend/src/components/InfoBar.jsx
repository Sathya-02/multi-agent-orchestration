import { PHASE_ORDER, PHASE_META } from '../utils/constants'

/**
 * InfoBar
 * The slim status strip below the header: connection pill, model, phase
 * progress stepper, and the Board Room (3-D view) toggle.
 */
export default function InfoBar({
  connected, currentModel, currentPhase, running,
  stats, jobId, show3DRoom, setShow3DRoom, modelBadgeColor,
}) {
  const currentPhaseIndex = currentPhase ? PHASE_ORDER.indexOf(currentPhase) : -1

  return (
    <div className="info-bar">
      {/* Left cluster */}
      <div className="info-bar-left">
        <span className={`info-pill ${connected ? 'connected' : 'disconnected'}`}>
          {connected ? '● Connected' : '○ Disconnected'}
        </span>

        {currentModel && (
          <span className="info-pill model-pill" style={{ color: modelBadgeColor() }}>
            🧠 {currentModel}
          </span>
        )}

        {stats && (
          <span className="info-pill stats-pill">
            RAM {stats.ram_used_gb}GB · CPU {stats.cpu_pct}%
          </span>
        )}

        {jobId && (
          <span className="info-pill job-pill">
            Job #{jobId} {running ? '⏳' : '✓'}
          </span>
        )}
      </div>

      {/* Phase stepper */}
      {(running || currentPhase) && (
        <div className="phase-stepper">
          {PHASE_ORDER.map((phase, i) => {
            const meta  = PHASE_META[phase]
            const done  = i < currentPhaseIndex
            const active = i === currentPhaseIndex
            return (
              <div key={phase} className={`phase-step ${active ? 'active' : ''} ${done ? 'done' : ''}`}>
                <span className="phase-icon">{meta.icon}</span>
                <span className="phase-name">{meta.name}</span>
                {i < PHASE_ORDER.length - 1 && <span className="phase-arrow">›</span>}
              </div>
            )
          })}
        </div>
      )}

      {/* Right cluster */}
      <div className="info-bar-right">
        <button
          className={`nav-btn ${show3DRoom ? 'active' : ''}`}
          onClick={() => setShow3DRoom(v => !v)}
          title="Toggle 3-D Agent Office"
        >
          🏛️ Board Room
        </button>
      </div>
    </div>
  )
}
