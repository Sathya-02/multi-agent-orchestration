import '../../styles/App.css'
import { useRef } from 'react'
import { fileIcon, formatBytes } from '../../utils/helpers'

export default function FileUploadPanel({
  uploads, uploading, selectedFiles, setSelectedFiles,
  handleFileUpload, handleDeleteUpload, onClose
}) {
  const fileInputRef = useRef(null)

  // handleFileUpload in App.jsx expects a file-input change event.
  // We proxy it: call with a synthetic-like object so the handler works.
  const onFilesChosen = (e) => {
    const files = Array.from(e.target.files || [])
    if (!files.length) return
    setSelectedFiles(files)
  }

  const onUploadClick = async () => {
    if (!selectedFiles.length || uploading) return
    // Build a synthetic event-like object from already-selected files
    const dt = new DataTransfer()
    selectedFiles.forEach(f => dt.items.add(f))
    const syntheticEvt = { target: { files: dt.files } }
    await handleFileUpload(syntheticEvt)
    setSelectedFiles([])
    if (fileInputRef.current) fileInputRef.current.value = ''
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
          {selectedFiles.length > 0
            ? `${selectedFiles.length} file(s) selected — click Upload below`
            : 'Click to select files'}
        </div>
      </div>

      {/* Pending files + upload button */}
      {selectedFiles.length > 0 && (
        <>
          <div className="upload-list" style={{ marginBottom:0 }}>
            {selectedFiles.map((f, i) => (
              <div key={`pending-${f.name}-${i}`} className="upload-item" style={{ opacity:0.7 }}>
                <span className="upload-icon">{fileIcon(f.name)}</span>
                <span className="upload-name">{f.name}</span>
                <span className="upload-size">{formatBytes(f.size)}</span>
                <span style={{ fontSize:'0.6rem', color:'var(--tx-muted)' }}>pending</span>
              </div>
            ))}
          </div>
          <div style={{ padding:'0 16px 10px' }}>
            <button
              className="run-btn"
              onClick={onUploadClick}
              disabled={uploading}
            >
              {uploading ? '⟳ Uploading…' : `⬆ Upload ${selectedFiles.length} file(s)`}
            </button>
          </div>
        </>
      )}

      {/* Already-uploaded files */}
      <div style={{ padding:'0 16px 4px', fontSize:'10px', fontWeight:700, textTransform:'uppercase', letterSpacing:'0.1em', color:'var(--tx-muted)' }}>
        Uploaded files
      </div>
      <div className="upload-list">
        {uploads.length === 0 && (
          <div className="empty-hint">No files uploaded yet.</div>
        )}
        {uploads.map((f, i) => (
          <div key={`uploaded-${f.name ?? i}-${i}`} className="upload-item">
            <span className="upload-icon">{fileIcon(f.name)}</span>
            <span className="upload-name">{f.name}</span>
            <span className="upload-size">{formatBytes(f.size)}</span>
            <button
              className="del-btn"
              onClick={() => handleDeleteUpload(f.name)}
              title="Delete"
            >🗑</button>
          </div>
        ))}
      </div>
    </div>
  )
}
