import { useState } from 'react'
import '../../styles/App.css'

// ── Provider preset meta ────────────────────────────────────────────────────
const PROVIDER_PRESETS = {
  openai: {
    label: 'OpenAI',
    icon: '🟢',
    baseUrl: 'https://api.openai.com/v1',
    models: ['gpt-4o', 'gpt-4o-mini', 'gpt-4-turbo', 'gpt-3.5-turbo'],
    defaultModel: 'gpt-4o-mini',
    tokenHint: 'sk-…',
    docsUrl: 'https://platform.openai.com/api-keys',
  },
  anthropic: {
    label: 'Anthropic (Claude)',
    icon: '🟠',
    baseUrl: 'https://api.anthropic.com',
    models: [
      'claude-opus-4-5',
      'claude-sonnet-4-5',
      'claude-3-5-sonnet-20241022',
      'claude-3-5-haiku-20241022',
      'claude-3-opus-20240229',
    ],
    defaultModel: 'claude-3-5-sonnet-20241022',
    tokenHint: 'sk-ant-…',
    docsUrl: 'https://console.anthropic.com/',
  },
  groq: {
    label: 'Groq',
    icon: '⚡',
    baseUrl: 'https://api.groq.com/openai/v1',
    models: [
      'llama-3.3-70b-versatile',
      'llama-3.1-8b-instant',
      'mixtral-8x7b-32768',
      'gemma2-9b-it',
    ],
    defaultModel: 'llama-3.3-70b-versatile',
    tokenHint: 'gsk_…',
    docsUrl: 'https://console.groq.com/keys',
  },
  together: {
    label: 'Together AI',
    icon: '🔵',
    baseUrl: 'https://api.together.xyz/v1',
    models: [
      'meta-llama/Meta-Llama-3.1-8B-Instruct-Turbo',
      'meta-llama/Meta-Llama-3.1-70B-Instruct-Turbo',
      'mistralai/Mixtral-8x7B-Instruct-v0.1',
    ],
    defaultModel: 'meta-llama/Meta-Llama-3.1-8B-Instruct-Turbo',
    tokenHint: 'your-api-key',
    docsUrl: 'https://api.together.xyz/',
  },
  custom: {
    label: 'Custom (OpenAI-compatible)',
    icon: '⚙️',
    baseUrl: 'http://localhost:1234/v1',
    models: [],
    defaultModel: '',
    tokenHint: 'optional',
    docsUrl: null,
  },
}

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000'

const inputStyle = {
  width: '100%',
  background: 'var(--bg-input, rgba(255,255,255,0.05))',
  border: '1px solid var(--bd-subtle)',
  borderRadius: 'var(--radius)',
  color: 'var(--tx-primary)',
  fontSize: '0.72rem',
  padding: '5px 9px',
  outline: 'none',
  boxSizing: 'border-box',
}

const labelStyle = {
  fontSize: '0.6rem',
  color: 'var(--tx-muted)',
  fontWeight: 700,
  textTransform: 'uppercase',
  letterSpacing: '0.08em',
  marginBottom: 3,
  display: 'block',
}

function FieldGroup({ label, children }) {
  return (
    <div style={{ marginBottom: 8 }}>
      <span style={labelStyle}>{label}</span>
      {children}
    </div>
  )
}

