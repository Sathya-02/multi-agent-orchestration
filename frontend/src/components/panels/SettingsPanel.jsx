import '../../styles/App.css'

export default function SettingsPanel({
  settingsTab, setSettingsTab,
  tgConfig, setTgConfig, tgSaving, tgTesting, tgTestResult, tgBotSet,
  siConfig, setSiConfig, siSaving, siRunning, bestPractices, proposals, improvLog,
  wsConfig, setWsConfig, wsSaving, wsTesting, wsTestResult, wsTestQuery, setWsTestQuery,
  handleSaveTelegram, handleTestTelegram,
  handleSaveSiConfig, handleRunImprover,
  handleSaveWsConfig, handleTestWsProviders, handleRunWsQuery,
  onClose
}) {
  const TABS = [
    ['telegram','📱 Telegram'],
    ['improver','🔄 Self-Improver'],
    ['websearch','🌐 Web Search'],
  ]

  const Row = ({ label, children }) => (
    <div className="tg-config-row">
      <div className="tg-label">{label}</div>
      {children}
    </div>
  )

  const toggle = (field, obj, setter) => setter({ ...obj, [field]: !obj[field] })

  return (
    <div className="overlay-panel settings-panel">
      <div className="overlay-header">
        <span>⚙️ Settings</span>
        <button className="overlay-close" onClick={onClose}>✕</button>
      </div>

      {/* Tabs */}
      <div className="settings-tabs">
        {TABS.map(([k,v]) => (
          <button key={k} className={`settings-tab${settingsTab === k ? ' active' : ''}`} onClick={() => setSettingsTab(k)}>
            {v}
          </button>
        ))}
      </div>

      {/* ── TELEGRAM ── */}
      {settingsTab === 'telegram' && (
        <div className="settings-body">
          <div className="settings-section-title">Telegram Bot</div>
          {tgBotSet && (
            <div style={{ marginBottom:10, padding:'6px 10px', background:'rgba(46,204,138,0.07)', border:'1px solid rgba(46,204,138,0.2)', borderRadius:6, fontSize:11, color:'#6ef0b8' }}>
              ✓ Bot token is configured
            </div>
          )}
          <Row label="Bot Token">
            <input className="topic-input" type="password"
              value={tgConfig.bot_token || ''}
              onChange={e => setTgConfig({ ...tgConfig, bot_token: e.target.value })}
              placeholder={tgBotSet ? '••••••••••••• (already set)' : 'Enter Telegram bot token'} />
          </Row>
          <Row label="Allowed Chat IDs (comma-separated)">
            <input className="topic-input"
              value={tgConfig.allowed_chat_ids || ''}
              onChange={e => setTgConfig({ ...tgConfig, allowed_chat_ids: e.target.value })}
              placeholder="123456789, 987654321" />
          </Row>
          <Row label="Notify Chat ID">
            <input className="topic-input"
              value={tgConfig.notify_chat_id || ''}
              onChange={e => setTgConfig({ ...tgConfig, notify_chat_id: e.target.value })}
              placeholder="Chat ID to send job-complete notifications" />
          </Row>
          <div className="si-row" style={{ marginBottom:12 }}>
            <span className="si-label">Notifications enabled</span>
            <button className={`si-toggle ${tgConfig.enabled ? 'on' : 'off'}`}
              onClick={() => setTgConfig({ ...tgConfig, enabled: !tgConfig.enabled })}>
              {tgConfig.enabled ? '🟢 On' : '🔴 Off'}
            </button>
          </div>
          <div style={{ display:'flex', gap:8 }}>
            <button className="run-btn" style={{ flex:1 }} onClick={handleSaveTelegram} disabled={tgSaving}>
              {tgSaving ? '⟳ Saving…' : '💾 Save Config'}
            </button>
            <button className="run-btn" style={{ flex:1, background:'linear-gradient(135deg,#0d9e44,#16a34a)' }}
              onClick={handleTestTelegram} disabled={tgTesting || !tgBotSet}>
              {tgTesting ? '⟳ Testing…' : '📤 Test Message'}
            </button>
          </div>
          {tgTestResult && (
            <div className={`tg-result ${tgTestResult.startsWith('✅') ? 'ok' : 'err'}`}>
              {tgTestResult}
            </div>
          )}
          <div className="tg-command-list" style={{ marginTop:14 }}>
            Available bot commands:<br />
            <span>/run</span> &lt;topic&gt; — start a research job<br />
            <span>/status</span> — check job status<br />
            <span>/agents</span> — list active agents<br />
            <span>/help</span> — show help
          </div>
        </div>
      )}

      {/* ── SELF-IMPROVER ── */}
      {settingsTab === 'improver' && (
        <div className="settings-body">
          <div className="settings-section-title">Self-Improver Config</div>
          <div className="si-row">
            <span className="si-label">Enabled</span>
            <button className={`si-toggle ${siConfig.enabled ? 'on' : 'off'}`}
              onClick={() => toggle('enabled', siConfig, setSiConfig)}>
              {siConfig.enabled ? '🟢 On' : '🔴 Off'}
            </button>
          </div>
          <div className="si-row">
            <span className="si-label">Auto-apply safe changes</span>
            <button className={`si-toggle ${siConfig.auto_apply_safe ? 'on' : 'off'}`}
              onClick={() => toggle('auto_apply_safe', siConfig, setSiConfig)}>
              {siConfig.auto_apply_safe ? '🟢 On' : '🔴 Off'}
            </button>
          </div>
          <div className="si-row">
            <span className="si-label">Notify via Telegram</span>
            <button className={`si-toggle ${siConfig.notify_telegram ? 'on' : 'off'}`}
              onClick={() => toggle('notify_telegram', siConfig, setSiConfig)}>
              {siConfig.notify_telegram ? '🟢 On' : '🔴 Off'}
            </button>
          </div>
          <Row label="Interval (hours)">
            <input className="topic-input" type="number" min={1} max={168}
              value={siConfig.interval_hours || 6}
              onChange={e => setSiConfig({ ...siConfig, interval_hours: +e.target.value })} />
          </Row>
          <Row label="Min Confidence (0–1)">
            <input className="topic-input" type="number" min={0} max={1} step={0.05}
              value={siConfig.min_confidence ?? 0.7}
              onChange={e => setSiConfig({ ...siConfig, min_confidence: +e.target.value })} />
          </Row>
          <Row label="Model Override (blank = use active)">
            <input className="topic-input"
              value={siConfig.model_override || ''}
              onChange={e => setSiConfig({ ...siConfig, model_override: e.target.value })}
              placeholder="e.g. phi3:mini" />
          </Row>
          <div style={{ display:'flex', gap:8, marginTop:8 }}>
            <button className="run-btn" style={{ flex:1 }} onClick={handleSaveSiConfig} disabled={siSaving}>
              {siSaving ? '⟳ Saving…' : '💾 Save Config'}
            </button>
            <button className="run-btn" style={{ flex:1, background:'linear-gradient(135deg,#7c3aed,#6d28d9)' }}
              onClick={handleRunImprover} disabled={siRunning}>
              {siRunning ? '⟳ Running…' : '▶ Run Now'}
            </button>
          </div>
          {bestPractices && (
            <>
              <div className="settings-section-title" style={{ marginTop:14 }}>Best Practices</div>
              <textarea className="practices-editor" readOnly value={bestPractices} rows={8} />
            </>
          )}
          {proposals && (
            <>
              <div className="settings-section-title" style={{ marginTop:10 }}>Latest Proposals</div>
              <textarea className="practices-editor" readOnly value={proposals} rows={6} />
            </>
          )}
          {improvLog && (
            <>
              <div className="settings-section-title" style={{ marginTop:10 }}>Improvement Log</div>
              <textarea className="practices-editor" readOnly value={improvLog} rows={5} />
            </>
          )}
        </div>
      )}

      {/* ── WEB SEARCH ── */}
      {settingsTab === 'websearch' && (
        <div className="settings-body">
          <div className="settings-section-title">Web Search Config</div>
          <div className="si-row">
            <span className="si-label">Enabled</span>
            <button className={`si-toggle ${wsConfig.enabled ? 'on' : 'off'}`}
              onClick={() => toggle('enabled', wsConfig, setWsConfig)}>
              {wsConfig.enabled ? '🟢 On' : '🔴 Off'}
            </button>
          </div>
          <Row label="Provider">
            <select className="topic-input"
              value={wsConfig.provider || 'auto'}
              onChange={e => setWsConfig({ ...wsConfig, provider: e.target.value })}>
              {['auto','duckduckgo','searx','google','bing'].map(p =>
                <option key={p} value={p}>{p}</option>
              )}
            </select>
          </Row>
          <Row label="Max Results">
            <input className="topic-input" type="number" min={1} max={20}
              value={wsConfig.max_results || 5}
              onChange={e => setWsConfig({ ...wsConfig, max_results: +e.target.value })} />
          </Row>
          <Row label="Timeout (seconds)">
            <input className="topic-input" type="number" min={3} max={60}
              value={wsConfig.timeout_seconds || 10}
              onChange={e => setWsConfig({ ...wsConfig, timeout_seconds: +e.target.value })} />
          </Row>
          <Row label="Region">
            <input className="topic-input"
              value={wsConfig.region || 'wt-wt'}
              onChange={e => setWsConfig({ ...wsConfig, region: e.target.value })}
              placeholder="wt-wt" />
          </Row>
          <div className="si-row">
            <span className="si-label">Safe Search</span>
            <button className={`si-toggle ${wsConfig.safe_search ? 'on' : 'off'}`}
              onClick={() => toggle('safe_search', wsConfig, setWsConfig)}>
              {wsConfig.safe_search ? '🟢 On' : '🔴 Off'}
            </button>
          </div>
          <div className="si-row">
            <span className="si-label">Fallback to mock</span>
            <button className={`si-toggle ${wsConfig.fallback_to_mock ? 'on' : 'off'}`}
              onClick={() => toggle('fallback_to_mock', wsConfig, setWsConfig)}>
              {wsConfig.fallback_to_mock ? '🟢 On' : '🔴 Off'}
            </button>
          </div>
          <div style={{ display:'flex', gap:8, marginTop:8 }}>
            <button className="run-btn" style={{ flex:1 }} onClick={handleSaveWsConfig} disabled={wsSaving}>
              {wsSaving ? '⟳ Saving…' : '💾 Save'}
            </button>
            <button className="run-btn" style={{ flex:1, background:'linear-gradient(135deg,#0f766e,#0d9488)' }}
              onClick={handleTestWsProviders} disabled={wsTesting}>
              {wsTesting ? '⟳ Testing…' : '🧪 Test Providers'}
            </button>
          </div>
          <Row label="Test Query">
            <div style={{ display:'flex', gap:8 }}>
              <input className="topic-input" style={{ flex:1, marginBottom:0 }}
                value={wsTestQuery}
                onChange={e => setWsTestQuery(e.target.value)}
                placeholder="weather in Tokyo" />
              <button className="fs-apply-btn" onClick={handleRunWsQuery} disabled={wsTesting}>Go</button>
            </div>
          </Row>
          {wsTestResult && (
            <div className={`tg-result ${wsTestResult.startsWith('❌') ? 'err' : 'ok'}`}>
              {wsTestResult}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
