import '../../styles/App.css'

export default function FilesystemPanel({
  fsConfig, fsAudit, fsAuditTab, setFsAuditTab, fetchFsAudit,
  newFsPath, setNewFsPath, newFsLabel, setNewFsLabel,
  newFsRead, setNewFsRead, newFsWrite, setNewFsWrite,
  newFsEdit, setNewFsEdit, fsError,
  outputDirInput, setOutputDirInput,
  handleAddFsAccess, handleRemoveFsAccess, handleToggleFsFlag, handleSetOutputDir,
  onClose
}) {
  return (
    <div className="overlay-panel fs-panel">
      <div className="overlay-header">
        <span>📁 Filesystem Access</span>
        <button className="overlay-close" onClick={onClose}>✕</button>
      </div>

      <div className="fs-tabs">
        <button className={`fs-tab${!fsAuditTab ? ' active' : ''}`} onClick={() => setFsAuditTab(false)}>Config</button>
        <button className={`fs-tab${fsAuditTab ? ' active' : ''}`} onClick={() => { setFsAuditTab(true); fetchFsAudit() }}>Audit Log</button>
      </div>

      {!fsAuditTab ? (
        <div className="fs-body">
          <div className="fs-section-title">Output Directory</div>
          <div className="fs-row">
            <input
              className="topic-input" style={{ flex: 1 }}
              value={outputDirInput}
              onChange={e => setOutputDirInput(e.target.value)}
              placeholder={fsConfig.output_dir || '/tmp/agent_output'}
            />
            <button className="run-btn" style={{ width: 'auto', padding: '0 0.8rem' }} onClick={handleSetOutputDir}>Set</button>
          </div>

          <div className="fs-section-title" style={{ marginTop: '0.8rem' }}>Access List</div>
          <div className="fs-add-row">
            <input className="topic-input" style={{ flex: 2 }} value={newFsPath} onChange={e => setNewFsPath(e.target.value)} placeholder="/path/to/dir" />
            <input className="topic-input" style={{ flex: 1 }} value={newFsLabel} onChange={e => setNewFsLabel(e.target.value)} placeholder="label (opt)" />
            <label className="fs-flag"><input type="checkbox" checked={newFsRead} onChange={e => setNewFsRead(e.target.checked)} /> R</label>
            <label className="fs-flag"><input type="checkbox" checked={newFsWrite} onChange={e => setNewFsWrite(e.target.checked)} /> W</label>
            <label className="fs-flag"><input type="checkbox" checked={newFsEdit} onChange={e => setNewFsEdit(e.target.checked)} /> E</label>
            <button className="run-btn" style={{ width: 'auto', padding: '0 0.6rem' }} onClick={handleAddFsAccess}>Add</button>
          </div>
          {fsError && <div className="error-msg">{fsError}</div>}

          <div className="fs-list">
            {(fsConfig.access_list || []).length === 0 && <div className="empty-hint">No paths configured.</div>}
            {(fsConfig.access_list || []).map((entry, i) => (
              <div key={i} className="fs-item">
                <span className="fs-path">{entry.label ? <><b>{entry.label}</b>: </> : ''}{entry.path}</span>
                <span className="fs-flags">
                  {['read','write','edit'].map(flag => (
                    <label key={flag} className={`fs-flag-badge${entry[flag] ? ' on' : ''}`}>
                      <input type="checkbox" checked={!!entry[flag]} onChange={() => handleToggleFsFlag(i, flag)} />
                      {flag[0].toUpperCase()}
                    </label>
                  ))}
                </span>
                <button className="del-btn" onClick={() => handleRemoveFsAccess(i)}>🗑</button>
              </div>
            ))}
          </div>
        </div>
      ) : (
        <div className="fs-body">
          {fsAudit.length === 0 && <div className="empty-hint">No audit entries yet.</div>}
          {fsAudit.map((e, i) => (
            <div key={i} className="audit-row">
              <span className="audit-ts">{e.timestamp ? new Date(e.timestamp*1000).toLocaleTimeString() : ''}</span>
              <span className={`audit-op ${e.operation}`}>{e.operation}</span>
              <span className="audit-path">{e.path}</span>
              <span className={`audit-ok ${e.allowed ? 'yes' : 'no'}`}>{e.allowed ? '✓' : '✗'}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
