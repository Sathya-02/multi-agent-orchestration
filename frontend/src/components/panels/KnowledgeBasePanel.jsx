import '../../styles/App.css'

export default function KnowledgeBasePanel({
  kbTab, setKbTab,
  kbEntries, kbConfig, setKbConfig, kbConfigSaving, kbUploading,
  kbSearchQ, setKbSearchQ, kbSearchResult, kbSearching,
  kbPasteText, setKbPasteText, kbPasteName, setKbPasteName, kbPasteTags, setKbPasteTags,
  kbFileRef,
  ragQuery, setRagQuery, ragTopK, setRagTopK, ragLoading, ragResult,
  handleSaveKbConfig, handleKbFileUpload, handleKbPasteIngest,
  handleDeleteKbSource, handleClearKb, handleKbSearch, handleRagQuery,
  onClose
}) {
  const sources  = Array.isArray(kbEntries?.sources)  ? kbEntries.sources  : []
  const count    = kbEntries?.count ?? 0

  const TABS = [
    ['browse',   '📚 Browse'],
    ['ingest',   '⬆ Ingest'],
    ['search',   '🔍 Search'],
    ['rag',      '💬 RAG Query'],
    ['config',   '⚙️ Config'],
  ]

  const Row = ({ label, children }) => (
    <div className="tg-config-row">
      <div className="tg-label">{label}</div>
      {children}
    </div>
  )

  // Safely extract a renderable answer string from ragResult
  const ragAnswerText = (() => {
    if (!ragResult) return null
    if (typeof ragResult === 'string') return ragResult
    if (typeof ragResult.answer === 'string') return ragResult.answer
    if (typeof ragResult.response === 'string') return ragResult.response
    if (typeof ragResult.text === 'string') return ragResult.text
    // Fallback: show chunks list if present
    if (Array.isArray(ragResult.chunks)) {
      return ragResult.chunks.map((c, i) => {
        const text = typeof c === 'string' ? c : (c.text || c.content || JSON.stringify(c))
        return `[${i + 1}] ${text}`
      }).join('\n\n')
    }
    // Last resort: stringify to avoid crashing
    return JSON.stringify(ragResult, null, 2)
  })()

  return (
    <div className="overlay-panel kb-panel">
      <div className="overlay-header">
        <span>📚 Knowledge Base <span style={{ fontSize:11, color:'var(--tx-muted)', fontWeight:400 }}>({count} chunks)</span></span>
        <button className="overlay-close" onClick={onClose}>✕</button>
      </div>

      {/* Tabs */}
      <div className="agent-tabs">
        {TABS.map(([k,v]) => (
          <button key={k} className={`agent-tab${kbTab === k ? ' active' : ''}`} onClick={() => setKbTab(k)}>{v}</button>
        ))}
      </div>

      {/* ── BROWSE ── */}
      {kbTab === 'browse' && (
        <div className="kb-body">
          <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:10 }}>
            <div style={{ fontSize:12, color:'var(--tx-secondary)' }}>{sources.length} source(s) · {count} chunk(s)</div>
            {sources.length > 0 && (
              <button className="agent-action-btn danger"
                onClick={() => { if(window.confirm('Clear entire KB?')) handleClearKb() }}>
                🗑 Clear All
              </button>
            )}
          </div>
          {sources.length === 0 && <div className="empty-hint">Knowledge base is empty. Use Ingest to add documents.</div>}
          {sources.map((src, i) => (
            <div key={`${src.name}-${i}`} className="kb-source-card">
              <span style={{ fontSize:18 }}>📄</span>
              <div style={{ flex:1, minWidth:0 }}>
                <div className="kb-source-name">{src.name || src.source}</div>
                {src.tags?.length > 0 && (
                  <div className="tool-tags">
                    {src.tags.map(t => <span key={t} className="tool-tag">{t}</span>)}
                  </div>
                )}
              </div>
              <span className="kb-source-meta">{src.chunk_count || '?'} chunks</span>
              <button className="del-btn" onClick={() => handleDeleteKbSource(src.name || src.source)} title="Delete source">🗑</button>
            </div>
          ))}
        </div>
      )}

      {/* ── INGEST ── */}
      {kbTab === 'ingest' && (
        <div className="kb-body">
          {/* File upload */}
          <div className="settings-section-title">Upload File</div>
          <input ref={kbFileRef} type="file" style={{ display:'none' }}
            accept=".pdf,.txt,.md,.docx,.csv,.json"
            onChange={handleKbFileUpload} />
          <button className="run-btn" style={{ marginBottom:14 }}
            onClick={() => kbFileRef.current?.click()}
            disabled={kbUploading}>
            {kbUploading ? '⟳ Ingesting…' : '📂 Choose File to Ingest'}
          </button>

          {/* Paste text */}
          <div className="settings-section-title">Paste Text</div>
          <Row label="Name">
            <input className="topic-input"
              value={kbPasteName}
              onChange={e => setKbPasteName(e.target.value)}
              placeholder="Document name" />
          </Row>
          <Row label="Tags (comma-sep)">
            <input className="topic-input"
              value={kbPasteTags}
              onChange={e => setKbPasteTags(e.target.value)}
              placeholder="tag1, tag2" />
          </Row>
          <textarea className="topic-input"
            value={kbPasteText}
            onChange={e => setKbPasteText(e.target.value)}
            rows={8}
            placeholder="Paste document content here…" />
          <button className="run-btn" style={{ marginTop:8 }}
            onClick={handleKbPasteIngest}
            disabled={kbUploading || !kbPasteText.trim()}>
            {kbUploading ? '⟳ Ingesting…' : '⬆ Ingest Text'}
          </button>
        </div>
      )}

      {/* ── SEARCH ── */}
      {kbTab === 'search' && (
        <div className="kb-body">
          <div className="settings-section-title">Vector Search</div>
          <div style={{ display:'flex', gap:8, marginBottom:10 }}>
            <input className="topic-input" style={{ flex:1, marginBottom:0 }}
              value={kbSearchQ}
              onChange={e => setKbSearchQ(e.target.value)}
              onKeyDown={e => e.key==='Enter' && handleKbSearch()}
              placeholder="Search KB…" />
            <button className="fs-apply-btn" onClick={handleKbSearch} disabled={kbSearching}>
              {kbSearching ? '…' : '🔍'}
            </button>
          </div>
          {kbSearchResult && (
            <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
              {(kbSearchResult.results || []).map((r, i) => (
                <div key={i} style={{ padding:'9px 11px', borderRadius:7, background:'rgba(58,127,255,0.05)', border:'1px solid var(--bd-subtle)' }}>
                  <div style={{ display:'flex', justifyContent:'space-between', marginBottom:4 }}>
                    <span style={{ fontSize:11, fontWeight:700, color:'var(--tx-primary)' }}>{r.source || '?'}</span>
                    <span style={{ fontSize:10, color:'var(--tx-muted)' }}>score: {r.score?.toFixed(3)}</span>
                  </div>
                  <div style={{ fontSize:11, color:'var(--tx-secondary)', lineHeight:1.5, whiteSpace:'pre-wrap' }}>{r.text}</div>
                </div>
              ))}
              {(kbSearchResult.results || []).length === 0 && (
                <div className="empty-hint">No results found.</div>
              )}
            </div>
          )}
        </div>
      )}

      {/* ── RAG QUERY ── */}
      {kbTab === 'rag' && (
        <div className="kb-body">
          <div className="settings-section-title">RAG Query (KB-augmented answer)</div>
          <textarea className="topic-input"
            value={ragQuery}
            onChange={e => setRagQuery(e.target.value)}
            rows={4}
            placeholder="Ask a question answered by your KB…" />
          <Row label={`Top K results: ${ragTopK}`}>
            <input type="range" min={1} max={10} value={ragTopK} onChange={e => setRagTopK(+e.target.value)}
              style={{ width:'100%' }} />
          </Row>
          <button className="run-btn" style={{ marginTop:8 }}
            onClick={handleRagQuery}
            disabled={ragLoading || !ragQuery.trim()}>
            {ragLoading ? '⟳ Querying…' : '💬 Run RAG Query'}
          </button>

          {ragAnswerText && (
            <div style={{ marginTop:12, padding:'10px 14px', background:'rgba(58,127,255,0.05)', border:'1px solid var(--bd-subtle)', borderRadius:8 }}>
              <div style={{ fontSize:10, fontWeight:700, color:'var(--tx-muted)', textTransform:'uppercase', letterSpacing:'0.08em', marginBottom:6 }}>Answer</div>
              <div style={{ fontSize:12, color:'var(--tx-secondary)', lineHeight:1.6, whiteSpace:'pre-wrap' }}>{ragAnswerText}</div>
            </div>
          )}

          {/* Show retrieved chunks if available */}
          {ragResult && Array.isArray(ragResult.chunks) && ragResult.chunks.length > 0 && (
            <div style={{ marginTop:10 }}>
              <div style={{ fontSize:10, fontWeight:700, color:'var(--tx-muted)', textTransform:'uppercase', letterSpacing:'0.08em', marginBottom:6 }}>
                Retrieved Chunks ({ragResult.chunks.length})
              </div>
              <div style={{ display:'flex', flexDirection:'column', gap:6 }}>
                {ragResult.chunks.map((c, i) => {
                  const text   = typeof c === 'string' ? c : (c.text || c.content || '')
                  const source = typeof c === 'object' ? (c.source || '') : ''
                  const score  = typeof c === 'object' ? c.score : undefined
                  return (
                    <div key={i} style={{ padding:'8px 10px', borderRadius:6, background:'rgba(255,255,255,0.03)', border:'1px solid var(--bd-subtle)' }}>
                      <div style={{ display:'flex', justifyContent:'space-between', marginBottom:3 }}>
                        <span style={{ fontSize:10, fontWeight:700, color:'var(--tx-primary)' }}>{source || `chunk ${i+1}`}</span>
                        {score != null && <span style={{ fontSize:10, color:'var(--tx-muted)' }}>score: {score.toFixed(3)}</span>}
                      </div>
                      <div style={{ fontSize:11, color:'var(--tx-secondary)', lineHeight:1.5, whiteSpace:'pre-wrap' }}>{text}</div>
                    </div>
                  )
                })}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── CONFIG ── */}
      {kbTab === 'config' && (
        <div className="kb-body">
          <div className="settings-section-title">KB Configuration</div>
          <div className="si-row">
            <span className="si-label">Enabled</span>
            <button className={`si-toggle ${kbConfig.enabled ? 'on' : 'off'}`}
              onClick={() => setKbConfig({ ...kbConfig, enabled: !kbConfig.enabled })}>
              {kbConfig.enabled ? '🟢 On' : '🔴 Off'}
            </button>
          </div>
          <Row label="Embed Model">
            <input className="topic-input"
              value={kbConfig.embed_model || ''}
              onChange={e => setKbConfig({ ...kbConfig, embed_model: e.target.value })}
              placeholder="nomic-embed-text" />
          </Row>
          <Row label="Chunk Size">
            <input className="topic-input" type="number" min={50} max={2000}
              value={kbConfig.chunk_size || 400}
              onChange={e => setKbConfig({ ...kbConfig, chunk_size: +e.target.value })} />
          </Row>
          <Row label="Chunk Overlap">
            <input className="topic-input" type="number" min={0} max={500}
              value={kbConfig.chunk_overlap || 80}
              onChange={e => setKbConfig({ ...kbConfig, chunk_overlap: +e.target.value })} />
          </Row>
          <Row label="Top K">
            <input className="topic-input" type="number" min={1} max={20}
              value={kbConfig.top_k || 4}
              onChange={e => setKbConfig({ ...kbConfig, top_k: +e.target.value })} />
          </Row>
          <Row label="Min Score (0–1)">
            <input className="topic-input" type="number" min={0} max={1} step={0.05}
              value={kbConfig.min_score || 0.25}
              onChange={e => setKbConfig({ ...kbConfig, min_score: +e.target.value })} />
          </Row>
          <div className="si-row">
            <span className="si-label">Use Ollama Embeddings</span>
            <button className={`si-toggle ${kbConfig.use_ollama_embed ? 'on' : 'off'}`}
              onClick={() => setKbConfig({ ...kbConfig, use_ollama_embed: !kbConfig.use_ollama_embed })}>
              {kbConfig.use_ollama_embed ? '🟢 On' : '🔴 Off'}
            </button>
          </div>
          <button className="run-btn" style={{ marginTop:10 }} onClick={handleSaveKbConfig} disabled={kbConfigSaving}>
            {kbConfigSaving ? '⟳ Saving…' : '💾 Save Config'}
          </button>
        </div>
      )}
    </div>
  )
}
