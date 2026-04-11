export default function ModelPickerPanel({
  availableModels, selectedModel, setSelectedModel,
  currentModel, modelSaving, modelError,
  handleModelChange, onClose
}) {
  return (
    <div className="overlay-panel model-panel">
      <div className="overlay-header">
        <span>🤖 Select Model</span>
        <button className="overlay-close" onClick={onClose}>✕</button>
      </div>

      <div style={{ padding:'0.55rem 0.8rem', borderBottom:'1px solid var(--border)', fontSize:'0.62rem', color:'var(--tx-muted)', fontWeight:700, textTransform:'uppercase', letterSpacing:'0.1em' }}>
        Available Models
      </div>

      <div className="model-list" style={{ flex:1, overflowY:'auto' }}>
        {availableModels.map(m => (
          <label key={m.name} className={`model-option ${selectedModel === m.name ? 'selected' : ''}`} onClick={() => setSelectedModel(m.name)}>
            <input type="radio" name="model" value={m.name} checked={selectedModel === m.name} onChange={() => setSelectedModel(m.name)} />
            <div style={{ flex:1, minWidth:0 }}>
              <div style={{ fontWeight:700, fontSize:'0.78rem', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{m.name}</div>
              {m.description && <div style={{ fontSize:'0.62rem', color:'var(--tx-muted)', marginTop:'0.1rem' }}>{m.description}</div>}
              <div style={{ fontSize:'0.59rem', color:'var(--tx-hint)', marginTop:'0.12rem' }}>
                {m.size_gb ? `${m.size_gb} GB` : ''}
                {m.pulled === false
                  ? <span style={{ color:'var(--warning)', marginLeft:4 }}>not pulled</span>
                  : <span style={{ color:'var(--success)', marginLeft:4 }}>pulled</span>}
              </div>
            </div>
            {currentModel === m.name && <span className="badge-active">active</span>}
          </label>
        ))}

        {availableModels.length === 0 && (
          <div style={{ padding:'1rem', color:'var(--tx-muted)', fontSize:'0.72rem', textAlign:'center' }}>
            No models found. Is Ollama running?
          </div>
        )}

        {/* Custom model input */}
        <div className="model-option" style={{ cursor:'default', flexDirection:'column', alignItems:'stretch', gap:4 }}>
          <div style={{ fontSize:'0.62rem', color:'var(--tx-muted)', fontWeight:700, textTransform:'uppercase', letterSpacing:'0.08em' }}>Custom</div>
          <input
            className="topic-input"
            style={{ marginBottom:0 }}
            value={selectedModel}
            onChange={e => setSelectedModel(e.target.value)}
            placeholder="e.g. llama3:8b-instruct"
          />
        </div>
      </div>

      {modelError && <div className="error-msg" style={{ padding:'0 0.8rem 0.4rem' }}>{modelError}</div>}

      <div style={{ padding:'0.65rem 0.8rem', borderTop:'1px solid var(--border)', display:'flex', flexDirection:'column', gap:'0.4rem' }}>
        {selectedModel !== currentModel && (
          <div style={{ fontSize:'0.62rem', color:'var(--warning)', padding:'0.3rem 0.5rem', background:'rgba(245,158,11,0.07)', border:'1px solid rgba(245,158,11,0.2)', borderRadius:'var(--radius)', lineHeight:1.5 }}>
            ⚠️ If model is not pulled, run:<br />
            <code style={{ fontFamily:'var(--mono)', fontSize:'0.6rem' }}>ollama pull {selectedModel}</code>
          </div>
        )}
        <button
          className="run-btn"
          onClick={handleModelChange}
          disabled={modelSaving || selectedModel === currentModel}
        >
          {modelSaving ? '⟳ Applying…' : `Apply ${selectedModel}`}
        </button>
      </div>
    </div>
  )
}
