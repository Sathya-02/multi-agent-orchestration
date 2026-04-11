import '../../styles/App.css'

export default function FilesystemPanel({
  fsConfig, fsAudit, fsAuditTab, setFsAuditTab, fetchFsAudit,
  newFsPath, setNewFsPath, newFsLabel, setNewFsLabel,
  newFsRead, setNewFsRead, newFsWrite, setNewFsWrite, newFsEdit, setNewFsEdit,
  fsError, outputDirInput, setOutputDirInput,
  handleAddFsAccess, handleRemoveFsAccess, handleToggleFsFlag, handleSetOutputDir,
  onClose
}) {
  const accessList = Array.isArray(fsConfig?.access_list) ? fsConfig.access_list : []

  return (
    <div className="overlay-panel fs-panel">
      <div className="overlay-header">
        <span>📁 Filesystem Access</span>
        <button className="overlay-close" onClick={onClose}>✕</button>
      </div>

      {/* Tabs */}
      <div style={{ display:'flex', gap:4, padding:'8px 16px 0', borderBottom:'1px solid var(--bd-subtle)' }}>
        {[['config','⚙️ Config'],['audit','📋 Audit Log']].map(([k,v]) => (
          <button key={k}
            className={`agent-tab${!fsAuditTab && k==='config' || fsAuditTab && k==='audit' ? ' active' : ''}`}
            onClick={() => { setFsAuditTab(k==='audit'); if(k==='audit') fetchFsAudit() }}>
            {v}
          </button>
        ))}
      </div>

      {!fsAuditTab ? (
        /* ── CONFIG ── */
        <div className="fs-body">
          {/* Output dir */}
          <div className="fs-section-label">Output Directory</div>
          {fsConfig?.output_dir && (
            <div className="fs-active-path">📂 {fsConfig.output_dir}</div>
          )}
          <div className="fs-output-row">
            <input className="topic-input" style={{ flex:1, marginBottom:0 }}
              value={outputDirInput} onChange={e => setOutputDirInput(e.target.value)}
              placeholder="/absolute/path/to/output" />
            <button className="fs-apply-btn" onClick={handleSetOutputDir}>Set</button>
          </div>

          {/* Add access entry */}
          <div className="fs-section-label" style={{ marginTop:16 }}>Add Access Path</div>
          <input className="topic-input" style={{ marginBottom:6 }}
            value={newFsLabel} onChange={e => setNewFsLabel(e.target.value)} placeholder="Label (optional)" />
          <div className="fs-add-row">
            <input className="topic-input" style={{ flex:1, marginBottom:0 }}
              value={newFsPath} onChange={e => setNewFsPath(e.target.value)}
              placeholder="/absolute/path or /path/*.ext" />
            <button className="fs-apply-btn" onClick={handleAddFsAccess}>Add</button>
          </div>
          <div className="fs-flags-row">
            {[['read','R','var(--bd-mid)',newFsRead,setNewFsRead],
              ['write','W','#fde68a',newFsWrite,setNewFsWrite],
              ['edit','E','#6ee7b7',newFsEdit,setNewFsEdit]].map(([k,lbl,col,val,set]) => (
              <label key={k} className="fs-flag-check" onClick={() => set(!val)}>
                <input type="checkbox" checked={val} onChange={() => set(!val)} style={{ accentColor:col }} />
                <span className="fs-flag-label" style={{ color:col }}>{lbl}</span>
              </label>
            ))}
          </div>

          {fsError && <div className="fs-error">{fsError}</div>}

          {/* Access list */}
          <div className="fs-section-label" style={{ marginTop:12 }}>Allowed Paths ({accessList.length})</div>
          {accessList.length === 0 && <div className="empty-hint">No access paths configured.</div>}
          <div className="fs-access-list">
            {accessList.map((entry, i) => (
              <div key={`${entry.path}-${i}`} className="fs-access-card">
                <div className="fs-access-top">
                  <span className="fs-access-label">{entry.label || entry.path}</span>
                  <button className="del-btn" onClick={() => handleRemoveFsAccess(entry.path)} title="Remove">🗑</button>
                </div>
                <div className="fs-access-path">{entry.path}</div>
                <div className="fs-access-flags">
                  {['read','write','edit'].map(flag => (
                    <button key={flag}
                      className={`fs-flag-toggle fs-flag-${flag}${entry[flag] ? ' active' : ''}`}
                      onClick={() => handleToggleFsFlag(entry.path, flag, entry[flag])}>
                      {flag[0].toUpperCase()}
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>

          <div className="fs-info-box">
            💡 Agents can only access paths listed here. Use wildcards like <code style={{ fontFamily:'var(--mono)' }}>/data/*.csv</code> for pattern matching.
          </div>
        </div>
      ) : (
        /* ── AUDIT ── */
        <div className="fs-body">
          <div className="fs-section-label">Recent File Operations</div>
          {fsAudit.length === 0 && <div className="empty-hint">No audit entries yet.</div>}
          <div className="fs-audit-list">
            {fsAudit.map((row, i) => (
              <div key={i} className={`fs-audit-row${row.allowed === false ? ' denied' : ''}`}>
                <span className={`fs-audit-op fs-op-${row.op?.toLowerCase()}`}>{row.op}</span>
                <span className={`fs-audit-status ${row.allowed !== false ? 'allowed' : 'denied'}`}>
                  {row.allowed !== false ? '✓' : '✗'}
                </span>
                <span className="fs-audit-path">{row.path}</span>
                {row.detail && <span className="fs-audit-detail">{row.detail}</span>}
                {row.ts && <span className="fs-audit-time">{new Date(row.ts * 1000).toLocaleTimeString()}</span>}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
