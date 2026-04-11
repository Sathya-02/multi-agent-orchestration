import '../../styles/App.css'
import { useRef } from 'react'
import { fileIcon, formatBytes } from '../../utils/helpers'

export default function FileUploadPanel({
  uploads, uploading, selectedFiles, setSelectedFiles,
  handleFileUpload, handleDeleteUpload, onClose
}) {
  const fileInputRef = useRef(null)

  return (
    <div className="overlay-panel upload-panel">
      <div className="overlay-header">
        <span>📎 File Manager</span>
        <button className="overlay-close" onClick={onClose}>✕</button>
      </div>

      <div className="upload-drop-area" onClick={() => fileInputRef.current?.click()}>
        <input
          ref={fileInputRef}
          type="file"
          multiple
          style={{ display: 'none' }}
          onChange={e => setSelectedFiles(Array.from(e.target.files))}
        />
        <div className="upload-drop-icon">📂</div>
        <div className="upload-drop-text">
          {selectedFiles.length > 0
            ? `${selectedFiles.length} file(s) selected`
            : 'Click to select files'}
        </div>
      </div>

      {/* Selected (not yet uploaded) file list */}
      {selectedFiles.length > 0 && (
        <>
          <div className="upload-list" style={{ marginBottom: 0 }}>
            {selectedFiles.map((f, i) => (
              <div key={`pending-${f.name}-${i}`} className="upload-item" style={{ opacity: 0.7 }}>
                <span className="upload-icon">{fileIcon(f.name)}</span>
                <span className="upload-name">{f.name}</span>
                <span className="upload-size">{formatBytes(f.size)}</span>
                <span style={{ fontSize: '0.6rem', color: 'var(--tx-muted)' }}>pending</span>
              </div>
            ))}
          </div>
          <button
            className="run-btn"
            style={{ margin: '0 0.8rem 0.6rem' }}
            onClick={handleFileUpload}
            disabled={uploading}
          >
            {uploading ? '⟳ Uploading…' : `⬆ Upload ${selectedFiles.length} file(s)`}
          </button>
        </>
      )}

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
