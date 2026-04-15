/**
 * SettingsPanel.jsx  (RBAC-gated)
 *
 * viewer   : read-only view — all inputs disabled, no save buttons
 * operator : read-only view (settings are admin-only for saves)
 * admin    : full edit access
 */
import { useEffect, useState } from 'react'
import '../../styles/App.css'
import { useAuth } from '../../auth.jsx'
import { can } from '../../rbac.js'

export default function SettingsPanel({
  telegramConfig, setTelegramConfig, telegramSaving, handleSaveTelegram,
  siConfig, setSiConfig, siSaving, handleSaveSi,
  bestPractices, setBestPractices, bpSaving, handleSaveBp,
  proposals, handleApproveProposal, handleRejectProposal,
  onClose
}) {
  const { user } = useAuth()
  const canEdit = can(user, 'edit_settings')
  const [tab, setTab] = useState('telegram')

  const TABS = [
    { key:'telegram',  label:'📨 Telegram' },
    { key:'si',        label:'🔬 Self-Improve' },
    { key:'bp',        label:'📋 Best Practices' },
    { key:'proposals', label:'💡 Proposals' },
  ]

  const ReadonlyBanner = () => (
    <div style={viewerBanner}>
      🔒 Settings are read-only for your role. Contact an Admin to make changes.
    </div>
  )

  const Row = ({ label, children }) => (
    <div className="tg-config-row">
      <div className="tg-label">{label}</div>
      {children}
    </div>
  )

  return (
    <div className="overlay-panel settings-panel">
      <div className="overlay-header">
        <span>⚙️ Settings</span>
        <button className="overlay-close" onClick={onClose}>✕</button>
      </div>

      <div className="agent-tabs">
        {TABS.map(t => (
          <button key={t.key} className={`agent-tab${tab === t.key ? ' active' : ''}`}
            onClick={() => setTab(t.key)}>{t.label}</button>
        ))}
      </div>

      {/* ── TELEGRAM ── */}
      {tab === 'telegram' && (
        <div className="settings-body">
          {!canEdit && <ReadonlyBanner />}
          <Row label="Bot Token">
            <input className="topic-input" type="password"
              value={telegramConfig?.bot_token || ''}
              disabled={!canEdit}
              onChange={e => canEdit && setTelegramConfig(p => ({ ...p, bot_token: e.target.value }))}
              placeholder="123456:ABC…" />
          </Row>
          <Row label="Chat ID">
            <input className="topic-input"
              value={telegramConfig?.chat_id || ''}
              disabled={!canEdit}
              onChange={e => canEdit && setTelegramConfig(p => ({ ...p, chat_id: e.target.value }))}
              placeholder="-100…" />
          </Row>
          <div className="si-row">
            <span className="si-label">Enabled</span>
            <button
              className={`si-toggle ${telegramConfig?.enabled ? 'on' : 'off'}`}
              disabled={!canEdit}
              onClick={() => canEdit && setTelegramConfig(p => ({ ...p, enabled: !p.enabled }))}>
              {telegramConfig?.enabled ? '🟢 On' : '🔴 Off'}
            </button>
          </div>
          {canEdit && (
            <button className="run-btn" style={{ marginTop:10 }} onClick={handleSaveTelegram} disabled={telegramSaving}>
              {telegramSaving ? '⟳ Saving…' : '💾 Save Telegram Config'}
            </button>
          )}
        </div>
      )}

      {/* ── SELF-IMPROVE ── */}
      {tab === 'si' && (
        <div className="settings-body">
          {!canEdit && <ReadonlyBanner />}
          <div className="si-row">
            <span className="si-label">Self-Improvement Enabled</span>
            <button
              className={`si-toggle ${siConfig?.enabled ? 'on' : 'off'}`}
              disabled={!canEdit}
              onClick={() => canEdit && setSiConfig(p => ({ ...p, enabled: !p.enabled }))}>
              {siConfig?.enabled ? '🟢 On' : '🔴 Off'}
            </button>
          </div>
          <Row label="Interval (mins)">
            <input className="topic-input" type="number" min={5}
              value={siConfig?.interval_minutes || 60}
              disabled={!canEdit}
              onChange={e => canEdit && setSiConfig(p => ({ ...p, interval_minutes: +e.target.value }))} />
          </Row>
          <Row label="Max proposals/run">
            <input className="topic-input" type="number" min={1} max={20}
              value={siConfig?.max_proposals || 5}
              disabled={!canEdit}
              onChange={e => canEdit && setSiConfig(p => ({ ...p, max_proposals: +e.target.value }))} />
          </Row>
          {canEdit && (
            <button className="run-btn" style={{ marginTop:10 }} onClick={handleSaveSi} disabled={siSaving}>
              {siSaving ? '⟳ Saving…' : '💾 Save SI Config'}
            </button>
          )}
        </div>
      )}

      {/* ── BEST PRACTICES ── */}
      {tab === 'bp' && (
        <div className="settings-body">
          {!canEdit && <ReadonlyBanner />}
          <textarea className="topic-input"
            value={bestPractices || ''}
            disabled={!canEdit}
            onChange={e => canEdit && setBestPractices(e.target.value)}
            rows={14}
            placeholder="Enter best practices / system guidelines…" />
          {canEdit && (
            <button className="run-btn" style={{ marginTop:8 }} onClick={handleSaveBp} disabled={bpSaving}>
              {bpSaving ? '⟳ Saving…' : '💾 Save Best Practices'}
            </button>
          )}
        </div>
      )}

      {/* ── PROPOSALS ── */}
      {tab === 'proposals' && (
        <div className="settings-body">
          {!canEdit && <ReadonlyBanner />}
          {(!proposals || proposals.length === 0) && <div className="empty-hint">No proposals yet.</div>}
          {proposals?.map((p, i) => (
            <div key={i} style={{
              padding:'10px 12px', borderRadius:8, marginBottom:8,
              background:'rgba(255,255,255,0.03)', border:'1px solid var(--bd-subtle)'
            }}>
              <div style={{ fontSize:12, color:'var(--tx-secondary)', marginBottom:6, whiteSpace:'pre-wrap' }}>{p.description || p.title || JSON.stringify(p)}</div>
              {canEdit && (
                <div style={{ display:'flex', gap:6 }}>
                  <button className="agent-action-btn" onClick={() => handleApproveProposal(p)}>✅ Approve</button>
                  <button className="agent-action-btn danger" onClick={() => handleRejectProposal(p)}>✕ Reject</button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

const viewerBanner = {
  margin: '0 0 10px',
  padding: '8px 12px', borderRadius: 7,
  background: 'rgba(99,102,241,0.08)',
  border: '1px solid rgba(99,102,241,0.2)',
  color: '#a5b4fc', fontSize: 12,
}
