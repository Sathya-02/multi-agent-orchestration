import '../../styles/App.css'

export default function KnowledgeBasePanel({
  kbTab, setKbTab, kbEntries, kbConfig, setKbConfig, kbConfigSaving,
  kbUploading, kbSearchQ, setKbSearchQ, kbSearchResult, kbSearching,
  kbPasteText, setKbPasteText, kbPasteName, setKbPasteName,
  kbPasteTags, setKbPasteTags, kbFileRef,
  ragQuery, setRagQuery, ragTopK, setRagTopK, ragLoading, ragResult,
  handleSaveKbConfig, handleKbFileUpload, handleKbPasteIngest,
  handleDeleteKbSource, handleClearKb, handleKbSearch, handleRagQuery,
  onClose
}) {
  return (
    <div className="overlay-panel kb-panel">
      <div className="overlay-header">
        <span>📚 Knowledge Base</span>
        <button className="overlay-close" onClick={onClose}>✕</button>
      </div>

      <div className="agent-tabs">
        {['browse','ingest','search','rag','config'].map(t => (
          <button key={t} className={`agent-tab${kbTab===t?' active':''}`} onClick={() => setKbTab(t)}>
            {{ browse:'📋 Browse', ingest:'⬆ Ingest', search:'🔍 Search', rag:'🧠 RAG', config:'⚙️ Config' }[t]}
          </button>
        ))}
      </div>

      {/* BROWSE */}
      {kbTab === 'browse' && (
        <div className="kb-body">
          <div className="kb-stats">{kbEntries.count ?? 0} chunks · {(kbEntries.sources || []).length} sources</div>
          {(kbEntries.sources || []).length === 0 && <div className="empty-hint">Knowledge base is empty.</div>}
          {(kbEntries.sources || []).map(s => (
            <div key={s} className="kb-source-row">
              <span className="kb-source-name">{s}</span>
              <button className="del-btn" onClick={() => handleDeleteKbSource(s)}>🗑</button>
            </div>
          ))}
          {(kbEntries.sources || []).length > 0 && (
            <button className="run-btn" style={{ marginTop: '0.8rem', background: 'var(--error)' }} onClick={handleClearKb}>🗑 Clear All</button>
          )}
        </div>
      )}

      {/* INGEST */}
      {kbTab === 'ingest' && (
        <div className="kb-body">
          <div className="kb-sub-title">Upload file</div>
          <input ref={kbFileRef} type="file" multiple style={{ display:'none' }} onChange={handleKbFileUpload} />
          <button className="run-btn" onClick={() => kbFileRef.current?.click()} disabled={kbUploading}>
            {kbUploading ? '⟳ Ingesting…' : '⬆ Select & Ingest File'}
          </button>

          <div className="kb-sub-title" style={{ marginTop: '1rem' }}>Paste text</div>
          <div className="form-row">
            <label className="form-label">Name</label>
            <input className="topic-input" value={kbPasteName} onChange={e => setKbPasteName(e.target.value)} placeholder="my-note" />
          </div>
          <div className="form-row">
            <label className="form-label">Tags</label>
            <input className="topic-input" value={kbPasteTags} onChange={e => setKbPasteTags(e.target.value)} placeholder="tag1,tag2" />
          </div>
          <textarea className="skills-editor" value={kbPasteText} onChange={e => setKbPasteText(e.target.value)} placeholder="Paste text content here…" rows={8} />
          <button className="run-btn" onClick={handleKbPasteIngest} disabled={kbUploading || !kbPasteText.trim()}>
            {kbUploading ? '⟳ Ingesting…' : '💾 Ingest Text'}
          </button>
        </div>
      )}

      {/* SEARCH */}
      {kbTab === 'search' && (
        <div className="kb-body">
          <div className="kb-search-row">
            <input className="topic-input" style={{ flex: 1 }} value={kbSearchQ} onChange={e => setKbSearchQ(e.target.value)} onKeyDown={e => e.key === 'Enter' && handleKbSearch()} placeholder="Search knowledge base…" />
            <button className="run-btn" style={{ width: 'auto', padding: '0 0.8rem' }} onClick={handleKbSearch} disabled={kbSearching}>
              {kbSearching ? '⟳' : '🔍'}
            </button>
          </div>
          {kbSearchResult && (
            <div className="kb-results">
              {(kbSearchResult.results || []).length === 0 && <div className="empty-hint">No results.</div>}
              {(kbSearchResult.results || []).map((r, i) => (
                <div key={i} className="kb-result-card">
                  <div className="kb-result-meta">{r.source} · score {r.score?.toFixed(2)}</div>
                  <div className="kb-result-text">{r.text?.slice(0, 300)}</div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* RAG */}
      {kbTab === 'rag' && (
        <div className="kb-body">
          <div className="form-row">
            <label className="form-label">Query</label>
            <input className="topic-input" value={ragQuery} onChange={e => setRagQuery(e.target.value)} placeholder="Ask anything from the KB…" />
          </div>
          <div className="form-row">
            <label className="form-label">Top-K</label>
            <input type="number" className="topic-input" value={ragTopK} onChange={e => setRagTopK(+e.target.value)} min={1} max={20} />
          </div>
          <button className="run-btn" onClick={handleRagQuery} disabled={ragLoading || !ragQuery.trim()}>
            {ragLoading ? '⟳ Querying…' : '🧠 Run RAG Query'}
          </button>
          {ragResult && (
            <div className="kb-results">
              <div className="kb-result-card">
                <div className="kb-result-meta">Answer</div>
                <div className="kb-result-text">{ragResult.answer || ragResult.response || JSON.stringify(ragResult).slice(0,400)}</div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* CONFIG */}
      {kbTab === 'config' && (
        <div className="kb-body">
          <label className="form-check">
            <input type="checkbox" checked={kbConfig.enabled} onChange={e => setKbConfig({...kbConfig, enabled: e.target.checked})} />
            Enable Knowledge Base
          </label>
          {[['embed_model','Embed Model','nomic-embed-text'],['chunk_size','Chunk Size',400],['chunk_overlap','Overlap',80],['top_k','Top-K',4],['min_score','Min Score',0.25]].map(([k, lbl, ph]) => (
            <div className="form-row" key={k}>
              <label className="form-label">{lbl}</label>
              <input className="topic-input" type={typeof ph === 'number' ? 'number' : 'text'} value={kbConfig[k] ?? ''} onChange={e => setKbConfig({...kbConfig, [k]: typeof ph === 'number' ? +e.target.value : e.target.value})} placeholder={String(ph)} />
            </div>
          ))}
          <label className="form-check">
            <input type="checkbox" checked={kbConfig.use_ollama_embed} onChange={e => setKbConfig({...kbConfig, use_ollama_embed: e.target.checked})} />
            Use Ollama embeddings
          </label>
          <button className="run-btn" onClick={handleSaveKbConfig} disabled={kbConfigSaving}>
            {kbConfigSaving ? '⟳ Saving…' : '💾 Save Config'}
          </button>
        </div>
      )}
    </div>
  )
}