// ── External provider form ──────────────────────────────────────────────────
function ExternalProviderForm({ onSave, onCancel, editEntry }) {
  const defaultType = editEntry?.provider_type || 'openai'
  const preset = PROVIDER_PRESETS[defaultType] || PROVIDER_PRESETS.custom

  const [providerType, setProviderType] = useState(defaultType)
  const [displayName,  setDisplayName]  = useState(editEntry?.display_name || preset.label)
  const [baseUrl,      setBaseUrl]      = useState(editEntry?.base_url || preset.baseUrl)
  const [apiToken,     setApiToken]     = useState(editEntry?.api_token || '')
  const [modelName,    setModelName]    = useState(editEntry?.model_name || preset.defaultModel)
  const [temperature,  setTemperature]  = useState(editEntry?.temperature ?? 0.3)
  const [maxTokens,    setMaxTokens]    = useState(editEntry?.max_tokens ?? 1024)
  const [showToken,    setShowToken]    = useState(false)
  const [customModel,  setCustomModel]  = useState(
    editEntry?.model_name && !preset.models.includes(editEntry.model_name)
      ? editEntry.model_name
      : ''
  )

  const handleTypeChange = (t) => {
    setProviderType(t)
    const p = PROVIDER_PRESETS[t] || PROVIDER_PRESETS.custom
    setDisplayName(p.label)
    setBaseUrl(p.baseUrl)
    setModelName(p.defaultModel)
    setCustomModel('')
  }

  const activePreset = PROVIDER_PRESETS[providerType] || PROVIDER_PRESETS.custom
  const resolvedModel = customModel.trim() || modelName

  const isValid = displayName.trim() && baseUrl.trim() && resolvedModel.trim()

  return (
    <div style={{ padding: '0.7rem 0.9rem', display: 'flex', flexDirection: 'column', gap: 2 }}>
      {/* Provider type selector */}
      <FieldGroup label="Provider Type">
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, marginTop: 4 }}>
          {Object.entries(PROVIDER_PRESETS).map(([k, p]) => (
            <button
              key={k}
              onClick={() => handleTypeChange(k)}
              style={{
                padding: '4px 9px',
                fontSize: '0.65rem',
                fontWeight: 700,
                borderRadius: 'var(--radius)',
                border: providerType === k
                  ? '1.5px solid var(--accent)'
                  : '1px solid var(--bd-subtle)',
                background: providerType === k ? 'rgba(139,92,246,0.15)' : 'transparent',
                color: providerType === k ? 'var(--accent)' : 'var(--tx-muted)',
                cursor: 'pointer',
                transition: 'all 0.15s',
              }}
            >
              {p.icon} {p.label}
            </button>
          ))}
        </div>
      </FieldGroup>

      <FieldGroup label="Display Name">
        <input style={inputStyle} value={displayName} onChange={e => setDisplayName(e.target.value)} placeholder="My OpenAI Config" />
      </FieldGroup>

      <FieldGroup label={`API Endpoint (Base URL)${activePreset.docsUrl ? '' : ''}`}>
        <input
          style={inputStyle}
          value={baseUrl}
          onChange={e => setBaseUrl(e.target.value)}
          placeholder={activePreset.baseUrl}
        />
        {activePreset.docsUrl && (
          <div style={{ fontSize: '0.59rem', color: 'var(--tx-hint)', marginTop: 2 }}>
            Get your API key at{' '}
            <a href={activePreset.docsUrl} target="_blank" rel="noopener noreferrer"
              style={{ color: 'var(--accent)', textDecoration: 'none' }}>
              {activePreset.docsUrl}
            </a>
          </div>
        )}
      </FieldGroup>

      <FieldGroup label="API Token / Key">
        <div style={{ display: 'flex', gap: 4 }}>
          <input
            style={{ ...inputStyle, flex: 1, fontFamily: showToken ? 'inherit' : 'monospace', letterSpacing: showToken ? 'normal' : '0.1em' }}
            type={showToken ? 'text' : 'password'}
            value={apiToken}
            onChange={e => setApiToken(e.target.value)}
            placeholder={activePreset.tokenHint}
            autoComplete="off"
          />
          <button
            onClick={() => setShowToken(s => !s)}
            title={showToken ? 'Hide token' : 'Show token'}
            style={{
              padding: '0 8px',
              background: 'transparent',
              border: '1px solid var(--bd-subtle)',
              borderRadius: 'var(--radius)',
              color: 'var(--tx-muted)',
              cursor: 'pointer',
              fontSize: '0.7rem',
              flexShrink: 0,
            }}
          >
            {showToken ? '🙈' : '👁'}
          </button>
        </div>
      </FieldGroup>

      <FieldGroup label="Model">
        {activePreset.models.length > 0 && (
          <select
            style={{ ...inputStyle, marginBottom: 4 }}
            value={modelName}
            onChange={e => { setModelName(e.target.value); setCustomModel('') }}
          >
            {activePreset.models.map(m => (
              <option key={m} value={m}>{m}</option>
            ))}
            <option value="__custom__">— Custom model name —</option>
          </select>
        )}
        {(activePreset.models.length === 0 || modelName === '__custom__' || customModel) && (
          <input
            style={inputStyle}
            value={customModel || (modelName === '__custom__' ? '' : '')}
            onChange={e => setCustomModel(e.target.value)}
            placeholder="Enter exact model name"
          />
        )}
      </FieldGroup>

      <div style={{ display: 'flex', gap: 8 }}>
        <div style={{ flex: 1 }}>
          <FieldGroup label="Temperature">
            <input
              style={inputStyle}
              type="number" min="0" max="2" step="0.1"
              value={temperature}
              onChange={e => setTemperature(parseFloat(e.target.value) || 0)}
            />
          </FieldGroup>
        </div>
        <div style={{ flex: 1 }}>
          <FieldGroup label="Max Tokens">
            <input
              style={inputStyle}
              type="number" min="64" max="32768" step="64"
              value={maxTokens}
              onChange={e => setMaxTokens(parseInt(e.target.value) || 1024)}
            />
          </FieldGroup>
        </div>
      </div>

      <div style={{ display: 'flex', gap: 6, marginTop: 6 }}>
        <button
          className="run-btn"
          disabled={!isValid}
          onClick={() => onSave({
            provider_type: providerType,
            display_name:  displayName.trim(),
            base_url:      baseUrl.trim(),
            api_token:     apiToken,
            model_name:    resolvedModel,
            temperature,
            max_tokens:    maxTokens,
            id:            editEntry?.id,
          })}
        >
          {editEntry ? '💾 Update Provider' : '➕ Add Provider'}
        </button>
        <button
          onClick={onCancel}
          style={{
            padding: '5px 12px',
            fontSize: '0.7rem',
            background: 'transparent',
            border: '1px solid var(--bd-subtle)',
            borderRadius: 'var(--radius)',
            color: 'var(--tx-muted)',
            cursor: 'pointer',
          }}
        >
          Cancel
        </button>
      </div>
    </div>
  )
}

