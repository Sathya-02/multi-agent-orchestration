/**
 * SettingsPanel.jsx
 *
 * Tabs: Telegram | Self-Improve | Best Practices | Proposals | Web Search
 *
 * Props (all from App.jsx):
 *   settingsTab / setSettingsTab
 *   tgConfig / setTgConfig / tgSaving / tgTesting / tgTestResult / tgBotSet
 *   handleSaveTelegram / handleTestTelegram
 *   siConfig / setSiConfig / siSaving / siRunning
 *   handleSaveSiConfig / handleRunImprover
 *   bestPractices / proposals / improvLog
 *   wsConfig / setWsConfig / wsSaving / wsTesting / wsTestResult
 *   wsTestQuery / setWsTestQuery
 *   handleSaveWsConfig / handleTestWsProviders / handleRunWsQuery
 *   onClose
 */
import { useEffect, useState } from 'react'
import '../../styles/App.css'
import { useAuth } from '../../auth.jsx'
import { can } from '../../rbac.js'

const API_URL = window.__API_URL__ || '/api'

export default function SettingsPanel({
  settingsTab, setSettingsTab,
  tgConfig, setTgConfig, tgSaving, tgTesting, tgTestResult, tgBotSet,
  handleSaveTelegram, handleTestTelegram,
  siConfig, setSiConfig, siSaving, siRunning,
  handleSaveSiConfig, handleRunImprover,
  bestPractices, proposals, improvLog,
  wsConfig, setWsConfig, wsSaving, wsTesting, wsTestResult,
  wsTestQuery, setWsTestQuery,
  handleSaveWsConfig, handleTestWsProviders, handleRunWsQuery,
  onClose,
}) {
  const { user } = useAuth()
  const canEdit = can(user, 'edit_settings')
  const [tab, setTabLocal] = useState(settingsTab || 'telegram')
  const [bpText, setBpText] = useState(bestPractices || '')
  const [bpSaving, setBpSaving] = useState(false)

  const setTab = (t) => { setTabLocal(t); setSettingsTab?.(t) }

  useEffect(() => { if (settingsTab) setTabLocal(settingsTab) }, [settingsTab])
  useEffect(() => { setBpText(bestPractices || '') }, [bestPractices])

  const TABS = [
    { key: 'telegram',  label: '📨 Telegram' },
    { key: 'si',        label: '🔬 Self-Improve' },
    { key: 'bp',        label: '📋 Best Practices' },
    { key: 'proposals', label: '💡 Proposals' },
    { key: 'history',   label: '🧬 Evolution' },
    { key: 'websearch', label: '🔍 Web Search' },
  ]

  const ReadonlyBanner = () => (
    <div style={styles.banner}>
      🔒 Settings are read-only for your role. Contact an Admin to make changes.
    </div>
  )

  const Row = ({ label, children, hint }) => (
    <div className="tg-config-row" style={{ flexDirection: 'column', alignItems: 'flex-start', gap: 4 }}>
      <div className="tg-label" style={{ fontWeight: 600 }}>{label}</div>
      {hint && <div style={styles.hint}>{hint}</div>}
      {children}
    </div>
  )

  const Toggle = ({ value, onChange, disabled }) => (
    <button
      className={`si-toggle ${value ? 'on' : 'off'}`}
      disabled={disabled}
      onClick={() => !disabled && onChange(!value)}>
      {value ? '🟢 On' : '🔴 Off'}
    </button>
  )

  const handleSaveBp = async () => {
    setBpSaving(true)
    try {
      await fetch(`${API_URL}/self-improver/best-practices`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: bpText }),
      })
    } catch {}
    finally { setBpSaving(false) }
  }

  // ── Structured proposals (loaded from /proposals/pending) ──────────────────
  const [localProposals, setLocalProposals] = useState([])
  const [proposalsLoading, setProposalsLoading] = useState(false)

  const loadPendingProposals = async () => {
    setProposalsLoading(true)
    try {
      const r = await fetch(`${API_URL}/self-improver/proposals/pending`)
      if (r.ok) {
        const d = await r.json()
        if (Array.isArray(d)) setLocalProposals(d)
      }
    } catch {}
    finally { setProposalsLoading(false) }
  }

  useEffect(() => {
    if (tab === 'proposals') loadPendingProposals()
  }, [tab])

  const handleApprove = async (id) => {
    try {
      const r = await fetch(`${API_URL}/self-improver/proposals/${id}/approve`, { method: 'POST' })
      const d = await r.json()
      if (d.ok) setLocalProposals(prev => prev.filter(p => p.id !== id))
    } catch {}
  }

  const handleReject = async (id) => {
    try {
      await fetch(`${API_URL}/self-improver/proposals/${id}/reject`, { method: 'POST' })
      setLocalProposals(prev => prev.filter(p => p.id !== id))
    } catch {}
  }

  // ── Evolution history ──────────────────────────────────────────────────────
  const [evoHistory, setEvoHistory]     = useState([])
  const [evoFilter,  setEvoFilter]      = useState('')
  const [evoLoading, setEvoLoading]     = useState(false)

  const loadEvoHistory = async (agentId = '') => {
    setEvoLoading(true)
    try {
      const url = agentId
        ? `${API_URL}/self-improver/evolution-history?agent_id=${encodeURIComponent(agentId)}`
        : `${API_URL}/self-improver/evolution-history`
      const r = await fetch(url)
      if (r.ok) {
        const d = await r.json()
        if (Array.isArray(d)) setEvoHistory(d.slice().reverse())
      }
    } catch {}
    finally { setEvoLoading(false) }
  }

  useEffect(() => {
    if (tab === 'history') loadEvoHistory(evoFilter)
  }, [tab])

  return (
    <div className="overlay-panel settings-panel">
      <div className="overlay-header">
        <span>⚙️ Settings</span>
        <button className="overlay-close" onClick={onClose}>✕</button>
      </div>

      <div className="agent-tabs">
        {TABS.map(t => (
          <button key={t.key}
            className={`agent-tab${tab === t.key ? ' active' : ''}`}
            onClick={() => setTab(t.key)}>{t.label}</button>
        ))}
      </div>

      {/* ═══════════════ TELEGRAM ═══════════════ */}
      {tab === 'telegram' && (
        <div className="settings-body">
          {!canEdit && <ReadonlyBanner />}

          <Row label="Bot Token" hint="Get from @BotFather on Telegram.">
            <input className="topic-input" type="password"
              value={tgConfig?.bot_token || ''}
              disabled={!canEdit}
              onChange={e => canEdit && setTgConfig(p => ({ ...p, bot_token: e.target.value }))}
              placeholder="123456:ABC…" />
          </Row>

          <Row label="Allowed Chat IDs" hint="Comma-separated chat IDs that can send commands.">
            <input className="topic-input"
              value={tgConfig?.allowed_chat_ids || ''}
              disabled={!canEdit}
              onChange={e => canEdit && setTgConfig(p => ({ ...p, allowed_chat_ids: e.target.value }))}
              placeholder="-100123, 456789" />
          </Row>

          <Row label="Notify Chat ID" hint="Chat ID where the bot sends job completion alerts.">
            <input className="topic-input"
              value={tgConfig?.notify_chat_id || ''}
              disabled={!canEdit}
              onChange={e => canEdit && setTgConfig(p => ({ ...p, notify_chat_id: e.target.value }))}
              placeholder="-100…" />
          </Row>

          <div className="si-row" style={{ marginTop: 6 }}>
            <span className="si-label">Enabled</span>
            <Toggle value={tgConfig?.enabled} disabled={!canEdit}
              onChange={v => setTgConfig(p => ({ ...p, enabled: v }))} />
          </div>

          {canEdit && (
            <div style={{ display: 'flex', gap: 8, marginTop: 12, flexWrap: 'wrap' }}>
              <button className="run-btn" onClick={handleSaveTelegram} disabled={tgSaving}>
                {tgSaving ? '⟳ Saving…' : '💾 Save Config'}
              </button>
              <button className="run-btn" style={{ background: 'rgba(99,102,241,0.15)' }}
                onClick={handleTestTelegram} disabled={tgTesting}>
                {tgTesting ? '⟳ Testing…' : '🧪 Send Test Message'}
              </button>
            </div>
          )}

          {tgTestResult && (
            <div style={{
              marginTop: 10, padding: '8px 12px', borderRadius: 7, fontSize: 12,
              whiteSpace: 'pre-wrap',
              background: tgTestResult.startsWith('✅') ? 'rgba(34,197,94,0.08)' : 'rgba(239,68,68,0.08)',
              border: `1px solid ${tgTestResult.startsWith('✅') ? 'rgba(34,197,94,0.3)' : 'rgba(239,68,68,0.3)'}`,
              color: tgTestResult.startsWith('✅') ? '#86efac' : '#fca5a5',
            }}>{tgTestResult}</div>
          )}

          {tgBotSet && (
            <div style={{ marginTop: 8, fontSize: 11, color: 'var(--tx-secondary)' }}>
              ✅ Bot token is configured
            </div>
          )}
        </div>
      )}

      {/* ═══════════════ SELF-IMPROVE ═══════════════ */}
      {tab === 'si' && (
        <div className="settings-body">
          {!canEdit && <ReadonlyBanner />}

          <div className="si-row">
            <span className="si-label">Self-Improvement Enabled</span>
            <Toggle value={siConfig?.enabled} disabled={!canEdit}
              onChange={v => setSiConfig(p => ({ ...p, enabled: v }))} />
          </div>

          <Row label="Interval (hours)" hint="How often to run an auto-improvement cycle.">
            <input className="topic-input" type="number" min={1} max={168}
              value={siConfig?.interval_hours ?? 6}
              disabled={!canEdit}
              onChange={e => canEdit && setSiConfig(p => ({ ...p, interval_hours: +e.target.value }))} />
          </Row>

          <Row label="Min confidence threshold" hint="Only process proposals with confidence ≥ this (0–1).">
            <input className="topic-input" type="number" min={0} max={1} step={0.05}
              value={siConfig?.min_confidence ?? 0.7}
              disabled={!canEdit}
              onChange={e => canEdit && setSiConfig(p => ({ ...p, min_confidence: +e.target.value }))} />
          </Row>

          <Row label="Auto-apply threshold" hint="Confidence ≥ this → SKILLS.md patched immediately without human review.">
            <input className="topic-input" type="number" min={0} max={1} step={0.01}
              value={siConfig?.auto_apply_threshold ?? 0.88}
              disabled={!canEdit}
              onChange={e => canEdit && setSiConfig(p => ({ ...p, auto_apply_threshold: +e.target.value }))} />
          </Row>

          <Row label="Model override" hint="Force a specific model for SI (leave blank to use active model).">
            <input className="topic-input"
              value={siConfig?.model_override || ''}
              disabled={!canEdit}
              onChange={e => canEdit && setSiConfig(p => ({ ...p, model_override: e.target.value }))}
              placeholder="e.g. llama3:8b (optional)" />
          </Row>

          <div className="si-row">
            <span className="si-label">Auto-apply safe proposals</span>
            <Toggle value={siConfig?.auto_apply_safe} disabled={!canEdit}
              onChange={v => setSiConfig(p => ({ ...p, auto_apply_safe: v }))} />
          </div>

          <div className="si-row">
            <span className="si-label">Notify via Telegram</span>
            <Toggle value={siConfig?.notify_telegram} disabled={!canEdit}
              onChange={v => setSiConfig(p => ({ ...p, notify_telegram: v }))} />
          </div>

          {canEdit && (
            <div style={{ display: 'flex', gap: 8, marginTop: 12, flexWrap: 'wrap' }}>
              <button className="run-btn" onClick={handleSaveSiConfig} disabled={siSaving}>
                {siSaving ? '⟳ Saving…' : '💾 Save Config'}
              </button>
              <button className="run-btn" style={{ background: 'rgba(34,197,94,0.12)' }}
                onClick={handleRunImprover} disabled={siRunning}>
                {siRunning ? '⟳ Running…' : '▶ Run Now'}
              </button>
            </div>
          )}

          {improvLog && (
            <>
              <div style={{ marginTop: 14, marginBottom: 6, fontSize: 12, fontWeight: 600, color: 'var(--tx-secondary)' }}>
                📜 Recent improvement log
              </div>
              <textarea className="topic-input" readOnly rows={8}
                style={{ fontSize: 11, fontFamily: 'monospace', opacity: 0.8 }}
                value={typeof improvLog === 'string' ? improvLog : JSON.stringify(improvLog, null, 2)} />
            </>
          )}
        </div>
      )}

      {/* ═══════════════ BEST PRACTICES ═══════════════ */}
      {tab === 'bp' && (
        <div className="settings-body">
          {!canEdit && <ReadonlyBanner />}
          <div style={{ fontSize: 12, color: 'var(--tx-secondary)', marginBottom: 8 }}>
            System guidelines injected into every agent's context window.
          </div>
          <textarea className="topic-input"
            value={bpText}
            disabled={!canEdit}
            onChange={e => canEdit && setBpText(e.target.value)}
            rows={16}
            placeholder="Enter best practices / system guidelines…" />
          {canEdit && (
            <button className="run-btn" style={{ marginTop: 8 }}
              onClick={handleSaveBp} disabled={bpSaving}>
              {bpSaving ? '⟳ Saving…' : '💾 Save Best Practices'}
            </button>
          )}
        </div>
      )}

      {/* ═══════════════ PROPOSALS (structured human-in-loop) ═══════════════ */}
      {tab === 'proposals' && (
        <div className="settings-body">
          {!canEdit && <ReadonlyBanner />}

          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
            <div style={{ fontSize: 12, color: 'var(--tx-secondary)' }}>
              Proposals are queued when confidence is 0.70–0.87. High-confidence (≥ 0.88) changes are applied automatically.
            </div>
            <button className="agent-action-btn" onClick={loadPendingProposals} disabled={proposalsLoading}
              style={{ fontSize: 11, padding: '3px 10px' }}>
              {proposalsLoading ? '⟳' : '↻ Refresh'}
            </button>
          </div>

          {proposalsLoading ? (
            <div style={{ textAlign: 'center', color: 'var(--tx-secondary)', padding: 20 }}>Loading…</div>
          ) : localProposals.length === 0 ? (
            <div className="empty-hint">
              <div style={{ fontSize: 32, marginBottom: 8 }}>🧬</div>
              No pending evolution proposals.
              <div style={{ fontSize: 11, color: 'var(--tx-secondary)', marginTop: 4 }}>
                Proposals appear after each job run when the LLM detects improvement opportunities.
              </div>
            </div>
          ) : (
            localProposals.map(p => (
              <div key={p.id} style={styles.proposalCard}>
                {/* Header row */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <div>
                    <span style={{ fontWeight: 700, fontSize: 13 }}>{p.agent_label || p.agent_id}</span>
                    <span style={{ fontSize: 11, color: 'var(--tx-secondary)', marginLeft: 6 }}>({p.agent_id})</span>
                  </div>
                  <div style={{
                    fontSize: 11, padding: '2px 8px', borderRadius: 12,
                    background: p.confidence >= 0.85 ? 'rgba(34,197,94,0.12)' : 'rgba(234,179,8,0.12)',
                    color:      p.confidence >= 0.85 ? '#86efac' : '#fde68a',
                    fontWeight: 600,
                  }}>
                    {((p.confidence || 0) * 100).toFixed(0)}% confidence
                  </div>
                </div>

                {/* Fields being patched */}
                <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginTop: 6 }}>
                  {Object.keys(p.patches || {}).map(f => (
                    <span key={f} style={{
                      fontSize: 10, padding: '1px 7px', borderRadius: 9,
                      background: 'rgba(99,102,241,0.15)', color: '#c4b5fd',
                    }}>{f}</span>
                  ))}
                </div>

                {/* Reason */}
                <div style={{ fontSize: 12, color: 'var(--tx-secondary)', marginTop: 6 }}>
                  {p.reason}
                </div>

                {/* Diff preview per field */}
                {Object.entries(p.patches || {}).map(([field, val]) => (
                  <details key={field} style={{ marginTop: 6 }}>
                    <summary style={{ fontSize: 11, cursor: 'pointer', color: 'var(--tx-secondary)', userSelect: 'none' }}>
                      📄 View proposed <strong>{field}</strong>
                    </summary>
                    <pre style={{
                      fontSize: 10, marginTop: 4, padding: '6px 10px', borderRadius: 5,
                      background: 'rgba(0,0,0,0.25)', whiteSpace: 'pre-wrap', overflowX: 'auto',
                      color: '#e2e8f0',
                    }}>{typeof val === 'object' ? JSON.stringify(val, null, 2) : val}</pre>
                  </details>
                ))}

                {/* Job context */}
                {p.job_context?.topic && (
                  <div style={{ fontSize: 10, color: 'var(--tx-secondary)', marginTop: 5 }}>
                    🎯 Triggered by: "{String(p.job_context.topic).slice(0, 60)}"
                  </div>
                )}

                {/* Trigger + timestamp */}
                <div style={{ fontSize: 10, color: 'var(--tx-secondary)', marginTop: 2 }}>
                  {p.trigger} · {p.created_at ? new Date(p.created_at).toLocaleString() : ''}
                </div>

                {/* Action buttons */}
                {canEdit && (
                  <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
                    <button className="run-btn"
                      style={{ fontSize: 12, padding: '4px 14px', background: 'rgba(34,197,94,0.15)' }}
                      onClick={() => handleApprove(p.id)}>
                      ✅ Approve &amp; Apply to SKILLS.md
                    </button>
                    <button className="agent-action-btn danger"
                      style={{ fontSize: 12 }}
                      onClick={() => handleReject(p.id)}>
                      ✕ Reject
                    </button>
                  </div>
                )}
              </div>
            ))
          )}
        </div>
      )}

      {/* ═══════════════ EVOLUTION HISTORY ═══════════════ */}
      {tab === 'history' && (
        <div className="settings-body">
          <div style={{ display: 'flex', gap: 8, marginBottom: 10, alignItems: 'center' }}>
            <input className="topic-input" style={{ flex: 1 }}
              value={evoFilter}
              onChange={e => setEvoFilter(e.target.value)}
              placeholder="Filter by agent ID (leave blank for all)" />
            <button className="run-btn" style={{ fontSize: 12, padding: '4px 12px' }}
              onClick={() => loadEvoHistory(evoFilter)} disabled={evoLoading}>
              {evoLoading ? '⟳' : '🔍 Load'}
            </button>
          </div>

          {evoLoading ? (
            <div style={{ textAlign: 'center', color: 'var(--tx-secondary)', padding: 20 }}>Loading…</div>
          ) : evoHistory.length === 0 ? (
            <div className="empty-hint">
              <div style={{ fontSize: 28, marginBottom: 6 }}>📜</div>
              No evolution history yet.
              <div style={{ fontSize: 11, color: 'var(--tx-secondary)', marginTop: 4 }}>
                History records appear after each SKILLS.md change — auto-applied or human-approved.
              </div>
            </div>
          ) : (
            evoHistory.map((h, i) => (
              <div key={i} style={{ ...styles.proposalCard, marginBottom: 6 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div>
                    <span style={{ fontWeight: 600, fontSize: 12 }}>{h.agent_id}</span>
                    <span style={{
                      fontSize: 10, marginLeft: 8, padding: '1px 7px', borderRadius: 9,
                      background: h.source === 'human_approved'
                        ? 'rgba(34,197,94,0.12)' : 'rgba(99,102,241,0.12)',
                      color: h.source === 'human_approved' ? '#86efac' : '#c4b5fd',
                    }}>{h.source === 'human_approved' ? '✅ human approved' : '🤖 auto-applied'}</span>
                  </div>
                  <div style={{ fontSize: 10, color: 'var(--tx-secondary)' }}>
                    {h.ts ? new Date(h.ts).toLocaleString() : ''}
                  </div>
                </div>
                <div style={{ fontSize: 11, marginTop: 4 }}>
                  <strong style={{ color: '#c4b5fd' }}>{h.field}</strong>
                  <span style={{ color: 'var(--tx-secondary)', marginLeft: 8 }}>{h.reason?.slice(0, 120)}</span>
                </div>
                {h.snippet && (
                  <div style={{
                    fontSize: 10, marginTop: 4, padding: '4px 8px', borderRadius: 4,
                    background: 'rgba(0,0,0,0.2)', color: '#e2e8f0', whiteSpace: 'pre-wrap',
                  }}>{h.snippet.slice(0, 200)}</div>
                )}
              </div>
            ))
          )}
        </div>
      )}

      {/* ═══════════════ WEB SEARCH ═══════════════ */}
      {tab === 'websearch' && (
        <div className="settings-body">
          {!canEdit && <ReadonlyBanner />}

          <div className="si-row">
            <span className="si-label">Web Search Enabled</span>
            <Toggle value={wsConfig?.enabled} disabled={!canEdit}
              onChange={v => setWsConfig(p => ({ ...p, enabled: v }))} />
          </div>

          <Row label="Provider" hint="auto = try each provider in order until one succeeds.">
            <select className="topic-input" value={wsConfig?.provider || 'auto'}
              disabled={!canEdit}
              onChange={e => canEdit && setWsConfig(p => ({ ...p, provider: e.target.value }))}>
              <option value="auto">auto</option>
              <option value="duckduckgo">DuckDuckGo</option>
              <option value="brave">Brave</option>
              <option value="serpapi">SerpAPI</option>
              <option value="mock">mock (offline testing)</option>
            </select>
          </Row>

          <Row label="Max results">
            <input className="topic-input" type="number" min={1} max={20}
              value={wsConfig?.max_results ?? 5}
              disabled={!canEdit}
              onChange={e => canEdit && setWsConfig(p => ({ ...p, max_results: +e.target.value }))} />
          </Row>

          <Row label="Timeout (seconds)">
            <input className="topic-input" type="number" min={1} max={60}
              value={wsConfig?.timeout_seconds ?? 10}
              disabled={!canEdit}
              onChange={e => canEdit && setWsConfig(p => ({ ...p, timeout_seconds: +e.target.value }))} />
          </Row>

          <Row label="Region" hint="e.g. wt-wt (worldwide), us-en, gb-en">
            <input className="topic-input"
              value={wsConfig?.region || 'wt-wt'}
              disabled={!canEdit}
              onChange={e => canEdit && setWsConfig(p => ({ ...p, region: e.target.value }))}
              placeholder="wt-wt" />
          </Row>

          <div className="si-row">
            <span className="si-label">Safe search</span>
            <Toggle value={wsConfig?.safe_search} disabled={!canEdit}
              onChange={v => setWsConfig(p => ({ ...p, safe_search: v }))} />
          </div>

          <div className="si-row">
            <span className="si-label">Fallback to mock on failure</span>
            <Toggle value={wsConfig?.fallback_to_mock} disabled={!canEdit}
              onChange={v => setWsConfig(p => ({ ...p, fallback_to_mock: v }))} />
          </div>

          {canEdit && (
            <div style={{ display: 'flex', gap: 8, marginTop: 12, flexWrap: 'wrap' }}>
              <button className="run-btn" onClick={handleSaveWsConfig} disabled={wsSaving}>
                {wsSaving ? '⟳ Saving…' : '💾 Save Config'}
              </button>
              <button className="run-btn" style={{ background: 'rgba(99,102,241,0.15)' }}
                onClick={handleTestWsProviders} disabled={wsTesting}>
                {wsTesting ? '⟳ Testing…' : '🧪 Test Providers'}
              </button>
            </div>
          )}

          <div style={{ marginTop: 14 }}>
            <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 6 }}>🔎 Test a query</div>
            <div style={{ display: 'flex', gap: 8 }}>
              <input className="topic-input" style={{ flex: 1 }}
                value={wsTestQuery || ''}
                onChange={e => setWsTestQuery?.(e.target.value)}
                placeholder="e.g. weather in Tokyo"
                onKeyDown={e => e.key === 'Enter' && handleRunWsQuery?.()} />
              <button className="run-btn" onClick={handleRunWsQuery} disabled={wsTesting}>
                {wsTesting ? '⟳' : '▶ Run'}
              </button>
            </div>
          </div>

          {wsTestResult && (
            <div style={{
              marginTop: 10, padding: '8px 12px', borderRadius: 7, fontSize: 12,
              whiteSpace: 'pre-wrap', maxHeight: 180, overflowY: 'auto',
              background: wsTestResult.startsWith('❌') ? 'rgba(239,68,68,0.08)' : 'rgba(34,197,94,0.06)',
              border: `1px solid ${wsTestResult.startsWith('❌') ? 'rgba(239,68,68,0.3)' : 'rgba(34,197,94,0.2)'}`,
              color: wsTestResult.startsWith('❌') ? '#fca5a5' : 'var(--tx-primary)',
            }}>{wsTestResult}</div>
          )}
        </div>
      )}
    </div>
  )
}

const styles = {
  banner: {
    margin: '0 0 10px', padding: '8px 12px', borderRadius: 7,
    background: 'rgba(99,102,241,0.08)', border: '1px solid rgba(99,102,241,0.2)',
    color: '#a5b4fc', fontSize: 12,
  },
  hint: {
    fontSize: 11, color: 'var(--tx-secondary)', marginBottom: 2,
  },
  proposalCard: {
    padding: '10px 14px', borderRadius: 8, marginBottom: 10,
    background: 'rgba(255,255,255,0.03)', border: '1px solid var(--bd-subtle)',
  },
}
