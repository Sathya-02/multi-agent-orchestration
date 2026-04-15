/**
 * KnowledgeBasePanel.jsx
 *
 * RBAC enforcement:
 *   viewer   : Browse, Search, RAG Query tabs only (read)
 *   operator : + Ingest tab (upload/paste), delete source, clear KB, save config
 *   admin    : full access (same as operator for KB)
 */
import '../../styles/App.css'
import { useAuth } from '../../auth.jsx'
import { can } from '../../rbac.js'

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
  const { user } = useAuth()
  const canIngest    = can(user, 'ingest_kb')
  const canDelete    = can(user, 'delete_kb_source')
  const canClear     = can(user, 'clear_kb')
  const canSaveCfg   = can(user, 'save_kb_config')

  const sources = Array.isArray(kbEntries?.sources) ? kbEntries.sources : []
  const count   = kbEntries?.count ?? 0

  // Tabs available by role
  const ALL_TABS = [
    { key: 'browse', label: '📚 Browse',    minRole: 'viewer'   },
    { key: 'ingest', label: '⬆ Ingest',     minRole: 'operator' },
    { key: 'search', label: '🔍 Search',    minRole: 'viewer'   },
    { key: 'rag',    label: '💬 RAG Query', minRole: 'viewer'   },
    { key: 'config', label: '⚙️ Config',   minRole: 'operator' },
  ]
  const visibleTabs = ALL_TABS.filter(t => can(user, t.key === 'ingest' ? 'ingest_kb' : t.key === 'config' ? 'save_kb_config' : 'view_kb'))

  const Row = ({ label, children }) => (
    <div className="tg-config-row">
      <div className="tg-label">{label}</div>
      {children}
    </div>
  )

  const ragAnswerText = (() => {
    if (!ragResult) return null
    if (typeof ragResult === 'string') return ragResult
    if (typeof ragResult.answer === 'string') return ragResult.answer
    if (typeof ragResult.response === 'string') return ragResult.response
    if (typeof ragResult.text === 'string') return ragResult.text
    if (Array.isArray(ragResult.chunks)) {
      return ragResult.chunks.map((c, i) => {
        const text = typeof c === 'string' ? c : (c.text || c.content || JSON.stringify(c))
        return `[${i + 1}] ${text}`
      }).join('\n\n')
    }
    return JSON.stringify(ragResult, null, 2)
  })()

  const searchResults = Array.isArray(kbSearchResult) ? kbSearchResult : []

  // If current tab is now hidden (e.g. viewer was on Ingest), auto-switch to browse
  const activeTab = visibleTabs.find(t => t.key === kbTab) ? kbTab : 'browse'

  return (
    <div className="overlay-panel kb-panel">
      <div className="overlay-header">
        <span>📚 Knowledge Base <span style={{ fontSize:11, color:'var(--tx-muted)', fontWeight:400 }}>({count} chunks)</span></span>
        <button className="overlay-close" onClick={onClose}>✕</button>
      </div>

      {/* Tabs — only show role-permitted ones */}
      <div className="agent-tabs">
        {visibleTabs.map(({ key, label }) => (
          <button key={key} className={`agent-tab${activeTab === key ? ' active' : ''}`}
            onClick={() => setKbTab(key)}>{label}</button>
        ))}
      </div>

      {/* ── BROWSE ── */}
      {activeTab === 'browse' && (
        <div className="kb-body">
          <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:10 }}>
            <div style={{ fontSize:12, color:'var(--tx-secondary)' }}>{sources.length} source(s) · {count} chunk(s)</div>
            {canClear && sources.length > 0 && (
              <button className="agent-action-btn danger"
                onClick={() => { if(window.confirm('Clear entire KB?')) handleClearKb() }}>
                🗑 Clear All
              </button>
            )}
          </div>
          {sources.length === 0 && <div className="empty-hint">Knowledge base is empty. {canIngest ? 'Use Ingest to add documents.' : 'Contact an operator to add documents.'}</div>}
          {sources.map((src, i) => (
            <div key={`${src.name || src.source}-${i}`} className="kb-source-card">
              <span style={{ fontSize:18 }}>📄</span>
              <div style={{ flex:1, minWidth:0 }}>
                <div className="kb-source-name">{src.name || src.source}</div>
                {src.tags?.length > 0 && (
                  <div className="tool-tags">
                    {src.tags.map(t => <span key={t} className="tool-tag">{t}</span>)}
                  </div>
                )}
              </div>
              <span className="kb-source-meta">{src.chunks || src.chunk_count || '?'} chunks</span>
              {canDelete && (
                <button className="del-btn" onClick={() => handleDeleteKbSource(src.name || src.source)} title="Delete source">🗑</button>
              )}
            </div>
          ))}
        </div>
      )}

      {/* ── INGEST (operator+ only) ── */}
      {activeTab === 'ingest' && (
        <div className="kb-body">
          {canIngest ? (
            <>
              <div className="settings-section-title">Upload File</div>
              <input ref={kbFileRef} type="file" style={{ display:'none' }}
                accept=".pdf,.txt,.md,.docx,.csv,.json"
                onChange={handleKbFileUpload} />
              <button className="run-btn" style={{ marginBottom:14 }}
                onClick={() => kbFileRef.current?.click()}
                disabled={kbUploading}>
                {kbUploading ? '⟳ Ingesting…' : '📂 Choose File to Ingest'}
              </button>

              <div className="settings-section-title">Paste Text</div>
              <Row label="Name">
                <input className="topic-input" value={kbPasteName}
                  onChange={e => setKbPasteName(e.target.value)}
                  placeholder="Document name" />
              </Row>
              <Row label="Tags (comma-sep)">
                <input className="topic-input" value={kbPasteTags}
                  onChange={e => setKbPasteTags(e.target.value)}
                  placeholder="tag1, tag2" />
              </Row>
              <textarea className="topic-input" value={kbPasteText}
                onChange={e => setKbPasteText(e.target.value)}
                rows={8} placeholder="Paste document content here…" />
              <button className="run-btn" style={{ marginTop:8 }}
                onClick={handleKbPasteIngest}
                disabled={kbUploading || !kbPasteText.trim()}>
                {kbUploading ? '⟳ Ingesting…' : '⬆ Ingest Text'}
              </button>
            </>
          ) : (
            <div style={viewerBanner}>🔒 Ingesting documents requires Operator or Admin role.</div>
          )}
        </div>
      )}

      {/* ── SEARCH ── */}
      {activeTab === 'search' && (
        <div className="kb-body">
          <div className="settings-section-title">Vector Search</div>
          <div style={{ display:'flex', gap:8, marginBottom:10 }}>
            <input className="topic-input" style={{ flex:1, marginBottom:0 }}
              value={kbSearchQ} onChange={e => setKbSearchQ(e.target.value)}
              onKeyDown={e => e.key==='Enter' && handleKbSearch()}
              placeholder="Search KB…" />
            <button className="fs-apply-btn" onClick={handleKbSearch} disabled={kbSearching}>
              {kbSearching ? '…' : '🔍'}
            </button>
          </div>
          {kbSearchResult !== null && (
            <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
              {searchResults.map((r, i) => (
                <div key={i} style={{ padding:'9px 11px', borderRadius:7, background:'rgba(58,127,255,0.05)', border:'1px solid var(--bd-subtle)' }}>
                  <div style={{ display:'flex', justifyContent:'space-between', marginBottom:4 }}>
                    <span style={{ fontSize:11, fontWeight:700, color:'var(--tx-primary)' }}>{r.source || '?'}</span>
                    <span style={{ fontSize:10, color:'var(--tx-muted)' }}>score: {r.score?.toFixed(3)}</span>
                  </div>
                  <div style={{ fontSize:11, color:'var(--tx-secondary)', lineHeight:1.5, whiteSpace:'pre-wrap' }}>{r.text}</div>
                </div>
              ))}
              {searchResults.length === 0 && <div className="empty-hint">No results found.</div>}
            </div>
          )}
        </div>
      )}

      {/* ── RAG QUERY ── */}
      {activeTab === 'rag' && (
        <div className="kb-body">
          <div className="settings-section-title">RAG Query (KB-augmented answer)</div>
          <textarea className="topic-input" value={ragQuery}
            onChange={e => setRagQuery(e.target.value)}
            rows={4} placeholder="Ask a question answered by your KB…" />
          <Row label={`Top K results: ${ragTopK}`}>
            <input type="range" min={1} max={10} value={ragTopK}
              onChange={e => setRagTopK(+e.target.value)} style={{ width:'100%' }} />
          </Row>
          <button className="run-btn" style={{ marginTop:8 }}
            onClick={handleRagQuery} disabled={ragLoading || !ragQuery.trim()}>
            {ragLoading ? '⟳ Querying…' : '💬 Run RAG Query'}
          </button>
          {ragAnswerText && (
            <div style={{ marginTop:12, padding:'10px 14px', background:'rgba(58,127,255,0.05)', border:'1px solid var(--bd-subtle)', borderRadius:8 }}>
              <div style={{ fontSize:10, fontWeight:700, color:'var(--tx-muted)', textTransform:'uppercase', letterSpacing:'0.08em', marginBottom:6 }}>Answer</div>
              <div style={{ fontSize:12, color:'var(--tx-secondary)', lineHeight:1.6, whiteSpace:'pre-wrap' }}>{ragAnswerText}</div>
            </div>
          )}
        </div>
      )}

      {/* ── CONFIG (operator+ only) ── */}
      {activeTab === 'config' && (
        <div className="kb-body">
          {canSaveCfg ? (
            <>
              <div className="settings-section-title">KB Configuration</div>
              <div className="si-row">
                <span className="si-label">Enabled</span>
                <button className={`si-toggle ${kbConfig.enabled ? 'on' : 'off'}`}
                  onClick={() => setKbConfig({ ...kbConfig, enabled: !kbConfig.enabled })}>
                  {kbConfig.enabled ? '🟢 On' : '🔴 Off'}
                </button>
              </div>
              <Row label="Embed Model">
                <input className="topic-input" value={kbConfig.embed_model || ''}
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
                  value={kbConfig.min_score ?? 0}
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
            </>
          ) : (
            <div style={viewerBanner}>🔒 Config changes require Operator or Admin role.</div>
          )}
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
