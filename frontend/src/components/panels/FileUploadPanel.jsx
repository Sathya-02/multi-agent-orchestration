/**
 * FileUploadPanel.jsx
 *
 * RBAC enforcement:
 *   - viewer : can see uploaded files list + select files for query (read-only)
 *   - operator+ : can upload new files, delete files
 */
import { useRef, useState } from 'react'
import '../../styles/App.css'
import { fileIcon, formatBytes } from '../../utils/helpers'
import { useAuth } from '../../auth.jsx'
import { can } from '../../rbac.js'

export default function FileUploadPanel({
  uploads, uploading, selectedFiles, setSelectedFiles,
  handleFileUpload, handleDeleteUpload, onClose
}) {
  const { user } = useAuth()
  const canUpload = can(user, 'upload_files')
  const canDelete = can(user, 'delete_files')

  const fileInputRef           = useRef(null)
  const [pendingFiles, setPending] = useState([])

  const fname = (f) => f?.filename ?? f?.name  ?? ''
  const fsize  = (f) => f?.size     ?? f?.file_size ?? null

  const onFilesChosen = (e) => {
    if (!canUpload) return
    setPending(Array.from(e.target.files || []))
  }

  const onUploadClick = async () => {
    if (!canUpload || !pendingFiles.length || uploading) return
    const dt = new DataTransfer()
    pendingFiles.forEach(f => dt.items.add(f))
    await handleFileUpload({ target: { files: dt.files } })
    setPending([])
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  const toggleSelect = (filename) => {
    if (!filename) return
    setSelectedFiles(prev =>
      Array.isArray(prev)
        ? prev.includes(filename) ? prev.filter(n => n !== filename) : [...prev, filename]
        : [filename]
    )
  }

  const isSelected = (filename) =>
    Array.isArray(selectedFiles) && selectedFiles.includes(filename)

  return (
    <div className="overlay-panel upload-panel">
      <div className="overlay-header">
        <span>📎 File Manager</span>
        <button className="overlay-close" onClick={onClose}>✕</button>
      </div>

      {/* ── Upload zone (operator+ only) ── */}
      {canUpload ? (
        <>
          <div className="upload-drop-area" onClick={() => fileInputRef.current?.click()}>
            <input
              ref={fileInputRef}
              type="file"
              multiple
              style={{ display:'none' }}
              onChange={onFilesChosen}
            />
            <div className="upload-drop-icon">📂</div>
            <div className="upload-drop-text">
              {pendingFiles.length > 0
                ? `${pendingFiles.length} file(s) ready — click Upload below`
                : 'Click to select files to upload'}
            </div>
          </div>

          {pendingFiles.length > 0 && (
            <>
              <div className="upload-list" style={{ marginBottom:0 }}>
                {pendingFiles.map((f, i) => (
                  <div key={`pending-${f.name}-${i}`} className="upload-item" style={{ opacity:0.75 }}>
                    <span className="upload-icon">{fileIcon(f.name)}</span>
                    <span className="upload-name">{f.name}</span>
                    <span className="upload-size">{formatBytes(f.size)}</span>
                    <span style={{ fontSize:'0.6rem', color:'var(--tx-muted)', marginLeft:'auto' }}>pending</span>
                  </div>
                ))}
              </div>
              <div style={{ padding:'0 16px 10px' }}>
                <button className="run-btn" onClick={onUploadClick} disabled={uploading}>
                  {uploading ? '⟳ Uploading…' : `⬆ Upload ${pendingFiles.length} file(s)`}
                </button>
              </div>
            </>
          )}
        </>
      ) : (
        <div style={viewerBanner}>
          🔒 Viewers can select files for queries but cannot upload or delete.
        </div>
      )}

      {/* ── Uploaded files header ── */}
      <div style={{
        padding:'6px 16px 4px', fontSize:'10px', fontWeight:700,
        textTransform:'uppercase', letterSpacing:'0.1em', color:'var(--tx-muted)',
        display:'flex', justifyContent:'space-between', alignItems:'center'
      }}>
        <span>Uploaded files</span>
        {Array.isArray(selectedFiles) && selectedFiles.length > 0 && (
          <span style={{ color:'var(--accent)', fontWeight:600, fontSize:'10px' }}>
            {selectedFiles.length} selected for query
          </span>
        )}
      </div>

      {/* ── File list ── */}
      <div className="upload-list">
        {uploads.length === 0 && <div className="empty-hint">No files uploaded yet.</div>}
        {uploads.map((f, i) => {
          const name     = fname(f)
          const size     = fsize(f)
          const selected = isSelected(name)
          return (
            <div
              key={`uploaded-${name || i}`}
              className={`upload-item${selected ? ' upload-item-selected' : ''}`}
              style={{ cursor:'pointer' }}
              onClick={() => toggleSelect(name)}
            >
              <span style={{
                width:14, height:14, flexShrink:0,
                border:`2px solid ${selected ? 'var(--accent)' : 'var(--bd-mid)'}`,
                borderRadius:3, display:'inline-flex', alignItems:'center',
                justifyContent:'center', background: selected ? 'var(--accent)' : 'transparent',
                color:'#fff', fontSize:9, marginRight:6
              }}>
                {selected ? '✓' : ''}
              </span>
              <span className="upload-icon">{fileIcon(name)}</span>
              <span className="upload-name">
                {name || <em style={{ color:'var(--tx-muted)' }}>unnamed</em>}
              </span>
              <span className="upload-size">{formatBytes(size)}</span>
              {/* Delete only for operator+ */}
              {canDelete && (
                <button
                  className="del-btn"
                  title="Delete file"
                  onClick={(e) => { e.stopPropagation(); handleDeleteUpload(name) }}
                >🗑</button>
              )}
            </div>
          )
        })}
      </div>

      {Array.isArray(selectedFiles) && selectedFiles.length > 0 && (
        <div style={{
          padding:'8px 16px', fontSize:'11px', color:'var(--tx-muted)',
          borderTop:'1px solid var(--bd-subtle)', display:'flex',
          alignItems:'center', justifyContent:'space-between'
        }}>
          <span>ℹ️ Selected files included in next agent run</span>
          <button
            style={{ background:'none', border:'none', color:'var(--tx-hint)', cursor:'pointer', fontSize:11, textDecoration:'underline' }}
            onClick={() => setSelectedFiles([])}
          >Clear</button>
        </div>
      )}
    </div>
  )
}

const viewerBanner = {
  margin: '10px 16px',
  padding: '8px 12px',
  borderRadius: 7,
  background: 'rgba(99,102,241,0.08)',
  border: '1px solid rgba(99,102,241,0.2)',
  color: '#a5b4fc',
  fontSize: 12,
}
