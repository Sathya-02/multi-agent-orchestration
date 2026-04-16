/**
 * SettingsPanel.jsx
 *
 * Tabs: Telegram | Self-Improve | Best Practices | Proposals | Evolution History | Web Search
 */
import { useEffect, useState, useCallback } from 'react'
import '../../styles/App.css'
import { useAuth } from '../../auth.jsx'
import { can } from '../../rbac.js'

const API = window.__API_URL__ || '/api'

export default function SettingsPanel({
  settingsTab, setSettingsTab,
  tgConfig, setTgConfig, tgSaving, tgTesting, tgTestResult, tgBotSet,
  handleSaveTelegram, handleTestTelegram,
  siConfig, setSiConfig, siSaving, siRunning,
  handleSaveSiConfig, handleRunImprover,
  bestPractices, improvLog,
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

  // ── Proposals state ───────────────────────────────────────────────────────
  const [proposals, setProposals]       = useState([])
  const [proposalsLoading, setProposalsLoading] = useState(false)
  const [rejectModal, setRejectModal]   = useState(null)   // proposal id being rejected
  const [rejectReason, setRejectReason] = useState('')

  // ── Evolution history state ───────────────────────────────────────────────
  const [history, setHistory]           = useState([])
  const [historyLoading, setHistoryLoading] = useState(false)
  const [historyAgent, setHistoryAgent] = useState('')

  const fetchProposals = useCallback(async () => {
    setProposalsLoading(true)
    try {
      const r = await fetch(`${API}/self-improver/proposals/pending`)
      const d = await r.json()
      setProposals(Array.isArray(d) ? d : [])
    } catch { setProposals([]) }
    finally { setProposalsLoading(false) }
  }, [])

  const fetchHistory = useCallback(async (agentFilter = '') => {
    setHistoryLoading(true)
    try {
      const url = agentFilter
        ? `${API}/self-improver/evolution-history?agent_id=${encodeURIComponent(agentFilter)}`
        : `${API}/self-improver/evolution-history`
      const r = await fetch(url)
      const d = await r.json()
      setHistory(Array.isArray(d) ? d.slice().reverse() : [])
    } catch { setHistory([]) }
    finally { setHistoryLoading(false) }
  }, [])

  useEffect(() => {
    if (tab === 'proposals') fetchProposals()
    if (tab === 'history')   fetchHistory(historyAgent)
  }, [tab])

  const handleApprove = async (id) => {
    try {
      const r = await fetch(`${API}/self-improver/proposals/${id}/approve`, { method: 'POST' })
      const d = await r.json()
      if (d.ok) setProposals(prev => prev.filter(p => p.id !== id))
      else alert('Approve failed: ' + (d.error || 'unknown error'))
    } catch (e) { alert('Network error: ' + e) }
  }

  const openRejectModal = (id) => { setRejectModal(id); setRejectReason('') }

  const handleRejectConfirm = async () => {
    if (!rejectModal) return
    try {
      await fetch(
        `${API}/self-improver/proposals/${rejectModal}/reject?reason=${encodeURIComponent(rejectReason)}`,
        { method: 'POST' }
      )
      setProposals(prev => prev.filter(p => p.id !== rejectModal))
    } catch {}
    setRejectModal(null)
  }

  const handleSaveBp = async () => {
    setBpSaving(true)
    try {
      await fetch(`${API}/self-improver/best-practices`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: bpText }),
      })
    } catch {}
    finally { setBpSaving(false) }
  }

  const TABS = [
    { key: 'telegram',  label: '📨 Telegram' },
    { key: 'si',        label: '🔬 Self-Improve' },
    { key: 'bp',        label: '📋 Best Practices' },
    { key: 'proposals', label: `💡 Proposals${proposals.length > 0 ? ` (${proposals.length})` : ''}` },
    { key: 'history',   label: '🧬 Evolution' },
    { key: 'websearch', label: '🔍 Web Search' },
  ]

  const ReadonlyBanner = () => (
    <div style={S.banner}>🔒 Settings are read-only for your role.</div>
  )
  const Row = ({ label, children, hint }) => (
    <div className="tg-config-row" style={{ flexDirection:'column', alignItems:'flex-start', gap:4 }}>
      <div className="tg-label" style={{ fontWeight:600 }}>{label}</div>
      {hint && <div style={S.hint}>{hint}</div>}
      {children}
    </div>
  )
  const Toggle = ({ value, onChange, disabled }) => (
    <button className={`si-toggle ${value ? 'on' : 'off'}`} disabled={disabled}
      onClick={() => !disabled && onChange(!value)}>
      {value ? '🟢 On' : '🔴 Off'}
    </button>
  )

  const confidenceBadge = (conf) => {
    const pct  = Math.round(conf * 100)
    const high = conf >= 0.85
    return (
      <span style={{
        fontSize:11, padding:'2px 8px', borderRadius:12,
        background: high ? 'rgba(34,197,94,0.12)' : 'rgba(234,179,8,0.12)',
        color:       high ? '#86efac'              : '#fde68a',
        fontWeight:  600,
      }}>{pct}% conf</span>
    )
  }

  const fieldChip = (f) => (
    <span key={f} style={{
      fontSize:10, padding:'1px 7px', borderRadius:9,
      background:'rgba(99,102,241,0.15)', color:'#c4b5fd',
    }}>{f}</span>
  )

  return (
    <div className="overlay-panel settings-panel">
      <div className="overlay-header">
        <span>⚙️ Settings</span>
        <button className="overlay-close" onClick={onClose}>✕</button>
      </div>

      <div className="agent-tabs">
        {TABS.map(t => (
          <button key={t.key} className={`agent-tab${tab===t.key?' active':''}`}
            onClick={() => setTab(t.key)}>{t.label}</button>
        ))}
      </div>

      {/* ═══ TELEGRAM ═══ */}
      {tab === 'telegram' && (
        <div className="settings-body">
          {!canEdit && <ReadonlyBanner />}
          <Row label="Bot Token" hint="Get from @BotFather on Telegram.">
            <input className="topic-input" type="password"
              value={tgConfig?.bot_token || ''} disabled={!canEdit}
              onChange={e => canEdit && setTgConfig(p => ({...p, bot_token: e.target.value}))}
              placeholder="123456:ABC…" />
          </Row>
          <Row label="Allowed Chat IDs" hint="Comma-separated chat IDs.">
            <input className="topic-input"
              value={tgConfig?.allowed_chat_ids || ''} disabled={!canEdit}
              onChange={e => canEdit && setTgConfig(p => ({...p, allowed_chat_ids: e.target.value}))}
              placeholder="-100123, 456789" />
          </Row>
          <Row label="Notify Chat ID" hint="Chat ID for job completion alerts.">
            <input className="topic-input"
              value={tgConfig?.notify_chat_id || ''} disabled={!canEdit}
              onChange={e => canEdit && setTgConfig(p => ({...p, notify_chat_id: e.target.value}))}
              placeholder="-100…" />
          </Row>
          <div className="si-row" style={{marginTop:6}}>
            <span className="si-label">Enabled</span>
            <Toggle value={tgConfig?.enabled} disabled={!canEdit}
              onChange={v => setTgConfig(p => ({...p, enabled: v}))} />
          </div>
          {canEdit && (
            <div style={{display:'flex', gap:8, marginTop:12, flexWrap:'wrap'}}>
              <button className="run-btn" onClick={handleSaveTelegram} disabled={tgSaving}>
                {tgSaving ? '⟳ Saving…' : '💾 Save Config'}</button>
              <button className="run-btn" style={{background:'rgba(99,102,241,0.15)'}}
                onClick={handleTestTelegram} disabled={tgTesting}>
                {tgTesting ? '⟳ Testing…' : '🧪 Send Test Message'}</button>
            </div>
          )}
          {tgTestResult && (
            <div style={tgTestResult.startsWith('✅') ? S.ok : S.err}>{tgTestResult}</div>
          )}
          {tgBotSet && <div style={{marginTop:8,fontSize:11,color:'var(--tx-secondary)'}}>✅ Bot token configured</div>}
        </div>
      )}

      {/* ═══ SELF-IMPROVE ═══ */}
      {tab === 'si' && (
        <div className="settings-body">
          {!canEdit && <ReadonlyBanner />}
          <div className="si-row">
            <span className="si-label">Self-Improvement Enabled</span>
            <Toggle value={siConfig?.enabled} disabled={!canEdit}
              onChange={v => setSiConfig(p => ({...p, enabled: v}))} />
          </div>
          <Row label="Interval (hours)" hint="How often to run a scheduled cycle.">
            <input className="topic-input" type="number" min={1} max={168}
              value={siConfig?.interval_hours ?? 6} disabled={!canEdit}
              onChange={e => canEdit && setSiConfig(p => ({...p, interval_hours: +e.target.value}))} />
          </Row>
          <Row label="Min confidence threshold" hint="Queue proposals above this value (0–1).">
            <input className="topic-input" type="number" min={0} max={1} step={0.05}
              value={siConfig?.min_confidence ?? 0.70} disabled={!canEdit}
              onChange={e => canEdit && setSiConfig(p => ({...p, min_confidence: +e.target.value}))} />
          </Row>
          <Row label="Auto-apply threshold" hint="Auto-patch SKILLS.md above this confidence (0–1).">
            <input className="topic-input" type="number" min={0} max={1} step={0.01}
              value={siConfig?.auto_apply_threshold ?? 0.88} disabled={!canEdit}
              onChange={e => canEdit && setSiConfig(p => ({...p, auto_apply_threshold: +e.target.value}))} />
          </Row>
          <Row label="Model override" hint="Force a specific model for SI cycles (optional).">
            <input className="topic-input"
              value={siConfig?.model_override || ''} disabled={!canEdit}
              onChange={e => canEdit && setSiConfig(p => ({...p, model_override: e.target.value}))}
              placeholder="e.g. llama3:8b (optional)" />
          </Row>
          <div className="si-row">
            <span className="si-label">Auto-apply safe proposals</span>
            <Toggle value={siConfig?.auto_apply_safe} disabled={!canEdit}
              onChange={v => setSiConfig(p => ({...p, auto_apply_safe: v}))} />
          </div>
          <div className="si-row">
            <span className="si-label">Notify via Telegram</span>
            <Toggle value={siConfig?.notify_telegram} disabled={!canEdit}
              onChange={v => setSiConfig(p => ({...p, notify_telegram: v}))} />
          </div>
          {canEdit && (
            <div style={{display:'flex', gap:8, marginTop:12, flexWrap:'wrap'}}>
              <button className="run-btn" onClick={handleSaveSiConfig} disabled={siSaving}>
                {siSaving ? '⟳ Saving…' : '💾 Save Config'}</button>
              <button className="run-btn" style={{background:'rgba(34,197,94,0.12)'}}
                onClick={handleRunImprover} disabled={siRunning}>
                {siRunning ? '⟳ Running…' : '▶ Run Cycle Now'}</button>
            </div>
          )}
          {improvLog && (
            <>
              <div style={{marginTop:14,marginBottom:6,fontSize:12,fontWeight:600,color:'var(--tx-secondary)'}}>📜 Recent log</div>
              <textarea className="topic-input" readOnly rows={8}
                style={{fontSize:11,fontFamily:'monospace',opacity:0.8}}
                value={typeof improvLog==='string' ? improvLog : JSON.stringify(improvLog,null,2)} />
            </>
          )}
        </div>
      )}

      {/* ═══ BEST PRACTICES ═══ */}
      {tab === 'bp' && (
        <div className="settings-body">
          {!canEdit && <ReadonlyBanner />}
          <div style={{fontSize:12,color:'var(--tx-secondary)',marginBottom:8}}>
            System guidelines injected into every agent's context window.
          </div>
          <textarea className="topic-input" value={bpText} disabled={!canEdit} rows={16}
            onChange={e => canEdit && setBpText(e.target.value)}
            placeholder="Enter best practices / system guidelines…" />
          {canEdit && (
            <button className="run-btn" style={{marginTop:8}}
              onClick={handleSaveBp} disabled={bpSaving}>
              {bpSaving ? '⟳ Saving…' : '💾 Save Best Practices'}</button>
          )}
        </div>
      )}

      {/* ═══ PROPOSALS ═══ */}
      {tab === 'proposals' && (
        <div className="settings-body">
          {!canEdit && <ReadonlyBanner />}

          <div style={{display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:10}}>
            <div style={{fontSize:12,color:'var(--tx-secondary)'}}>
              Agent evolution proposals awaiting your review.
              <br />
              <span style={{fontSize:11}}>High confidence (≥88%) proposals are auto-applied immediately.</span>
            </div>
            <button className="agent-action-btn" onClick={fetchProposals} disabled={proposalsLoading}>
              {proposalsLoading ? '⟳' : '↻ Refresh'}
            </button>
          </div>

          {proposalsLoading && <div style={{textAlign:'center',padding:20,color:'var(--tx-secondary)'}}>⟳ Loading…</div>}

          {!proposalsLoading && proposals.length === 0 && (
            <div className="empty-hint" style={{padding:'32px 0'}}>
              <div style={{fontSize:32,marginBottom:8}}>🧬</div>
              <div>No pending proposals.</div>
              <div style={{fontSize:11,color:'var(--tx-secondary)',marginTop:4}}>
                Proposals appear after each job run when the LLM detects improvement opportunities
                with confidence 70–87%. Higher confidence changes are applied automatically.
              </div>
            </div>
          )}

          {proposals.map(p => (
            <div key={p.id} style={S.card}>
              {/* Header row */}
              <div style={{display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:6}}>
                <div>
                  <span style={{fontWeight:700, fontSize:13}}>{p.agent_label || p.agent_id}</span>
                  <span style={{fontSize:11, color:'var(--tx-secondary)', marginLeft:6}}>({p.agent_id})</span>
                </div>
                <div style={{display:'flex', gap:6, alignItems:'center'}}>
                  {confidenceBadge(p.confidence)}
                  <span style={{fontSize:10,color:'var(--tx-secondary)'}}>{p.trigger}</span>
                </div>
              </div>

              {/* Field chips */}
              <div style={{display:'flex', gap:4, flexWrap:'wrap', marginBottom:6}}>
                {Object.keys(p.patches || {}).map(fieldChip)}
              </div>

              {/* Reason */}
              <div style={{fontSize:12, color:'var(--tx-secondary)', marginBottom:6, lineHeight:1.5}}>
                {p.reason}
              </div>

              {/* Proposed values (collapsible) */}
              {Object.entries(p.patches || {}).map(([field, val]) => (
                <details key={field} style={{marginBottom:4}}>
                  <summary style={{fontSize:11, cursor:'pointer', color:'var(--tx-secondary)', userSelect:'none'}}>
                    View proposed <strong>{field}</strong>
                  </summary>
                  <pre style={S.pre}>{typeof val === 'object' ? JSON.stringify(val, null, 2) : String(val)}</pre>
                </details>
              ))}

              {/* Job context */}
              {p.job_context?.topic && (
                <div style={{fontSize:10, color:'var(--tx-secondary)', marginTop:4}}>
                  Triggered by: &ldquo;{String(p.job_context.topic).slice(0, 60)}&rdquo;
                </div>
              )}

              {/* Created at */}
              <div style={{fontSize:10, color:'var(--tx-secondary)', marginTop:2}}>
                {p.created_at?.slice(0, 16)}
              </div>

              {/* Actions */}
              {canEdit && (
                <div style={{display:'flex', gap:8, marginTop:10}}>
                  <button className="agent-action-btn"
                    style={{background:'rgba(34,197,94,0.12)', color:'#86efac', borderColor:'rgba(34,197,94,0.25)'}}
                    onClick={() => handleApprove(p.id)}>
                    ✅ Approve &amp; Apply to SKILLS.md
                  </button>
                  <button className="agent-action-btn danger"
                    onClick={() => openRejectModal(p.id)}>
                    ✕ Reject
                  </button>
                </div>
              )}
            </div>
          ))}

          {/* Reject reason modal */}
          {rejectModal && (
            <div style={S.modalOverlay}>
              <div style={S.modal}>
                <div style={{fontWeight:700, marginBottom:10}}>Reject proposal</div>
                <div style={{fontSize:12, marginBottom:8, color:'var(--tx-secondary)'}}>Optional reason (helps the LLM avoid re-suggesting):</div>
                <textarea className="topic-input" rows={3} value={rejectReason}
                  onChange={e => setRejectReason(e.target.value)}
                  placeholder="e.g. Too generic, not relevant to current domain…" />
                <div style={{display:'flex', gap:8, marginTop:10}}>
                  <button className="agent-action-btn danger" onClick={handleRejectConfirm}>Confirm Reject</button>
                  <button className="agent-action-btn" onClick={() => setRejectModal(null)}>Cancel</button>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ═══ EVOLUTION HISTORY ═══ */}
      {tab === 'history' && (
        <div className="settings-body">
          <div style={{display:'flex', gap:8, marginBottom:12, alignItems:'center'}}>
            <input className="topic-input" style={{flex:1}} placeholder="Filter by agent ID (optional)"
              value={historyAgent} onChange={e => setHistoryAgent(e.target.value)}
              onKeyDown={e => e.key==='Enter' && fetchHistory(historyAgent)} />
            <button className="agent-action-btn" onClick={() => fetchHistory(historyAgent)}
              disabled={historyLoading}>{historyLoading ? '⟳' : '🔍 Filter'}</button>
            <button className="agent-action-btn" onClick={() => { setHistoryAgent(''); fetchHistory('') }}>
              ✕ Clear
            </button>
          </div>

          {historyLoading && <div style={{textAlign:'center',padding:20,color:'var(--tx-secondary)'}}>⟳ Loading…</div>}

          {!historyLoading && history.length === 0 && (
            <div className="empty-hint">
              <div style={{fontSize:32,marginBottom:8}}>📭</div>
              No evolution history yet. Changes appear here after the first auto-apply or approval.
            </div>
          )}

          {history.map((h, i) => (
            <div key={i} style={{...S.card, borderLeft:'2px solid rgba(99,102,241,0.3)'}}>
              <div style={{display:'flex', justifyContent:'space-between', alignItems:'flex-start'}}>
                <div>
                  <span style={{fontWeight:700, fontSize:13}}>{h.agent_id}</span>
                  <span style={{
                    fontSize:10, marginLeft:8, padding:'1px 6px', borderRadius:8,
                    background: h.source==='human_approved' ? 'rgba(34,197,94,0.12)' : 'rgba(99,102,241,0.12)',
                    color:      h.source==='human_approved' ? '#86efac'              : '#c4b5fd',
                  }}>{h.source === 'human_approved' ? '👤 human' : '🤖 auto'}</span>
                </div>
                <div style={{fontSize:10, color:'var(--tx-secondary)'}}>{h.applied_at?.slice(0,16)}</div>
              </div>
              <div style={{display:'flex', gap:4, flexWrap:'wrap', margin:'6px 0'}}>
                {(h.fields_changed || []).map(fieldChip)}
              </div>
              <div style={{fontSize:12, color:'var(--tx-secondary)', lineHeight:1.5}}>{h.reason}</div>
            </div>
          ))}
        </div>
      )}

      {/* ═══ WEB SEARCH ═══ */}
      {tab === 'websearch' && (
        <div className="settings-body">
          {!canEdit && <ReadonlyBanner />}
          <div className="si-row">
            <span className="si-label">Web Search Enabled</span>
            <Toggle value={wsConfig?.enabled} disabled={!canEdit}
              onChange={v => setWsConfig(p => ({...p, enabled: v}))} />
          </div>
          <Row label="Provider" hint="auto = try each in order until one succeeds.">
            <select className="topic-input" value={wsConfig?.provider || 'auto'} disabled={!canEdit}
              onChange={e => canEdit && setWsConfig(p => ({...p, provider: e.target.value}))}>
              <option value="auto">auto</option>
              <option value="duckduckgo">DuckDuckGo</option>
              <option value="brave">Brave</option>
              <option value="serpapi">SerpAPI</option>
              <option value="mock">mock (offline testing)</option>
            </select>
          </Row>
          <Row label="Max results">
            <input className="topic-input" type="number" min={1} max={20}
              value={wsConfig?.max_results ?? 5} disabled={!canEdit}
              onChange={e => canEdit && setWsConfig(p => ({...p, max_results: +e.target.value}))} />
          </Row>
          <Row label="Timeout (seconds)">
            <input className="topic-input" type="number" min={1} max={60}
              value={wsConfig?.timeout_seconds ?? 10} disabled={!canEdit}
              onChange={e => canEdit && setWsConfig(p => ({...p, timeout_seconds: +e.target.value}))} />
          </Row>
          <Row label="Region" hint="e.g. wt-wt (worldwide), us-en, gb-en">
            <input className="topic-input" value={wsConfig?.region || 'wt-wt'} disabled={!canEdit}
              onChange={e => canEdit && setWsConfig(p => ({...p, region: e.target.value}))}
              placeholder="wt-wt" />
          </Row>
          <div className="si-row">
            <span className="si-label">Safe search</span>
            <Toggle value={wsConfig?.safe_search} disabled={!canEdit}
              onChange={v => setWsConfig(p => ({...p, safe_search: v}))} />
          </div>
          <div className="si-row">
            <span className="si-label">Fallback to mock on failure</span>
            <Toggle value={wsConfig?.fallback_to_mock} disabled={!canEdit}
              onChange={v => setWsConfig(p => ({...p, fallback_to_mock: v}))} />
          </div>
          {canEdit && (
            <div style={{display:'flex', gap:8, marginTop:12, flexWrap:'wrap'}}>
              <button className="run-btn" onClick={handleSaveWsConfig} disabled={wsSaving}>
                {wsSaving ? '⟳ Saving…' : '💾 Save Config'}</button>
              <button className="run-btn" style={{background:'rgba(99,102,241,0.15)'}}
                onClick={handleTestWsProviders} disabled={wsTesting}>
                {wsTesting ? '⟳ Testing…' : '🧪 Test Providers'}</button>
            </div>
          )}
          <div style={{marginTop:14}}>
            <div style={{fontSize:12,fontWeight:600,marginBottom:6}}>🔎 Test a query</div>
            <div style={{display:'flex',gap:8}}>
              <input className="topic-input" style={{flex:1}}
                value={wsTestQuery || ''} onChange={e => setWsTestQuery?.(e.target.value)}
                placeholder="e.g. weather in Tokyo"
                onKeyDown={e => e.key==='Enter' && handleRunWsQuery?.()} />
              <button className="run-btn" onClick={handleRunWsQuery} disabled={wsTesting}>
                {wsTesting ? '⟳' : '▶ Run'}</button>
            </div>
          </div>
          {wsTestResult && (
            <div style={wsTestResult.startsWith('❌') ? S.err : S.ok}>{wsTestResult}</div>
          )}
        </div>
      )}
    </div>
  )
}

const S = {
  banner: {
    margin:'0 0 10px', padding:'8px 12px', borderRadius:7,
    background:'rgba(99,102,241,0.08)', border:'1px solid rgba(99,102,241,0.2)',
    color:'#a5b4fc', fontSize:12,
  },
  hint: { fontSize:11, color:'var(--tx-secondary)', marginBottom:2 },
  card: {
    padding:'10px 12px', borderRadius:8, marginBottom:8,
    background:'rgba(255,255,255,0.03)', border:'1px solid var(--bd-subtle)',
  },
  pre: {
    fontSize:10, marginTop:4, padding:'6px 8px', borderRadius:5,
    background:'rgba(0,0,0,0.25)', whiteSpace:'pre-wrap', overflowX:'auto',
    maxHeight:160, color:'var(--tx-secondary)',
  },
  ok: {
    marginTop:10, padding:'8px 12px', borderRadius:7, fontSize:12,
    whiteSpace:'pre-wrap',
    background:'rgba(34,197,94,0.06)', border:'1px solid rgba(34,197,94,0.2)',
    color:'var(--tx-primary)',
  },
  err: {
    marginTop:10, padding:'8px 12px', borderRadius:7, fontSize:12,
    whiteSpace:'pre-wrap',
    background:'rgba(239,68,68,0.08)', border:'1px solid rgba(239,68,68,0.3)',
    color:'#fca5a5',
  },
  modalOverlay: {
    position:'fixed', inset:0, background:'rgba(0,0,0,0.6)',
    display:'flex', alignItems:'center', justifyContent:'center', zIndex:9999,
  },
  modal: {
    background:'var(--bg-surface)', border:'1px solid var(--bd-subtle)',
    borderRadius:10, padding:20, width:360, maxWidth:'90vw',
  },
}
