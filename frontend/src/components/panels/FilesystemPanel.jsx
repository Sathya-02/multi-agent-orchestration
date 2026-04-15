/**
 * FilesystemPanel.jsx  (RBAC-gated)
 *
 * viewer   : read-only — can browse directory listing, no write operations
 * operator : full filesystem read + write (create, delete, save)
 * admin    : same as operator
 */
import { useState } from 'react'
import '../../styles/App.css'
import { useAuth } from '../../auth.jsx'
import { can } from '../../rbac.js'

export default function FilesystemPanel({
  fsConfig, setFsConfig, fsSaving, handleSaveFsConfig,
  fsTree, fsLoading, handleFsBrowse,
  fsFileContent, handleFsReadFile, handleFsWriteFile, handleFsDeleteFile,
  onClose
}) {
  const { user } = useAuth()
  const canWrite = can(user, 'filesystem_write')

  const [fsTab, setFsTab]     = useState('browse')
  const [editPath, setEditPath] = useState('')
  const [editContent, setEditContent] = useState('')

  const TABS = [
    { key:'browse', label:'📁 Browse' },
    ...(canWrite ? [{ key:'edit', label:'✏️ Edit File' }, { key:'config', label:'⚙️ Config' }] : []),
  ]

  return (
    <div className="overlay-panel fs-panel">
      <div className="overlay-header">
        <span>📁 Filesystem</span>
        <button className="overlay-close" onClick={onClose}>✕</button>
      </div>

      {!canWrite && (
        <div style={{ ...viewerBanner, margin:'10px 14px 0' }}>🔒 Filesystem is read-only for your role.</div>
      )}

      <div className="agent-tabs">
        {TABS.map(t => (
          <button key={t.key} className={`agent-tab${fsTab === t.key ? ' active' : ''}`}
            onClick={() => setFsTab(t.key)}>{t.label}</button>
        ))}
      </div>

      {/* ── BROWSE ── */}
      {fsTab === 'browse' && (
        <div className="kb-body">
          <div style={{ display:'flex', gap:8, marginBottom:10 }}>
            <input className="topic-input" style={{ flex:1, marginBottom:0 }}
              placeholder="Path to browse (e.g. /workspace)"
              defaultValue={fsConfig?.root_path || ''}
              id="fs-browse-input" />
            <button className="fs-apply-btn"
              onClick={() => handleFsBrowse(document.getElementById('fs-browse-input').value)}
              disabled={fsLoading}>
              {fsLoading ? '…' : '🔍'}
            </button>
          </div>
          {fsTree && (
            <pre style={{ fontSize:11, color:'var(--tx-secondary)', whiteSpace:'pre-wrap', lineHeight:1.6, margin:0 }}>
              {typeof fsTree === 'string' ? fsTree : JSON.stringify(fsTree, null, 2)}
            </pre>
          )}
        </div>
      )}

      {/* ── EDIT FILE (operator+) ── */}
      {fsTab === 'edit' && canWrite && (
        <div className="kb-body">
          <div style={{ display:'flex', gap:8, marginBottom:8 }}>
            <input className="topic-input" style={{ flex:1, marginBottom:0 }}
              value={editPath} onChange={e => setEditPath(e.target.value)}
              placeholder="File path (e.g. /workspace/notes.txt)" />
            <button className="fs-apply-btn"
              onClick={async () => {
                const content = await handleFsReadFile(editPath)
                setEditContent(typeof content === 'string' ? content : JSON.stringify(content, null, 2))
              }}>📖 Read</button>
          </div>
          <textarea className="topic-input"
            value={editContent}
            onChange={e => setEditContent(e.target.value)}
            rows={14}
            placeholder="File content appears here after Read…" />
          <div style={{ display:'flex', gap:8, marginTop:8 }}>
            <button className="run-btn" style={{ flex:1 }}
              onClick={() => handleFsWriteFile(editPath, editContent)}
              disabled={!editPath.trim() || !editContent.trim()}>
              💾 Save File
            </button>
            <button className="agent-action-btn danger"
              onClick={() => { if(window.confirm(`Delete ${editPath}?`)) handleFsDeleteFile(editPath) }}
              disabled={!editPath.trim()}>
              🗑 Delete
            </button>
          </div>
        </div>
      )}

      {/* ── CONFIG (operator+) ── */}
      {fsTab === 'config' && canWrite && (
        <div className="kb-body">
          <div className="tg-config-row">
            <div className="tg-label">Root Path</div>
            <input className="topic-input"
              value={fsConfig?.root_path || ''}
              onChange={e => setFsConfig(p => ({ ...p, root_path: e.target.value }))}
              placeholder="/workspace" />
          </div>
          <div className="si-row">
            <span className="si-label">Write Enabled</span>
            <button className={`si-toggle ${fsConfig?.write_enabled ? 'on' : 'off'}`}
              onClick={() => setFsConfig(p => ({ ...p, write_enabled: !p.write_enabled }))}>
              {fsConfig?.write_enabled ? '🟢 On' : '🔴 Off'}
            </button>
          </div>
          <button className="run-btn" style={{ marginTop:10 }} onClick={handleSaveFsConfig} disabled={fsSaving}>
            {fsSaving ? '⟳ Saving…' : '💾 Save Config'}
          </button>
        </div>
      )}
    </div>
  )
}

const viewerBanner = {
  padding: '8px 12px', borderRadius: 7,
  background: 'rgba(99,102,241,0.08)',
  border: '1px solid rgba(99,102,241,0.2)',
  color: '#a5b4fc', fontSize: 12,
}