// ── External providers list ─────────────────────────────────────────────────
function ExternalProvidersList({
  providers, activeExternalId, activeMode,
  onAdd, onEdit, onDelete, onActivate, onTest, testResults,
}) {
  if (providers.length === 0) {
    return (
      <div style={{ padding: '1.5rem 1rem', textAlign: 'center', color: 'var(--tx-muted)', fontSize: '0.72rem' }}>
        <div style={{ fontSize: '2rem', marginBottom: 8 }}>🌐</div>
        <div style={{ fontWeight: 700, marginBottom: 4 }}>No external providers configured</div>
        <div style={{ fontSize: '0.63rem', color: 'var(--tx-hint)' }}>Add OpenAI, Claude, Groq or any OpenAI-compatible API below.</div>
        <button
          className="run-btn"
          onClick={onAdd}
          style={{ marginTop: 12 }}
        >
          ➕ Add First Provider
        </button>
      </div>
    )
  }

  return (
    <div style={{ flex: 1, overflowY: 'auto' }}>
      {providers.map(p => {
        const preset  = PROVIDER_PRESETS[p.provider_type] || PROVIDER_PRESETS.custom
        const isActive = activeMode === 'external' && p.id === activeExternalId
        const testR   = testResults?.[p.id]
        return (
          <div
            key={p.id}
            style={{
              margin: '0.4rem 0.7rem',
              padding: '0.55rem 0.7rem',
              border: isActive
                ? '1.5px solid var(--accent)'
                : '1px solid var(--bd-subtle)',
              borderRadius: 'var(--radius)',
              background: isActive ? 'rgba(139,92,246,0.08)' : 'transparent',
              transition: 'all 0.15s',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
              <span style={{ fontSize: '1rem' }}>{preset.icon}</span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 700, fontSize: '0.76rem', color: 'var(--tx-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {p.display_name}
                </div>
                <div style={{ fontSize: '0.59rem', color: 'var(--tx-muted)', marginTop: 1 }}>
                  {p.model_name} · {p.base_url}
                </div>
              </div>
              {isActive && <span className="badge-active">active</span>}
            </div>

            {testR && (
              <div style={{
                fontSize: '0.62rem',
                padding: '3px 7px',
                borderRadius: 'var(--radius)',
                marginBottom: 5,
                background: testR.ok ? 'rgba(34,197,94,0.1)' : 'rgba(239,68,68,0.1)',
                color: testR.ok ? 'var(--success)' : 'var(--danger)',
                lineHeight: 1.5,
                wordBreak: 'break-all',
              }}>
                {testR.message}
              </div>
            )}

            <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
              <button
                className="run-btn"
                disabled={isActive}
                onClick={() => onActivate(p.id)}
                style={{ padding: '3px 9px', fontSize: '0.65rem' }}
              >
                {isActive ? '✓ Active' : '⚡ Use'}
              </button>
              <button
                onClick={() => onTest(p.id)}
                style={{
                  padding: '3px 9px',
                  fontSize: '0.65rem',
                  background: 'transparent',
                  border: '1px solid var(--bd-subtle)',
                  borderRadius: 'var(--radius)',
                  color: 'var(--tx-muted)',
                  cursor: 'pointer',
                }}
              >
                🔌 Test
              </button>
              <button
                onClick={() => onEdit(p)}
                style={{
                  padding: '3px 9px',
                  fontSize: '0.65rem',
                  background: 'transparent',
                  border: '1px solid var(--bd-subtle)',
                  borderRadius: 'var(--radius)',
                  color: 'var(--tx-muted)',
                  cursor: 'pointer',
                }}
              >
                ✏️ Edit
              </button>
              <button
                onClick={() => onDelete(p.id)}
                style={{
                  padding: '3px 9px',
                  fontSize: '0.65rem',
                  background: 'transparent',
                  border: '1px solid rgba(239,68,68,0.3)',
                  borderRadius: 'var(--radius)',
                  color: 'var(--danger, #ef4444)',
                  cursor: 'pointer',
                }}
              >
                🗑
              </button>
            </div>
          </div>
        )
      })}

      <div style={{ padding: '0.5rem 0.7rem' }}>
        <button
          onClick={onAdd}
          style={{
            width: '100%',
            padding: '6px',
            fontSize: '0.68rem',
            background: 'transparent',
            border: '1px dashed var(--bd-subtle)',
            borderRadius: 'var(--radius)',
            color: 'var(--tx-muted)',
            cursor: 'pointer',
            transition: 'all 0.15s',
          }}
        >
          ➕ Add Another Provider
        </button>
      </div>
    </div>
  )
}

// ── Main ModelPickerPanel ───────────────────────────────────────────────────
export default function ModelPickerPanel({
  availableModels, selectedModel, setSelectedModel,
  currentModel, modelSaving, modelError,
  handleModelChange, onClose
}) {
  const current = typeof currentModel === 'string' ? currentModel : ''

  // Tab: 'local' | 'external'
  const [tab, setTab] = useState('local')

  // External providers state (loaded from backend)
  const [providers,          setProviders]          = useState([])
  const [activeExternalId,   setActiveExternalId]   = useState(null)
  const [activeMode,         setActiveMode]         = useState('local')
  const [showForm,           setShowForm]           = useState(false)
  const [editEntry,          setEditEntry]          = useState(null)
  const [extError,           setExtError]           = useState(null)
  const [extSaving,          setExtSaving]          = useState(false)
  const [testResults,        setTestResults]        = useState({})
  const [providersLoaded,    setProvidersLoaded]    = useState(false)

  // Load providers when external tab is opened
  const loadProviders = async () => {
    try {
      const d = await fetch(`${API_URL}/models/external-providers`).then(r => r.json())
      setProviders(d.providers || [])
      setActiveExternalId(d.active_external_id || null)
      setActiveMode(d.active_mode || 'local')
      setProvidersLoaded(true)
    } catch {
      setExtError('Failed to load providers')
    }
  }

  const handleTabChange = (t) => {
    setTab(t)
    if (t === 'external' && !providersLoaded) loadProviders()
  }

  const handleSaveProvider = async (formData) => {
    setExtSaving(true); setExtError(null)
    try {
      const method = formData.id ? 'PUT' : 'POST'
      const url    = formData.id
        ? `${API_URL}/models/external-providers/${formData.id}`
        : `${API_URL}/models/external-providers`
      const d = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData),
      }).then(r => r.json())
      if (d.error) { setExtError(d.error); return }
      setShowForm(false); setEditEntry(null)
      await loadProviders()
    } catch (e) { setExtError(String(e)) } finally { setExtSaving(false) }
  }

  const handleDeleteProvider = async (id) => {
    if (!window.confirm('Remove this external provider?')) return
    await fetch(`${API_URL}/models/external-providers/${id}`, { method: 'DELETE' })
    await loadProviders()
  }

  const handleActivateExternal = async (id) => {
    setExtSaving(true); setExtError(null)
    try {
      const d = await fetch(`${API_URL}/models/external-providers/${id}/activate`, {
        method: 'POST'
      }).then(r => r.json())
      if (d.error) { setExtError(d.error); return }
      setActiveExternalId(id)
      setActiveMode('external')
      // Notify parent to update currentModel display
      const providerEntry = providers.find(p => p.id === id)
      if (providerEntry) {
        setSelectedModel(`[${providerEntry.display_name}] ${providerEntry.model_name}`)
      }
    } catch (e) { setExtError(String(e)) } finally { setExtSaving(false) }
  }

  const handleTestProvider = async (id) => {
    setTestResults(prev => ({ ...prev, [id]: { ok: null, message: '⏳ Testing…' } }))
    try {
      const d = await fetch(`${API_URL}/models/external-providers/${id}/test`, {
        method: 'POST'
      }).then(r => r.json())
      setTestResults(prev => ({ ...prev, [id]: d }))
    } catch (e) {
      setTestResults(prev => ({ ...prev, [id]: { ok: false, message: String(e) } }))
    }
  }

  const handleSwitchToLocal = async () => {
    try {
      await fetch(`${API_URL}/models/external-providers/deactivate`, { method: 'POST' })
      setActiveMode('local')
      setActiveExternalId(null)
    } catch {}
  }

  const TAB_STYLE = (active) => ({
    flex: 1,
    padding: '0.35rem 0',
    fontSize: '0.66rem',
    fontWeight: 700,
    textTransform: 'uppercase',
    letterSpacing: '0.08em',
    background: active ? 'rgba(139,92,246,0.12)' : 'transparent',
    border: 'none',
    borderBottom: active ? '2px solid var(--accent)' : '2px solid transparent',
    color: active ? 'var(--accent)' : 'var(--tx-muted)',
    cursor: 'pointer',
    transition: 'all 0.15s',
  })

  return (
    <div className="overlay-panel model-panel">
      {/* Header */}
      <div className="overlay-header">
        <span>🤖 Select Model</span>
        <button className="overlay-close" onClick={onClose}>✕</button>
      </div>

      {/* Active mode banner */}
      {activeMode === 'external' && (() => {
        const ap = providers.find(p => p.id === activeExternalId)
        return ap ? (
          <div style={{
            padding: '0.35rem 0.8rem',
            background: 'rgba(139,92,246,0.1)',
            borderBottom: '1px solid rgba(139,92,246,0.2)',
            fontSize: '0.62rem',
            color: 'var(--accent)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 6,
          }}>
            <span>⚡ External active: <strong>{ap.display_name}</strong> · {ap.model_name}</span>
            <button
              onClick={handleSwitchToLocal}
              style={{
                padding: '2px 7px',
                fontSize: '0.6rem',
                background: 'transparent',
                border: '1px solid rgba(139,92,246,0.4)',
                borderRadius: 'var(--radius)',
                color: 'var(--accent)',
                cursor: 'pointer',
              }}
            >
              Switch to Ollama
            </button>
          </div>
        ) : null
      })()}

      {/* Tabs */}
      <div style={{ display: 'flex', borderBottom: '1px solid var(--bd-subtle)' }}>
        <button style={TAB_STYLE(tab === 'local')}    onClick={() => handleTabChange('local')}>🦙 Local (Ollama)</button>
        <button style={TAB_STYLE(tab === 'external')} onClick={() => handleTabChange('external')}>🌐 External APIs</button>
      </div>

      {/* ── LOCAL TAB ── */}
      {tab === 'local' && (
        <>
          <div style={{ padding:'0.55rem 0.8rem', borderBottom:'1px solid var(--bd-subtle)', fontSize:'0.62rem', color:'var(--tx-muted)', fontWeight:700, textTransform:'uppercase', letterSpacing:'0.1em' }}>
            Available Ollama Models
          </div>

          <div className="model-list" style={{ flex:1, overflowY:'auto' }}>
            {availableModels.length === 0 && (
              <div style={{ padding:'1.2rem', color:'var(--tx-muted)', fontSize:'0.72rem', textAlign:'center' }}>
                No models found. Is Ollama running?
              </div>
            )}

            {availableModels.map((m, i) => {
              const name = typeof m === 'string' ? m : (m?.name ?? String(m))
              return (
                <label
                  key={`model-${name}-${i}`}
                  className={`model-option${selectedModel === name ? ' selected' : ''}`}
                  onClick={() => setSelectedModel(name)}
                >
                  <input
                    type="radio" name="model" value={name}
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
              disabled={modelSaving || selectedModel === current || activeMode === 'external'}
            >
              {modelSaving ? '⟳ Applying…'
                : activeMode === 'external' ? '⚡ External provider is active'
                : selectedModel === current ? `✓ ${current} active`
                : `Apply ${selectedModel}`}
            </button>
            {activeMode === 'external' && (
              <div style={{ fontSize: '0.6rem', color: 'var(--tx-hint)', textAlign: 'center' }}>
                Switch to Ollama tab → deactivate external to use local models
              </div>
            )}
          </div>
        </>
      )}

      {/* ── EXTERNAL TAB ── */}
      {tab === 'external' && (
        <>
          {extError && (
            <div className="error-msg" style={{ margin:'0.4rem 0.7rem' }}>{extError}</div>
          )}

          {showForm ? (
            <div style={{ flex: 1, overflowY: 'auto' }}>
              <div style={{ padding: '0.4rem 0.8rem', borderBottom: '1px solid var(--bd-subtle)', fontSize: '0.65rem', color: 'var(--tx-muted)', fontWeight: 700 }}>
                {editEntry ? '✏️ Edit Provider' : '➕ New External Provider'}
              </div>
              <ExternalProviderForm
                editEntry={editEntry}
                onSave={handleSaveProvider}
                onCancel={() => { setShowForm(false); setEditEntry(null) }}
              />
            </div>
          ) : (
            <ExternalProvidersList
              providers={providers}
              activeExternalId={activeExternalId}
              activeMode={activeMode}
              onAdd={() => { setEditEntry(null); setShowForm(true) }}
              onEdit={(p) => { setEditEntry(p); setShowForm(true) }}
              onDelete={handleDeleteProvider}
              onActivate={handleActivateExternal}
              onTest={handleTestProvider}
              testResults={testResults}
            />
          )}

          {!showForm && (
            <div style={{
              padding: '0.55rem 0.8rem',
              borderTop: '1px solid var(--bd-subtle)',
              fontSize: '0.6rem',
              color: 'var(--tx-hint)',
              lineHeight: 1.6,
            }}>
              💡 External providers require <code>langchain-openai</code> or <code>langchain-anthropic</code>.<br />
              Install: <code>pip install langchain-openai langchain-anthropic</code>
            </div>
          )}
        </>
      )}
    </div>
  )
}
