import '../../styles/App.css'

export default function ModelPickerPanel({
  availableModels, selectedModel, setSelectedModel,
  currentModel, modelSaving, modelError,
  handleModelChange, onClose
}) {
  // availableModels is string[], currentModel is string
  const current = typeof currentModel === 'string' ? currentModel : ''

  return (
    <div className="overlay-panel model-panel">
      <div className="overlay-header">
        <span>🤖 Select Model</span>
        <button className="overlay-close" onClick={onClose}>✕</button>
      </div>

      <div style={{ padding:'0.55rem 0.8rem', borderBottom:'1px solid var(--bd-subtle)', fontSize:'0.62rem', color:'var(--tx-muted)', fontWeight:700, textTransform:'uppercase', letterSpacing:'0.1em' }}>
        Available Models
      </div>

      <div className="model-list" style={{ flex:1, overflowY:'auto' }}>
        {availableModels.length === 0 && (
          <div style={{ padding:'1.2rem', color:'var(--tx-muted)', fontSize:'0.72rem', textAlign:'center' }}>
            No models found. Is Ollama running?
          </div>
        )}

        {availableModels.map((m, i) => {
          // m is a plain string
          const name = typeof m === 'string' ? m : (m?.name ?? String(m))
          return (
            <label
              key={`model-${name}-${i}`}
              className={`model-option${selectedModel === name ? ' selected' : ''}`}
              onClick={() => setSelectedModel(name)}
            >
              <input
                type="radio"
                name="model"
                value={name}
                checked={selectedModel === name}
                onChange={() => setSelectedModel(name)}
                style={{ accentColor:'var(--accent)' }}
              />
              <div style={{ flex:1, minWidth:0 }}>
                <div style={{ fontWeight:700, fontSize:'0.78rem', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap', color:'var(--tx-primary)' }}>
                  {name}
                </div>
                <div style={{ fontSize:'0.59rem', color:'var(--tx-muted)', marginTop:'0.1rem' }}>
                  {current === name
                    ? <span style={{ color:'var(--success)' }}>● active</span>
                    : <span style={{ color:'var(--tx-hint)' }}>○ pulled</span>}
                </div>
              </div>
              {current === name && <span className="badge-active">active</span>}
            </label>
          )
        })}

        {/* Custom model input */}
        <div className="model-option" style={{ cursor:'default', flexDirection:'column', alignItems:'stretch', gap:6 }}>
          <div style={{ fontSize:'0.62rem', color:'var(--tx-muted)', fontWeight:700, textTransform:'uppercase', letterSpacing:'0.08em', marginBottom:2 }}>Custom</div>
          <input
            className="topic-input"
            style={{ marginBottom:0, fontSize:'0.72rem', padding:'6px 10px' }}
            value={selectedModel}
            onChange={e => setSelectedModel(e.target.value)}
            placeholder="e.g. llama3:8b-instruct"
          />
        </div>
      </div>

      {modelError && (
        <div className="error-msg" style={{ margin:'0 0.8rem 0.4rem' }}>{modelError}</div>
      )}

      <div style={{ padding:'0.65rem 0.8rem', borderTop:'1px solid var(--bd-subtle)', display:'flex', flexDirection:'column', gap:'0.4rem' }}>
        {selectedModel !== current && (
          <div style={{ fontSize:'0.62rem', color:'var(--warning)', padding:'0.3rem 0.5rem', background:'rgba(245,158,11,0.07)', border:'1px solid rgba(245,158,11,0.2)', borderRadius:'var(--radius)', lineHeight:1.5 }}>
            ⚠️ If model is not pulled, run:<br />
            <code style={{ fontFamily:'var(--mono)', fontSize:'0.6rem' }}>ollama pull {selectedModel}</code>
          </div>
        )}
        <button
          className="run-btn"
          onClick={handleModelChange}
          disabled={modelSaving || selectedModel === current}
        >
          {modelSaving ? '⟳ Applying…' : selectedModel === current ? `✓ ${current} active` : `Apply ${selectedModel}`}
        </button>
      </div>
    </div>
  )
}
