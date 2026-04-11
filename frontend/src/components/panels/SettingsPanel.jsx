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
  return (
    <div className="overlay-panel settings-panel">
      <div className="overlay-header">
        <span>⚙️ Settings</span>
        <button className="overlay-close" onClick={onClose}>✕</button>
      </div>

      <div className="agent-tabs">
        {['telegram','self-improver','web-search'].map(t => (
          <button key={t} className={`agent-tab${settingsTab===t?' active':''}`} onClick={() => setSettingsTab(t)}>
            {{ telegram:'📱 Telegram', 'self-improver':'🧠 Self-Improver', 'web-search':'🌐 Web Search' }[t]}
          </button>
        ))}
      </div>

      {/* TELEGRAM */}
      {settingsTab === 'telegram' && (
        <div className="settings-body">
          <div className="form-row">
            <label className="form-label">Bot Token</label>
            <input type="password" className="topic-input" value={tgConfig.bot_token} onChange={e => setTgConfig({...tgConfig, bot_token: e.target.value})} placeholder="123456:ABC…" />
          </div>
          <div className="form-row">
            <label className="form-label">Allowed Chat IDs</label>
            <input className="topic-input" value={tgConfig.allowed_chat_ids} onChange={e => setTgConfig({...tgConfig, allowed_chat_ids: e.target.value})} placeholder="123456789,987654321" />
          </div>
          <div className="form-row">
            <label className="form-label">Notify Chat ID</label>
            <input className="topic-input" value={tgConfig.notify_chat_id} onChange={e => setTgConfig({...tgConfig, notify_chat_id: e.target.value})} placeholder="Chat to receive notifications" />
          </div>
          <label className="form-check">
            <input type="checkbox" checked={tgConfig.enabled} onChange={e => setTgConfig({...tgConfig, enabled: e.target.checked})} />
            Enable Telegram bot
          </label>
          {tgTestResult && <div className={`result-msg ${tgTestResult.ok ? 'ok' : 'err'}`}>{tgTestResult.msg}</div>}
          <div className="form-btns">
            <button className="run-btn" onClick={handleSaveTelegram} disabled={tgSaving}>{tgSaving ? '⟳ Saving…' : '💾 Save'}</button>
            <button className="run-btn" style={{ background: 'var(--surface-2)' }} onClick={handleTestTelegram} disabled={tgTesting || !tgBotSet}>{tgTesting ? '⟳ Testing…' : '🧪 Test'}</button>
          </div>
        </div>
      )}

      {/* SELF-IMPROVER */}
      {settingsTab === 'self-improver' && (
        <div className="settings-body">
          <label className="form-check">
            <input type="checkbox" checked={siConfig.enabled} onChange={e => setSiConfig({...siConfig, enabled: e.target.checked})} />
            Enable self-improver
          </label>
          <div className="form-row">
            <label className="form-label">Interval (hours)</label>
            <input type="number" className="topic-input" value={siConfig.interval_hours} onChange={e => setSiConfig({...siConfig, interval_hours: +e.target.value})} />
          </div>
          <div className="form-row">
            <label className="form-label">Min confidence</label>
            <input type="number" step="0.05" min="0" max="1" className="topic-input" value={siConfig.min_confidence} onChange={e => setSiConfig({...siConfig, min_confidence: +e.target.value})} />
          </div>
          <label className="form-check">
            <input type="checkbox" checked={siConfig.auto_apply_safe} onChange={e => setSiConfig({...siConfig, auto_apply_safe: e.target.checked})} />
            Auto-apply safe improvements
          </label>
          <label className="form-check">
            <input type="checkbox" checked={siConfig.notify_telegram} onChange={e => setSiConfig({...siConfig, notify_telegram: e.target.checked})} />
            Notify via Telegram
          </label>
          <div className="form-btns">
            <button className="run-btn" onClick={handleSaveSiConfig} disabled={siSaving}>{siSaving ? '⟳ Saving…' : '💾 Save'}</button>
            <button className="run-btn" style={{ background: 'var(--accent)' }} onClick={handleRunImprover} disabled={siRunning}>{siRunning ? '⟳ Running…' : '▶ Run Now'}</button>
          </div>
          {bestPractices && <pre className="code-block">{bestPractices.slice(0,600)}</pre>}
          {proposals && <pre className="code-block">{proposals.slice(0,600)}</pre>}
          {improvLog && <pre className="code-block">{improvLog.slice(0,600)}</pre>}
        </div>
      )}

      {/* WEB SEARCH */}
      {settingsTab === 'web-search' && (
        <div className="settings-body">
          <label className="form-check">
            <input type="checkbox" checked={wsConfig.enabled} onChange={e => setWsConfig({...wsConfig, enabled: e.target.checked})} />
            Enable web search
          </label>
          <div className="form-row">
            <label className="form-label">Provider</label>
            <select className="topic-input" value={wsConfig.provider} onChange={e => setWsConfig({...wsConfig, provider: e.target.value})}>
              {['auto','ddg','google','bing','mock'].map(p => <option key={p} value={p}>{p}</option>)}
            </select>
          </div>
          <div className="form-row">
            <label className="form-label">Max results</label>
            <input type="number" className="topic-input" value={wsConfig.max_results} onChange={e => setWsConfig({...wsConfig, max_results: +e.target.value})} />
          </div>
          <div className="form-row">
            <label className="form-label">Test query</label>
            <input className="topic-input" value={wsTestQuery} onChange={e => setWsTestQuery(e.target.value)} />
          </div>
          {wsTestResult && <pre className="code-block">{JSON.stringify(wsTestResult, null, 2).slice(0,500)}</pre>}
          <div className="form-btns">
            <button className="run-btn" onClick={handleSaveWsConfig} disabled={wsSaving}>{wsSaving ? '⟳ Saving…' : '💾 Save'}</button>
            <button className="run-btn" style={{ background: 'var(--surface-2)' }} onClick={handleTestWsProviders} disabled={wsTesting}>{wsTesting ? '⟳ Testing…' : '🧪 Test Providers'}</button>
            <button className="run-btn" style={{ background: 'var(--accent)' }} onClick={handleRunWsQuery} disabled={wsTesting}>{wsTesting ? '⟳…' : '🔍 Run Query'}</button>
          </div>
        </div>
      )}
    </div>
  )
}
