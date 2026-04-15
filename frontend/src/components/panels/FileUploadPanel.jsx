import '../../styles/App.css'
import { useRef } from 'react'
import { fileIcon, formatBytes } from '../../utils/helpers'

export default function FileUploadPanel({
  uploads, uploading, selectedFiles, setSelectedFiles,
  handleFileUpload, handleDeleteUpload, onClose
}) {
  const fileInputRef = useRef(null)
  const pendingRef   = useRef([])

  const onFilesChosen = (e) => {
    const files = Array.from(e.target.files || [])
    if (!files.length) return
    pendingRef.current = files
    // show pending list in UI via a local state trick — re-use input value display
    e.target._pendingFiles = files
    // force re-render by toggling a dummy state via the parent's setSelectedFiles
    // We keep pendingRef separate so selectedFiles (string[]) stays clean for the run
    _setPending(files)
  }

  // Local state for pending File objects (pre-upload)
  const [pendingFiles, _setPending] = (() => {
    // inline useState-like via useRef + forceUpdate pattern
    // simpler: just re-declare as a module-level ref — but hooks rules require
    // us to use React.useState here
    // eslint-disable-next-line react-hooks/rules-of-hooks
    const { useState } = require('react')
    // eslint-disable-next-line react-hooks/rules-of-hooks
    return useState([])
  })()

  const onUploadClick = async () => {
    if (!pendingFiles.length || uploading) return
    const dt = new DataTransfer()
    pendingFiles.forEach(f => dt.items.add(f))
    const syntheticEvt = { target: { files: dt.files } }
    await handleFileUpload(syntheticEvt)
    _setPending([])
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  // Resolve the string filename from either API shape
  const fname = (f) => f.filename ?? f.name ?? ''
  const fsize  = (f) => f.size     ?? f.file_size ?? null

  // Toggle a filename in/out of selectedFiles (string[] used by run job)
  const toggleSelect = (filename) => {
    setSelectedFiles(prev =>
      prev.includes(filename)
        ? prev.filter(n => n !== filename)
        : [...prev, filename]
    )
  }

  return (
    <div className="overlay-panel upload-panel">
      <div className="overlay-header">
        <span>📎 File Manager</span>
        <button className="overlay-close" onClick={onClose}>✕</button>
      </div>

      {/* Drop / click zone */}
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
            ? `${pendingFiles.length} file(s) selected — click Upload below`
            : 'Click to select files to upload'}
        </div>
      </div>

      {/* Pending files + upload button */}
      {pendingFiles.length > 0 && (
        <>
          <div className="upload-list" style={{ marginBottom:0 }}>
            {pendingFiles.map((f, i) => (
              <div key={`pending-${f.name}-${i}`} className="upload-item" style={{ opacity:0.7 }}>
                <span className="upload-icon">{fileIcon(f.name)}</span>
                <span className="upload-name">{f.name}</span>
                <span className="upload-size">{formatBytes(f.size)}</span>
                <span style={{ fontSize:'0.6rem', color:'var(--tx-muted)' }}>pending</span>
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

      {/* Already-uploaded files */}
      <div style={{ padding:'6px 16px 4px', fontSize:'10px', fontWeight:700, textTransform:'uppercase', letterSpacing:'0.1em', color:'var(--tx-muted)', display:'flex', justifyContent:'space-between', alignItems:'center' }}>
        <span>Uploaded files</span>
        {selectedFiles.length > 0 && (
          <span style={{ color:'var(--accent)', fontWeight:600 }}>{selectedFiles.length} selected for query</span>
        )}
      </div>

      <div className="upload-list">
        {uploads.length === 0 && (
          <div className="empty-hint">No files uploaded yet.</div>
        )}
        {uploads.map((f, i) => {
          const name     = fname(f)
          const size     = fsize(f)
          const selected = selectedFiles.includes(name)
          return (
            <div
              key={`uploaded-${name || i}-${i}`}
              className={`upload-item${selected ? ' upload-item-selected' : ''}`}
              style={{ cursor:'pointer' }}
              onClick={() => name && toggleSelect(name)}
            >
              {/* Checkbox */}
              <span style={{
                width:15, height:15, border:`2px solid ${selected ? 'var(--accent)' : 'var(--bd-mid)'}`,
                borderRadius:3, display:'inline-flex', alignItems:'center', justifyContent:'center',
                flexShrink:0, background: selected ? 'var(--accent)' : 'transparent',
                color:'#fff', fontSize:9, marginRight:4
              }}>
                {selected ? '✓' : ''}
              </span>
              <span className="upload-icon">{fileIcon(name)}</span>
              <span className="upload-name">{name || <em style={{ color:'var(--tx-muted)' }}>unknown</em>}</span>
              <span className="upload-size">{formatBytes(size)}</span>
              <button
                className="del-btn"
                title="Delete"
                onClick={(e) => { e.stopPropagation(); handleDeleteUpload(name) }}
              >🗑</button>
            </div>
          )
        })}
      </div>

      {selectedFiles.length > 0 && (
        <div style={{ padding:'8px 16px', fontSize:'11px', color:'var(--tx-muted)', borderTop:'1px solid var(--bd-subtle)' }}>
          ℹ️ Selected files will be included in the next agent run query.
          <button
            style={{ marginLeft:8, background:'none', border:'none', color:'var(--tx-hint)', cursor:'pointer', fontSize:11, textDecoration:'underline' }}
            onClick={() => setSelectedFiles([])}
          >
            Clear all
          </button>
        </div>
      )}
    </div>
  )
}
