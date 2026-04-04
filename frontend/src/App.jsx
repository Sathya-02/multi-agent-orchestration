import { useState, useEffect, useRef, useCallback } from 'react'
import AgentScene3D from './components/AgentScene3D'
import ActivityFeed from './components/ActivityFeed'
import AgentCard    from './components/AgentCard'
import './styles/App.css'

const WS_URL  = 'ws://localhost:8000/ws'
const API_URL = 'http://localhost:8000'
const BUILTIN = ['coordinator','researcher','analyst','writer']
const PHASE_ORDER = ['coordinator','researcher','analyst','writer']
const PHASE_META  = {
  coordinator:{ icon:'🎯', name:'Coordinator' },
  researcher: { icon:'🔍', name:'Researcher'  },
  analyst:    { icon:'📊', name:'Analyst'      },
  writer:     { icon:'✍️',  name:'Writer'       },
}
const MODES = [
  { id:'research', label:'🔬 Research',    desc:'Full 4-agent pipeline' },
  { id:'query',    label:'💬 Quick Query', desc:'Single-agent Q&A / maths' },
  { id:'file',     label:'📎 File Analysis', desc:'Analyse uploaded files' },
]

export default function App() {
  /* ── Core state ─────────────────────────────────────── */
  const [connected,    setConnected]    = useState(false)
  const [activeAgent,  setActiveAgent]  = useState(null)
  const [logs,         setLogs]         = useState([])
  const [topic,        setTopic]        = useState('Impact of AI on software development')
  const [mode,         setMode]         = useState('research')
  const [running,      setRunning]      = useState(false)
  const [jobId,        setJobId]        = useState(null)
  const [result,       setResult]       = useState(null)
  const [reportFile,   setReportFile]   = useState(null)
  const [reportFormat, setReportFormat] = useState('md')
  const [lastMessages, setLastMessages] = useState({})
  const [currentPhase, setCurrentPhase] = useState(null)
  const [currentWorker, setCurrentWorker] = useState(null)

  /* ── Model state ─────────────────────────────────────── */
  const [availableModels, setAvailableModels] = useState([])
  const [selectedModel,   setSelectedModel]   = useState('phi3:mini')
  const [currentModel,    setCurrentModel]    = useState('phi3:mini')
  const [modelSaving,     setModelSaving]     = useState(false)
  const [modelError,      setModelError]      = useState(null)
  const [showModelPanel,  setShowModelPanel]  = useState(false)

  /* ── File upload state ───────────────────────────────── */
  const [uploads,         setUploads]         = useState([])
  const [selectedFiles,   setSelectedFiles]   = useState([])
  const [uploading,       setUploading]       = useState(false)
  const [showUploadPanel, setShowUploadPanel] = useState(false)
  const fileInputRef = useRef(null)

  /* ── Dashboard state ─────────────────────────────────── */
  const [stats,           setStats]           = useState(null)
  const [showDashboard,   setShowDashboard]   = useState(false)

  /* ── Agent editor state ──────────────────────────────── */
  const [agents,          setAgents]          = useState([])
  const [showAgentEditor, setShowAgentEditor] = useState(false)
  const [editingAgent,    setEditingAgent]    = useState(null)
  const [newAgentForm,    setNewAgentForm]    = useState({ label:'', role:'', goal:'', backstory:'', icon:'🤖', color:'#a78bfa' })
  const [agentTab,        setAgentTab]        = useState('list') // list | new | edit | skills
  const [skillsText,      setSkillsText]      = useState('')
  const [skillsSaving,    setSkillsSaving]    = useState(false)
  const [skillsAgentId,   setSkillsAgentId]   = useState(null)

  /* ── Filesystem config state ─────────────────────────── */
  const [showFsPanel,   setShowFsPanel]   = useState(false)
  // access (not access_list) — matches /fs-config response shape: {output_dir, access:[]}
  const [fsConfig,      setFsConfig]      = useState({ access: [], output_dir: null })
  const [fsAudit,       setFsAudit]       = useState([])
  const [fsAuditTab,    setFsAuditTab]    = useState(false)
  const [newFsPath,     setNewFsPath]     = useState('')
  const [newFsRead,     setNewFsRead]     = useState(true)
  const [newFsWrite,    setNewFsWrite]    = useState(false)
  const [newFsEdit,     setNewFsEdit]     = useState(false)
  const [newFsLabel,    setNewFsLabel]    = useState('')
  const [outputDirInput,setOutputDirInput]= useState('')
  const [fsError,       setFsError]       = useState(null)
  const [spawnRequests,   setSpawnRequests]   = useState([])
  const [spawnEnabled,    setSpawnEnabled]    = useState(true)
  const [spawnToggling,   setSpawnToggling]   = useState(false)

  /* ── Tool state ──────────────────────────────────────── */
  const [tools,           setTools]           = useState([])
  const [showToolPanel,   setShowToolPanel]   = useState(false)
  const [toolTab,         setToolTab]         = useState('list') // list | new | edit | toolmd
  const [editingTool,     setEditingTool]     = useState(null)
  const [toolMdText,      setToolMdText]      = useState('')
  const [toolMdId,        setToolMdId]        = useState(null)
  const [toolMdSaving,    setToolMdSaving]    = useState(false)
  const [toolSpawnReqs,   setToolSpawnReqs]   = useState([])
  const [newToolForm,     setNewToolForm]     = useState({
    name:'', display_name:'', description:'',
    tags:'', code:'    return str(input_data)'
  })

  /* ── Settings / Telegram / Self-Improver state ───────── */
  const [showSettings,      setShowSettings]      = useState(false)
  const [settingsTab,       setSettingsTab]       = useState('telegram') // telegram | improver | practices
  const [tgConfig,          setTgConfig]          = useState({ bot_token:'', allowed_chat_ids:'', notify_chat_id:'', enabled:false })
  const [tgSaving,          setTgSaving]          = useState(false)
  const [tgTesting,         setTgTesting]         = useState(false)
  const [tgTestResult,      setTgTestResult]      = useState(null)
  const [tgBotSet,          setTgBotSet]          = useState(false)
  const [siConfig,          setSiConfig]          = useState({ enabled:true, interval_hours:6, auto_apply_safe:true, notify_telegram:true, min_confidence:0.7, model_override:'' })
  const [siSaving,          setSiSaving]          = useState(false)
  const [siRunning,         setSiRunning]         = useState(false)
  const [bestPractices,     setBestPractices]     = useState('')
  const [proposals,         setProposals]         = useState('')
  const [improvLog,         setImprovLog]         = useState('')

  /* ── Web Search state ────────────────────────────────── */
  const [wsConfig,   setWsConfig]   = useState({
    enabled: false, provider: 'auto', max_results: 5,
    timeout_seconds: 10, safe_search: true, region: 'wt-wt', fallback_to_mock: true
  })
  const [wsSaving,   setWsSaving]   = useState(false)
  const [wsTesting,  setWsTesting]  = useState(false)
  const [wsTestResult, setWsTestResult] = useState(null)
  const [wsTestQuery,  setWsTestQuery]  = useState('weather in Tokyo')

  /* ── Knowledge Base / RAG state ─────────────────────── */
  const [showKbPanel,    setShowKbPanel]    = useState(false)
  const [kbTab,          setKbTab]          = useState('browse') // browse | add | config
  const [kbEntries,      setKbEntries]      = useState({ entries:[], sources:[], count:0 })
  const [kbConfig,       setKbConfig]       = useState({
    enabled:true, embed_model:'nomic-embed-text',
    chunk_size:400, chunk_overlap:80, top_k:4, min_score:0.25, use_ollama_embed:true
  })
  const [kbConfigSaving, setKbConfigSaving] = useState(false)
  const [kbUploading,    setKbUploading]    = useState(false)
  const [kbSearchQ,      setKbSearchQ]      = useState('')
  const [kbSearchResult, setKbSearchResult] = useState(null)
  const [kbSearching,    setKbSearching]    = useState(false)
  const [kbPasteText,    setKbPasteText]    = useState('')
  const [kbPasteName,    setKbPasteName]    = useState('')
  const [kbPasteTags,    setKbPasteTags]    = useState('')
  const kbFileRef = useRef(null)

  const wsRef       = useRef(null)
  const activeTimer = useRef(null)
  const statsTimer  = useRef(null)

  const [ragQuery,   setRagQuery]   = useState('')
  const [ragTopK,    setRagTopK]    = useState(4)
  const [ragLoading, setRagLoading] = useState(false)
  const [ragResult,  setRagResult]  = useState(null)

  /* ── Init ─────────────────────────────────────────────── */
  useEffect(() => {
    fetchModels(); fetchUploads(); fetchAgents(); fetchSpawnSettings(); fetchFsConfig(); fetchTools(); fetchToolSpawns(); fetchTelegramConfig(); fetchSiConfig(); fetchWsConfig(); fetchKbEntries(); fetchKbConfig()
  }, [])

  /* ── Stats polling ────────────────────────────────────── */
  useEffect(() => {
    const poll = () => fetch(`${API_URL}/stats`).then(r=>r.json()).then(setStats).catch(()=>{})
    poll()
    statsTimer.current = setInterval(poll, 3000)
    return () => clearInterval(statsTimer.current)
  }, [])

  /* ── WebSocket ────────────────────────────────────────── */
  useEffect(() => {
    const connect = () => {
      const ws = new WebSocket(WS_URL)
      wsRef.current = ws
      ws.onopen    = () => {
        setConnected(true)
        fetchAgents(); fetchTools()
      }
      ws.onmessage = (e) => handleMessage(JSON.parse(e.data))
      ws.onclose   = () => { setConnected(false); setTimeout(connect, 1500) }
      ws.onerror   = () => ws.close()
    }
    connect()
    return () => wsRef.current?.close()
  }, [])

  useEffect(() => {
    const id = setInterval(() => {
      if (wsRef.current?.readyState === WebSocket.OPEN)
        wsRef.current.send(JSON.stringify({ type: 'ping' }))
    }, 20000)
    return () => clearInterval(id)
  }, [])

  /* ── Helpers ──────────────────────────────────────────── */
  const addLog = (agent, label, message, phase = false, ts = null, taskResult = false) =>
  setLogs(prev => {
    const last = prev[prev.length - 1]
    if (last && last.agent === agent && last.message === message) {
      return prev
    }
    return [
      ...prev.slice(-150),
      {
        agent,
        label,
        message,
        phase,
        taskResult,
        ts: ts || Date.now() / 1000,
      },
    ]
  })

  // ── fetchModels ────────────────────────────────────────
  // /models returns: { active: "phi3:mini", presets: [{id,label,…}, …] }
  // "presets" are the known/installed model definitions.
  // We use presets to populate the dropdown; active as the current selection.
  const fetchModels = async () => {
    try {
      const d = await fetch(`${API_URL}/models`).then(r => r.json())
      const active  = d.active  || ''
      // presets is an array of {id, label, …} objects
      const presets = Array.isArray(d.presets) ? d.presets : []
      // Also accept a flat string array for backwards compat
      const modelList = presets.map(p => (typeof p === 'string' ? p : p.id || p.label || p)).filter(Boolean)
      if (modelList.length > 0 || active) {
        setAvailableModels(modelList)
        if (active) {
          setCurrentModel(active)
          setSelectedModel(active)
        }
      }
    } catch {}
  }

  const fetchUploads = async () => {
    try { setUploads(await fetch(`${API_URL}/uploads`).then(r=>r.json())) } catch {}
  }
  const fetchAgents = async () => {
    try {
      const d = await fetch(`${API_URL}/agents`).then(r=>r.json())
      const list = Array.isArray(d) ? d : (d.agents || [])
      setAgents(list)
    } catch {}
  }

  const fetchSpawnSettings = async () => {
    try {
      const d = await fetch(`${API_URL}/spawn-settings`).then(r=>r.json())
      if (typeof d.spawn_enabled === 'boolean') setSpawnEnabled(d.spawn_enabled)
    } catch {}
  }

  // ── fetchFsConfig ──────────────────────────────────────
  // /fs-config returns: { output_dir: "...", access: [{path,read,write,edit,label},…] }
  const fetchFsConfig = async () => {
    try {
      const d = await fetch(`${API_URL}/fs-config`).then(r=>r.json())
      // Normalise: always ensure `access` is an array
      if (!Array.isArray(d.access)) d.access = []
      setFsConfig(d)
      setOutputDirInput(d.output_dir || '')
    } catch {}
  }

  // /fs-config/audit does not exist on the backend — clear silently
  const fetchFsAudit = async () => {
    setFsAudit([])
  }

  const handleAddFsAccess = async () => {
    if (!newFsPath.trim()) return
    setFsError(null)
    try {
      const d = await fetch(`${API_URL}/fs-config/access`, {
        method: 'POST',
        headers: {'Content-Type':'application/json'},
        body: JSON.stringify({ path: newFsPath.trim(), read: newFsRead, write: newFsWrite, edit: newFsEdit, label: newFsLabel.trim() }),
      }).then(r=>r.json())
      if (d.error) { setFsError(d.error); return }
      setNewFsPath(''); setNewFsLabel('')
      await fetchFsConfig()
    } catch (e) { setFsError('Failed to add access entry') }
  }

  const handleRemoveFsAccess = async (path) => {
    await fetch(`${API_URL}/fs-config/access?path=${encodeURIComponent(path)}`, { method: 'DELETE', headers: {'Accept': 'application/json'} })
    await fetchFsConfig()
  }

  const handleToggleFsFlag = async (path, flag, current) => {
    await fetch(`${API_URL}/fs-config/access`, {
      method: 'PUT',
      headers: {'Content-Type':'application/json'},
      body: JSON.stringify({ path, [flag]: !current }),
    })
    await fetchFsConfig()
  }

  const fetchTools = async () => {
    try {
      const d = await fetch(`${API_URL}/tools`).then(r => r.json())
      const list = Array.isArray(d) ? d : (d.tools || [])
      setTools(list)
    } catch {}
  }

  const fetchToolSpawns = async () => {
    try {
      const d = await fetch(`${API_URL}/tool-spawns`).then(r => r.json())
      if (d.pending) setToolSpawnReqs(d.pending)
    } catch {}
  }

  const handleCreateTool = async () => {
    if (!newToolForm.name.trim()) return
    const payload = {
      ...newToolForm,
      tags: newToolForm.tags ? newToolForm.tags.split(',').map(t => t.trim()).filter(Boolean) : [],
    }
    const d = await fetch(`${API_URL}/tools`, {
      method: 'POST', headers: {'Content-Type':'application/json'},
      body: JSON.stringify(payload),
    }).then(r => r.json())
    if (d.duplicate) {
      addLog('system','⚙️ System', `⚠️ Tool '${newToolForm.name}' already exists.`)
    } else {
      setNewToolForm({ name:'', display_name:'', description:'', tags:'', code:'    return str(input_data)' })
      setToolTab('list')
    }
    await fetchTools()
  }

  const handleUpdateTool = async () => {
    if (!editingTool) return
    await fetch(`${API_URL}/tools/${editingTool.id}`, {
      method: 'PUT', headers: {'Content-Type':'application/json'},
      body: JSON.stringify(editingTool),
    })
    setEditingTool(null); setToolTab('list')
    await fetchTools()
  }

  const handleDeleteTool = async (id) => {
    if (!window.confirm('Permanently delete this tool?')) return
    await fetch(`${API_URL}/tools/${id}`, { method: 'DELETE' })
    await fetchTools()
  }

  const handleToggleToolActive = async (tool) => {
    const ep = tool.active === false ? 'activate' : 'deactivate'
    await fetch(`${API_URL}/tools/${tool.id}/${ep}`, { method: 'POST' })
    await fetchTools()
  }

  const handleOpenToolMd = async (tool) => {
    setToolMdId(tool.id); setToolMdText(''); setToolTab('toolmd')
    try {
      const d = await fetch(`${API_URL}/tools/${tool.id}/toolmd`).then(r => r.json())
      setToolMdText(d.content || '')
    } catch { setToolMdText('# Failed to load TOOL.md') }
  }

  const handleSaveToolMd = async () => {
    if (!toolMdId) return
    setToolMdSaving(true)
    try {
      await fetch(`${API_URL}/tools/${toolMdId}/toolmd`, {
        method: 'PUT', headers: {'Content-Type':'application/json'},
        body: JSON.stringify({ text: toolMdText }),
      })
      addLog('system','⚙️ System', `📄 TOOL.md saved for ${toolMdId}`)
      await fetchTools()
    } catch {} finally { setToolMdSaving(false) }
  }

  const handleToolSpawnDecision = async (request_id, approved) => {
    await fetch(`${API_URL}/tool-spawns/decide`, {
      method: 'POST', headers: {'Content-Type':'application/json'},
      body: JSON.stringify({ request_id, approved }),
    })
    setToolSpawnReqs(p => p.filter(r => r.request_id !== request_id))
    await fetchTools()
  }

  /* ── Web Search fetch + handlers ────────────────────────── */

  const fetchWsConfig = async () => {
    try {
      const d = await fetch(`${API_URL}/web-search/config`).then(r => r.json())
      if (!d.error) setWsConfig(d)
    } catch {}
  }

  const handleSaveWsConfig = async () => {
    setWsSaving(true); setWsTestResult(null)
    try {
      // backend uses PUT /web-search/config
      const d = await fetch(`${API_URL}/web-search/config`, {
        method: 'PUT', headers: {'Content-Type': 'application/json'},
        body: JSON.stringify(wsConfig),
      }).then(r => r.json())
      if (d.error) setWsTestResult(`❌ ${d.error}`)
      else setWsTestResult('✅ Configuration saved')
    } catch(e) { setWsTestResult(`❌ ${e}`) } finally { setWsSaving(false) }
  }

  const handleTestWsProviders = async () => {
    setWsTesting(true); setWsTestResult(null)
    try {
      const d = await fetch(`${API_URL}/web-search/test`, {method:'POST'}).then(r => r.json())
      if (d.error) { setWsTestResult(`❌ ${d.error}`); return }
      const lines = Object.entries(d.providers || {}).map(
        ([k, v]) => `${v === 'ok' ? '✅' : '⚠️'} ${k}: ${v}`
      )
      setWsTestResult(lines.join('\n'))
    } catch(e) { setWsTestResult(`❌ ${e}`) } finally { setWsTesting(false) }
  }

  const handleRunWsQuery = async () => {
    if (!wsTestQuery.trim()) return
    setWsTesting(true); setWsTestResult(null)
    try {
      const d = await fetch(`${API_URL}/web-search/query?q=${encodeURIComponent(wsTestQuery)}`).then(r => r.json())
      if (d.error) setWsTestResult(`❌ ${d.error}`)
      else setWsTestResult(`Query: "${d.query}"\n\n${d.result}`)
    } catch(e) { setWsTestResult(`❌ ${e}`) } finally { setWsTesting(false) }
  }

  /* ── Telegram / Self-Improver fetch + handlers ─────────── */

  const fetchTelegramConfig = async () => {
    try {
      const r = await fetch(`${API_URL}/telegram/config`)
      if (!r.ok) return
      const d = await r.json()
      if (d._note) return
      if (!d.error) {
        setTgBotSet(!!d.bot_token_set)
        setTgConfig(c => ({
          ...c,
          allowed_chat_ids: (d.allowed_chat_ids||[]).join(', '),
          notify_chat_id:   d.notify_chat_id || '',
          enabled:          !!d.enabled,
        }))
      }
    } catch {}
  }

  const handleSaveTelegram = async () => {
    setTgSaving(true); setTgTestResult(null)
    try {
      const payload = {
        bot_token:        tgConfig.bot_token || undefined,
        allowed_chat_ids: tgConfig.allowed_chat_ids
          ? tgConfig.allowed_chat_ids.split(',').map(s=>s.trim()).filter(Boolean) : [],
        notify_chat_id:   tgConfig.notify_chat_id,
        enabled:          tgConfig.enabled,
      }
      // backend uses PUT /telegram/config
      const d = await fetch(`${API_URL}/telegram/config`, {
        method:'PUT', headers:{'Content-Type':'application/json'}, body:JSON.stringify(payload)
      }).then(r=>r.json())
      if (d.error) { setTgTestResult(`❌ ${d.error}`) }
      else { setTgTestResult('✅ Configuration saved'); setTgBotSet(true); await fetchTelegramConfig() }
    } catch(e) { setTgTestResult(`❌ ${e}`) } finally { setTgSaving(false) }
  }

  const handleTestTelegram = async () => {
    setTgTesting(true); setTgTestResult(null)
    try {
      const d = await fetch(`${API_URL}/telegram/test`, {method:'POST'}).then(r=>r.json())
      setTgTestResult(d.error ? `❌ ${d.error}` : '✅ Test message sent! Check your Telegram.')
    } catch(e) { setTgTestResult(`❌ ${e}`) } finally { setTgTesting(false) }
  }

  const fetchSiConfig = async () => {
    try {
      const d = await fetch(`${API_URL}/self-improver/config`).then(r=>r.json())
      if (!d.error) setSiConfig(d)
    } catch {}
  }

  const handleSaveSiConfig = async () => {
    setSiSaving(true)
    try {
      // backend uses PUT /self-improver/config
      await fetch(`${API_URL}/self-improver/config`, {
        method:'PUT', headers:{'Content-Type':'application/json'}, body:JSON.stringify(siConfig)
      })
      addLog('system','⚙️ System','✅ Self-improver config saved')
    } catch {} finally { setSiSaving(false) }
  }

  const handleRunImprover = async () => {
    setSiRunning(true)
    try {
      await fetch(`${API_URL}/self-improver/run-now`, {method:'POST'})
      addLog('system','⚙️ System','🔄 Self-improvement cycle triggered…')
    } catch {} finally { setTimeout(()=>setSiRunning(false), 3000) }
  }

  const fetchBestPractices = async () => {
    try {
      const d = await fetch(`${API_URL}/self-improver/best-practices`).then(r=>r.json())
      setBestPractices(d.content || '')
    } catch {}
  }

  const fetchProposals = async () => {
    try {
      const [dp, dl] = await Promise.all([
        fetch(`${API_URL}/self-improver/proposals`).then(r=>r.json()),
        fetch(`${API_URL}/self-improver/log`).then(r=>r.json()),
      ])
      setProposals(dp.content || '')
      setImprovLog(dl.content || '')
    } catch {}
  }

  /* ── Knowledge Base handlers ────────────────────────── */

  const fetchKbEntries = async () => {
    try {
      const d = await fetch(`${API_URL}/kb/entries`).then(r => r.json())
      setKbEntries(d)
    } catch {}
  }

  const fetchKbConfig = async () => {
    try {
      const d = await fetch(`${API_URL}/kb/config`).then(r => r.json())
      if (!d.error) setKbConfig(d)
    } catch {}
  }

  const handleSaveKbConfig = async () => {
    setKbConfigSaving(true)
    try {
      // backend uses PUT /kb/config
      await fetch(`${API_URL}/kb/config`, {
        method:'PUT', headers:{'Content-Type':'application/json'},
        body: JSON.stringify(kbConfig),
      })
      addLog('system','📚 KB','✅ Knowledge base config saved')
    } catch {} finally { setKbConfigSaving(false) }
  }

  const handleKbFileUpload = async (e) => {
    const files = Array.from(e.target.files)
    if (!files.length) return
    setKbUploading(true)
    for (const f of files) {
      const fd = new FormData()
      fd.append('file', f)
      fd.append('tags', kbPasteTags || '')
      try {
        // backend route: POST /kb/ingest/file
        const d = await fetch(`${API_URL}/kb/ingest/file`, {method:'POST', body:fd}).then(r=>r.json())
        addLog('system','📚 KB', d.message || `Ingested ${f.name}`)
      } catch(err) { addLog('system','📚 KB',`❌ Failed: ${f.name}`) }
    }
    await fetchKbEntries()
    setKbUploading(false)
    if (kbFileRef.current) kbFileRef.current.value = ''
  }

  const handleKbPasteIngest = async () => {
    if (!kbPasteText.trim() || !kbPasteName.trim()) return
    setKbUploading(true)
    try {
      // backend route: POST /kb/ingest/text  body: {text, source, tags:[]}
      const d = await fetch(`${API_URL}/kb/ingest/text`, {
        method:'POST', headers:{'Content-Type':'application/json'},
        body: JSON.stringify({
          text: kbPasteText,
          source: kbPasteName,
          tags: kbPasteTags ? kbPasteTags.split(',').map(t=>t.trim()).filter(Boolean) : []
        }),
      }).then(r=>r.json())
      addLog('system','📚 KB', d.message || 'Ingested text')
      setKbPasteText(''); setKbPasteName(''); setKbPasteTags('')
      await fetchKbEntries()
    } catch {} finally { setKbUploading(false) }
  }

  const handleDeleteKbSource = async (source) => {
    if (!window.confirm(`Remove all chunks from "${source}"?`)) return
    // backend route: DELETE /kb/source/{source}  (not /kb/sources/)
    await fetch(`${API_URL}/kb/source/${encodeURIComponent(source)}`, {method:'DELETE'})
    await fetchKbEntries()
  }

  const handleClearKb = async () => {
    if (!window.confirm('Clear the entire knowledge base? This cannot be undone.')) return
    await fetch(`${API_URL}/kb/clear`, {method:'POST'})
    await fetchKbEntries()
  }

  const handleKbSearch = async () => {
    if (!kbSearchQ.trim()) return
    setKbSearching(true); setKbSearchResult(null)
    try {
      const d = await fetch(`${API_URL}/kb/search?q=${encodeURIComponent(kbSearchQ)}`).then(r=>r.json())
      setKbSearchResult(d.result || d.error)
    } catch(e) { setKbSearchResult(`Error: ${e}`) } finally { setKbSearching(false) }
  }

  const handleRagQuery = async () => {
    if (!ragQuery.trim()) return
    setRagLoading(true)
    setRagResult(null)
    try {
      const res = await fetch(`${API_URL}/kb/query`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: ragQuery, top_k: ragTopK }),
      })
      const data = await res.json()
      setRagResult(data)
    } catch (e) {
      console.error("RAG query failed", e)
    } finally {
      setRagLoading(false)
    }
  }

  const handleSetOutputDir = async () => {
    setFsError(null)
    try {
      const d = await fetch(`${API_URL}/fs-config/output-dir`, {
        method: 'POST',
        headers: {'Content-Type':'application/json'},
        body: JSON.stringify({ path: outputDirInput.trim() }),
      }).then(r=>r.json())
      if (d.error) { setFsError(d.error); return }
      await fetchFsConfig()
      addLog('system','⚙️ System', outputDirInput.trim()
        ? `📂 Output directory set: ${outputDirInput.trim()}`
        : '📂 Output directory cleared')
    } catch { setFsError('Failed to set output directory') }
  }

  const handleToggleSpawn = async () => {
    setSpawnToggling(true)
    try {
      const d = await fetch(`${API_URL}/spawn-settings`, {
        method: 'POST',
        headers: {'Content-Type':'application/json'},
        body: JSON.stringify({ enabled: !spawnEnabled }),
      }).then(r=>r.json())
      if (typeof d.spawn_enabled === 'boolean') setSpawnEnabled(d.spawn_enabled)
    } catch {}
    setSpawnToggling(false)
  }

  /* ── Message handler ──────────────────────────────────── */
  const handleMessage = useCallback((msg) => {
    if (msg.type === 'agent_working') {
      setCurrentWorker(msg)
    }
    if (msg.type === 'agent_activity') {
      const { agent, label, message, ts, phase, task_result } = msg
      if (phase) setCurrentPhase(agent)
      setActiveAgent(agent)
      addLog(agent, label, message, !!phase, ts, !!task_result)
      setLastMessages(p => ({...p, [agent]: message}))
      clearTimeout(activeTimer.current)
      activeTimer.current = setTimeout(() => setActiveAgent(null), 4000)
    }
    if (msg.type === 'model_changed') {
      const m = msg.active_model || msg.model
      if (m) { setCurrentModel(m); setSelectedModel(m) }
    }
    if (msg.type === 'job_status') {
      setRunning(msg.status === 'running')
      if (msg.job_id) setJobId(msg.job_id)
      if (msg.status === 'running')
        addLog('system','⚙️ System',`▶ Job started — model: ${msg.model||''}, mode: ${msg.mode||''}`, true)
    }
    if (msg.type === 'job_done') {
      setRunning(false); setResult(msg.result); setReportFile(msg.filename)
      setReportFormat(msg.format || 'md')
      setActiveAgent(null); setCurrentPhase(null); setCurrentWorker(null)
      addLog('system','⚙️ System',`✅ Report complete — ${msg.filename} (${(msg.format||'md').toUpperCase()})`)
    }
    if (msg.type === 'job_failed') {
      setRunning(false); setActiveAgent(null); setCurrentPhase(null); setCurrentWorker(null)
      addLog('system','⚙️ System',`❌ ${msg.reason || 'Job failed — try a larger model'}`)
    }
    if (msg.type === 'spawn_request') {
      setSpawnRequests(p => [...p, msg])
      addLog('system','⚙️ System', msg.message, false)
    }
    if (msg.type === 'agents_updated' || msg.type === 'agent_created' || msg.type === 'agent_deleted') {
      fetchAgents()
    }
    if (msg.type === 'fs_config_updated') {
      if (msg.config) {
        const cfg = { ...msg.config }
        if (!Array.isArray(cfg.access)) cfg.access = []
        setFsConfig(cfg)
        setOutputDirInput(cfg.output_dir || '')
      }
    }
    if (msg.type === 'spawn_settings') {
      if (typeof msg.spawn_enabled === 'boolean') setSpawnEnabled(msg.spawn_enabled)
    }
    if (msg.type === 'tool_spawn_request') {
      setToolSpawnReqs(p => [...p, msg])
      addLog('system','⚙️ System', `🔧 Agent requests new tool: '${msg.suggestion?.name||'?'}' — awaiting approval`)
    }
    if (msg.type === 'tool_created' || msg.type === 'tool_updated' ||
        msg.type === 'tool_deleted' || msg.type === 'tools_updated') {
      fetchTools()
    }
  }, [currentModel])

  /* ── Model actions ────────────────────────────────────── */
  const handleModelChange = async () => {
    if (selectedModel === currentModel) return
    setModelSaving(true); setModelError(null)
    try {
      // backend endpoint: POST /models/select  body: {model:"..."}
      const d = await fetch(`${API_URL}/models/select`, {
        method: 'POST',
        headers: {'Content-Type':'application/json'},
        body: JSON.stringify({ model: selectedModel }),
      }).then(r => r.json())
      if (d.error) setModelError(d.error)
      else {
        const m = d.active || d.active_model || selectedModel
        setCurrentModel(m)
        addLog('system','⚙️ System',`✅ Model switched to: ${m}`)
        setShowModelPanel(false)
      }
    } catch { setModelError('Failed') } finally { setModelSaving(false) }
  }

  /* ── File actions ─────────────────────────────────────── */
  const handleFileUpload = async (e) => {
    const files = Array.from(e.target.files)
    if (!files.length) return
    setUploading(true)
    for (const f of files) {
      const fd = new FormData(); fd.append('file', f)
      try { await fetch(`${API_URL}/upload`, { method:'POST', body:fd }) } catch {}
    }
    await fetchUploads()
    setUploading(false)
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  const handleDeleteUpload = async (filename) => {
    await fetch(`${API_URL}/uploads/${encodeURIComponent(filename)}`, { method:'DELETE' })
    await fetchUploads()
    setSelectedFiles(p => p.filter(f => f !== filename))
  }

  /* ── Job actions ──────────────────────────────────────── */
  const handleRun = async () => {
    if (!topic.trim() || running) return
    setResult(null); setReportFile(null); setReportFormat('md'); setLogs([]); setRunning(true); setCurrentPhase(null)
    const res  = await fetch(`${API_URL}/run`, {
      method:'POST', headers:{'Content-Type':'application/json'},
      body: JSON.stringify({ topic, mode, uploaded_files: selectedFiles }),
    })
    const data = await res.json()
    setJobId(data.job_id)
  }

  const handleDownload = () => {
    if (!reportFile) return
    const a = document.createElement('a'); a.href=`${API_URL}/reports/${reportFile}`; a.download=reportFile; a.click()
  }

  /* ── Agent editor actions ─────────────────────────────── */
  const handleCreateAgent = async () => {
    if (!newAgentForm.role.trim()) return
    const res  = await fetch(`${API_URL}/agents`, {
      method: 'POST',
      headers: {'Content-Type':'application/json'},
      body: JSON.stringify(newAgentForm),
    })
    const data = await res.json()
    await fetchAgents()

    if (data.duplicate) {
      addLog('system', '⚙️ System',
        `⚠️ Role "${newAgentForm.role}" already exists (${data.agent?.label}). No duplicate created.`)
      return
    }

    setNewAgentForm({ label:'', role:'', goal:'', backstory:'', icon:'🤖', color:'#a78bfa' })
    setAgentTab('list')
  }

  const handleUpdateAgent = async () => {
    if (!editingAgent) return
    await fetch(`${API_URL}/agents/${editingAgent.id}`, { method:'PUT',
      headers:{'Content-Type':'application/json'}, body:JSON.stringify(editingAgent) })
    await fetchAgents()
    setEditingAgent(null); setAgentTab('list')
  }

  const handleDeleteAgent = async (id) => {
    await fetch(`${API_URL}/agents/${id}`, { method:'DELETE' })
    await fetchAgents()
  }

  const handleOpenSkills = async (agent) => {
    setSkillsAgentId(agent.id)
    setSkillsText('')
    setAgentTab('skills')
    setShowAgentEditor(true)
    try {
      const d = await fetch(`${API_URL}/agents/${agent.id}/skills`).then(r => r.json())
      // backend returns {text: "..."} — not {content}
      setSkillsText(d.text || d.content || '')
    } catch {
      setSkillsText('# Failed to load SKILLS.md')
    }
  }

  const handleToggleActive = async (agent) => {
    const ep = agent.active === false ? 'activate' : 'deactivate'
    await fetch(`${API_URL}/agents/${agent.id}/${ep}`, { method: 'POST' })
    await fetchAgents()
  }

  const handleSaveSkills = async () => {
    if (!skillsAgentId) return
    setSkillsSaving(true)
    try {
      await fetch(`${API_URL}/agents/${skillsAgentId}/skills`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: skillsText }),
      })
      addLog('system', '⚙️ System', `📄 SKILLS.md saved for ${skillsAgentId}`)
      await fetchAgents()
    } catch {
      addLog('system', '⚙️ System', `❌ Failed to save SKILLS.md for ${skillsAgentId}`)
    } finally {
      setSkillsSaving(false)
    }
  }

  /* ── Spawn decisions ──────────────────────────────────── */
  const handleSpawnDecision = async (request_id, approved) => {
    await fetch(`${API_URL}/spawns/decide`, { method:'POST',
      headers:{'Content-Type':'application/json'},
      body: JSON.stringify({ request_id, approved }) })
    setSpawnRequests(p => p.filter(r => r.request_id !== request_id))
    await fetchAgents()
  }

  /* ══════════════════════════════════════════════════════
     RENDER
     Everything below is unchanged visual JSX — the state
     keys that changed are: fsConfig.access (was access_list)
     and availableModels (now from presets).
  ══════════════════════════════════════════════════════ */

  const phaseAgents = PHASE_ORDER.filter(id =>
    agents.find(a => a.role === id) || BUILTIN.includes(id)
  )

  return (
    <div className="app-container">
      {/* ── Header ─────────────────────────────────────── */}
      <header className="header">
        <span className="header-title">⬡ Multi Agent Orchestration</span>
        <div className="header-right">
          <button className={`nav-btn ${showDashboard ? 'active':''}`}
            onClick={()=>setShowDashboard(p=>!p)}>
            📊 Dashboard
          </button>
          <button className={`nav-btn ${showAgentEditor ? 'active':''}`}
            onClick={()=>setShowAgentEditor(p=>!p)}>
            🤖 Agents <span className="nav-badge">{agents.length}</span>
          </button>
          <button className={`nav-btn ${showToolPanel ? 'active':''}`}
            onClick={()=>setShowToolPanel(p=>!p)}>
            🔧 Tools <span className="nav-badge">{tools.length}</span>
          </button>
          <button className={`nav-btn ${showFsPanel ? 'active':''}`}
            onClick={()=>{ setShowFsPanel(p=>!p); if(!showFsPanel) fetchFsConfig() }}>
            📁 Filesystem
          </button>
          <button className={`nav-btn ${showKbPanel ? 'active':''}`}
            onClick={()=>setShowKbPanel(p=>!p)}>
            📚 KB
          </button>
          <button className={`nav-btn ${showSettings ? 'active':''}`}
            onClick={()=>setShowSettings(p=>!p)}>
            ⚙️ Settings
          </button>
          <button className={`nav-btn ${showModelPanel ? 'active':''}`}
            onClick={()=>setShowModelPanel(p=>!p)}>
            🧠 {currentModel}
          </button>
          <span className={`conn-dot ${connected ? 'on' : 'off'}`} title={connected?'Connected':'Disconnected'} />
          {jobId && <span className="job-id">#{jobId.slice(0,8)}</span>}
        </div>
      </header>

      {/* ── Model Panel ─────────────────────────────────── */}
      {showModelPanel && (
        <div className="side-panel model-panel">
          <div className="panel-header">
            <span>🧠 Model Selection</span>
            <button className="close-btn" onClick={()=>setShowModelPanel(false)}>✕</button>
          </div>
          <div className="panel-body">
            <p className="panel-hint">
              Active: <strong>{currentModel}</strong>
            </p>
            {availableModels.length === 0 ? (
              <p className="panel-hint muted">
                No presets found. Ensure Ollama is running and models are pulled.<br/>
                Current active model: <code>{currentModel}</code>
              </p>
            ) : (
              <div className="model-list">
                {availableModels.map(m => (
                  <label key={m} className={`model-option ${selectedModel===m?'selected':''}`}>
                    <input type="radio" name="model" value={m}
                      checked={selectedModel===m}
                      onChange={()=>setSelectedModel(m)} />
                    {m}
                    {m === currentModel && <span className="badge-active">active</span>}
                  </label>
                ))}
              </div>
            )}
            {/* Always allow typing a custom model name */}
            <div className="input-row" style={{marginTop:'0.75rem'}}>
              <input
                className="topic-input"
                placeholder="Or type model name manually…"
                value={selectedModel}
                onChange={e=>setSelectedModel(e.target.value)}
                style={{fontSize:'0.8rem'}}
              />
            </div>
            {modelError && <p className="error-msg">{modelError}</p>}
            <button className="run-btn" onClick={handleModelChange} disabled={modelSaving||selectedModel===currentModel}>
              {modelSaving ? '⏳ Saving…' : '✅ Apply Model'}
            </button>
          </div>
        </div>
      )}

      {/* ── Filesystem Panel ─────────────────────────────── */}
      {showFsPanel && (
        <div className="side-panel fs-panel">
          <div className="panel-header">
            <span>📁 Filesystem Access</span>
            <button className="close-btn" onClick={()=>setShowFsPanel(false)}>✕</button>
          </div>
          <div className="panel-body">
            {/* Output directory */}
            <div className="fs-section">
              <h4>Output Directory</h4>
              <div className="input-row">
                <input className="topic-input" placeholder="/path/to/output"
                  value={outputDirInput} onChange={e=>setOutputDirInput(e.target.value)} />
                <button className="run-btn small" onClick={handleSetOutputDir}>Set</button>
              </div>
              {fsConfig.output_dir && (
                <p className="panel-hint">Current: <code>{fsConfig.output_dir}</code></p>
              )}
            </div>

            {/* Access list — uses fsConfig.access (array) */}
            <div className="fs-section">
              <h4>Access Rules <span className="nav-badge">{(fsConfig.access||[]).length}</span></h4>
              {(fsConfig.access||[]).length === 0 ? (
                <p className="panel-hint muted">No access rules configured.</p>
              ) : (
                <div className="fs-list">
                  {(fsConfig.access||[]).map((entry, i) => (
                    <div key={i} className="fs-entry">
                      <span className="fs-path" title={entry.path}>{entry.label||entry.path}</span>
                      <span className="fs-flags">
                        <span className={`fs-flag ${entry.read?'on':'off'}`}
                          onClick={()=>handleToggleFsFlag(entry.path,'read',entry.read)}
                          title="Toggle read">R</span>
                        <span className={`fs-flag ${entry.write?'on':'off'}`}
                          onClick={()=>handleToggleFsFlag(entry.path,'write',entry.write)}
                          title="Toggle write">W</span>
                        <span className={`fs-flag ${entry.edit?'on':'off'}`}
                          onClick={()=>handleToggleFsFlag(entry.path,'edit',entry.edit)}
                          title="Toggle edit">E</span>
                      </span>
                      <button className="del-btn" onClick={()=>handleRemoveFsAccess(entry.path)}>✕</button>
                    </div>
                  ))}
                </div>
              )}

              {/* Add new rule */}
              <div className="fs-add-form">
                <input className="topic-input" placeholder="Path (e.g. /home/user/docs)"
                  value={newFsPath} onChange={e=>setNewFsPath(e.target.value)} />
                <input className="topic-input" placeholder="Label (optional)"
                  value={newFsLabel} onChange={e=>setNewFsLabel(e.target.value)} />
                <div className="fs-flag-row">
                  <label><input type="checkbox" checked={newFsRead}  onChange={e=>setNewFsRead(e.target.checked)}  /> Read</label>
                  <label><input type="checkbox" checked={newFsWrite} onChange={e=>setNewFsWrite(e.target.checked)} /> Write</label>
                  <label><input type="checkbox" checked={newFsEdit}  onChange={e=>setNewFsEdit(e.target.checked)}  /> Edit</label>
                </div>
                {fsError && <p className="error-msg">{fsError}</p>}
                <button className="run-btn small" onClick={handleAddFsAccess}>+ Add Rule</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Dashboard Panel ──────────────────────────────── */}
      {showDashboard && stats && (
        <div className="side-panel dash-panel">
          <div className="panel-header">
            <span>📊 System Dashboard</span>
            <button className="close-btn" onClick={()=>setShowDashboard(false)}>✕</button>
          </div>
          <div className="panel-body">
            <div className="stats-grid">
              <div className="stat-card"><span className="stat-val">{stats.cpu_pct}%</span><span className="stat-label">CPU</span></div>
              <div className="stat-card"><span className="stat-val">{stats.mem_used_mb}MB</span><span className="stat-label">Memory</span></div>
              <div className="stat-card"><span className="stat-val">{stats.jobs_running}</span><span className="stat-label">Running</span></div>
              <div className="stat-card"><span className="stat-val">{stats.jobs_done}</span><span className="stat-label">Done</span></div>
              <div className="stat-card"><span className="stat-val">{stats.jobs_failed}</span><span className="stat-label">Failed</span></div>
              <div className="stat-card"><span className="stat-val">{stats.ws_clients}</span><span className="stat-label">WS Clients</span></div>
              <div className="stat-card"><span className="stat-val">{stats.tokens_in}</span><span className="stat-label">Tokens In</span></div>
              <div className="stat-card"><span className="stat-val">{stats.tokens_out}</span><span className="stat-label">Tokens Out</span></div>
            </div>
          </div>
        </div>
      )}

      {/* ── Agent Editor Panel ────────────────────────────── */}
      {showAgentEditor && (
        <div className="side-panel agent-panel">
          <div className="panel-header">
            <span>🤖 Agent Editor</span>
            <button className="close-btn" onClick={()=>setShowAgentEditor(false)}>✕</button>
          </div>
          <div className="panel-tabs">
            {['list','new','skills'].map(t=>(
              <button key={t} className={`tab-btn ${agentTab===t?'active':''}`}
                onClick={()=>setAgentTab(t)}>{t==='list'?'Agents':t==='new'?'+ New':'Skills'}</button>
            ))}
          </div>
          <div className="panel-body">
            {agentTab === 'list' && (
              <div className="agent-list">
                {agents.map(a=>(
                  <div key={a.id} className={`agent-row ${a.active===false?'inactive':''}`}>
                    <span className="agent-icon">{a.icon||'🤖'}</span>
                    <span className="agent-name">{a.label||a.role}</span>
                    <span className="agent-role muted">{a.role}</span>
                    <div className="agent-actions">
                      <button className="icon-btn" onClick={()=>{setEditingAgent({...a});setAgentTab('edit')}} title="Edit">✏️</button>
                      <button className="icon-btn" onClick={()=>handleOpenSkills(a)} title="Skills">📄</button>
                      <button className="icon-btn" onClick={()=>handleToggleActive(a)} title={a.active===false?'Activate':'Deactivate'}>
                        {a.active===false?'▶':'⏸'}
                      </button>
                      {!BUILTIN.includes(a.role) && (
                        <button className="icon-btn danger" onClick={()=>handleDeleteAgent(a.id)} title="Delete">🗑</button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
            {agentTab === 'new' && (
              <div className="agent-form">
                {[['Label','label'],['Role','role'],['Goal','goal'],['Backstory','backstory']].map(([lbl,key])=>(
                  <div key={key} className="form-field">
                    <label>{lbl}</label>
                    {key==='goal'||key==='backstory'
                      ? <textarea value={newAgentForm[key]} onChange={e=>setNewAgentForm(p=>({...p,[key]:e.target.value}))} rows={3}/>
                      : <input value={newAgentForm[key]} onChange={e=>setNewAgentForm(p=>({...p,[key]:e.target.value}))} />
                    }
                  </div>
                ))}
                <div className="form-row">
                  <div className="form-field half">
                    <label>Icon</label>
                    <input value={newAgentForm.icon} onChange={e=>setNewAgentForm(p=>({...p,icon:e.target.value}))} style={{width:'3rem'}}/>
                  </div>
                  <div className="form-field half">
                    <label>Color</label>
                    <input type="color" value={newAgentForm.color} onChange={e=>setNewAgentForm(p=>({...p,color:e.target.value}))}/>
                  </div>
                </div>
                <button className="run-btn" onClick={handleCreateAgent}>Create Agent</button>
              </div>
            )}
            {agentTab === 'edit' && editingAgent && (
              <div className="agent-form">
                {[['Label','label'],['Goal','goal'],['Backstory','backstory']].map(([lbl,key])=>(
                  <div key={key} className="form-field">
                    <label>{lbl}</label>
                    {key==='goal'||key==='backstory'
                      ? <textarea value={editingAgent[key]||''} onChange={e=>setEditingAgent(p=>({...p,[key]:e.target.value}))} rows={3}/>
                      : <input value={editingAgent[key]||''} onChange={e=>setEditingAgent(p=>({...p,[key]:e.target.value}))} />
                    }
                  </div>
                ))}
                <div className="form-row">
                  <div className="form-field half">
                    <label>Icon</label>
                    <input value={editingAgent.icon||'🤖'} onChange={e=>setEditingAgent(p=>({...p,icon:e.target.value}))} style={{width:'3rem'}}/>
                  </div>
                  <div className="form-field half">
                    <label>Color</label>
                    <input type="color" value={editingAgent.color||'#a78bfa'} onChange={e=>setEditingAgent(p=>({...p,color:e.target.value}))}/>
                  </div>
                </div>
                <div className="form-btn-row">
                  <button className="run-btn" onClick={handleUpdateAgent}>Save Changes</button>
                  <button className="sec-btn" onClick={()=>{setEditingAgent(null);setAgentTab('list')}}>Cancel</button>
                </div>
              </div>
            )}
            {agentTab === 'skills' && (
              <div className="skills-editor">
                <p className="panel-hint">Editing SKILLS.md for agent: <strong>{skillsAgentId}</strong></p>
                <textarea
                  className="code-editor"
                  value={skillsText}
                  onChange={e=>setSkillsText(e.target.value)}
                  rows={20}
                  placeholder="# Skills\n\nDescribe this agent's specialised skills here…"
                />
                <div className="form-btn-row">
                  <button className="run-btn" onClick={handleSaveSkills} disabled={skillsSaving}>
                    {skillsSaving ? '⏳ Saving…' : '💾 Save Skills'}
                  </button>
                  <button className="sec-btn" onClick={()=>setAgentTab('list')}>Back</button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Tool Panel ────────────────────────────────────── */}
      {showToolPanel && (
        <div className="side-panel tool-panel">
          <div className="panel-header">
            <span>🔧 Tool Manager</span>
            <button className="close-btn" onClick={()=>setShowToolPanel(false)}>✕</button>
          </div>
          <div className="panel-tabs">
            {['list','new'].map(t=>(
              <button key={t} className={`tab-btn ${toolTab===t?'active':''}`}
                onClick={()=>setToolTab(t)}>{t==='list'?'Tools':'+ New'}</button>
            ))}
          </div>
          <div className="panel-body">
            {toolTab === 'list' && (
              <div className="tool-list">
                {tools.length === 0 && <p className="panel-hint muted">No tools registered yet.</p>}
                {tools.map(t=>(
                  <div key={t.id} className={`tool-row ${t.active===false?'inactive':''}`}>
                    <span className="tool-name">{t.display_name||t.name}</span>
                    <div className="tool-actions">
                      <button className="icon-btn" onClick={()=>{setEditingTool({...t});setToolTab('edit')}} title="Edit">✏️</button>
                      <button className="icon-btn" onClick={()=>handleOpenToolMd(t)} title="TOOL.md">📄</button>
                      <button className="icon-btn" onClick={()=>handleToggleToolActive(t)} title={t.active===false?'Activate':'Deactivate'}>
                        {t.active===false?'▶':'⏸'}
                      </button>
                      <button className="icon-btn danger" onClick={()=>handleDeleteTool(t.id)} title="Delete">🗑</button>
                    </div>
                  </div>
                ))}
              </div>
            )}
            {toolTab === 'new' && (
              <div className="tool-form">
                {[['Name (snake_case)','name'],['Display Name','display_name'],['Description','description'],['Tags (comma-sep)','tags']].map(([lbl,key])=>(
                  <div key={key} className="form-field">
                    <label>{lbl}</label>
                    <input value={newToolForm[key]} onChange={e=>setNewToolForm(p=>({...p,[key]:e.target.value}))} />
                  </div>
                ))}
                <div className="form-field">
                  <label>Python code (function body)</label>
                  <textarea className="code-editor" value={newToolForm.code}
                    onChange={e=>setNewToolForm(p=>({...p,code:e.target.value}))} rows={8}/>
                </div>
                <button className="run-btn" onClick={handleCreateTool}>Create Tool</button>
              </div>
            )}
            {toolTab === 'edit' && editingTool && (
              <div className="tool-form">
                {[['Display Name','display_name'],['Description','description']].map(([lbl,key])=>(
                  <div key={key} className="form-field">
                    <label>{lbl}</label>
                    <input value={editingTool[key]||''} onChange={e=>setEditingTool(p=>({...p,[key]:e.target.value}))} />
                  </div>
                ))}
                <div className="form-field">
                  <label>Python code</label>
                  <textarea className="code-editor" value={editingTool.code||''}
                    onChange={e=>setEditingTool(p=>({...p,code:e.target.value}))} rows={8}/>
                </div>
                <div className="form-btn-row">
                  <button className="run-btn" onClick={handleUpdateTool}>Save</button>
                  <button className="sec-btn" onClick={()=>{setEditingTool(null);setToolTab('list')}}>Cancel</button>
                </div>
              </div>
            )}
            {toolTab === 'toolmd' && (
              <div className="skills-editor">
                <p className="panel-hint">TOOL.md for: <strong>{toolMdId}</strong></p>
                <textarea className="code-editor" value={toolMdText}
                  onChange={e=>setToolMdText(e.target.value)} rows={20}/>
                <div className="form-btn-row">
                  <button className="run-btn" onClick={handleSaveToolMd} disabled={toolMdSaving}>
                    {toolMdSaving ? '⏳ Saving…' : '💾 Save'}
                  </button>
                  <button className="sec-btn" onClick={()=>setToolTab('list')}>Back</button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Settings Panel ───────────────────────────────── */}
      {showSettings && (
        <div className="side-panel settings-panel">
          <div className="panel-header">
            <span>⚙️ Settings</span>
            <button className="close-btn" onClick={()=>setShowSettings(false)}>✕</button>
          </div>
          <div className="panel-tabs">
            {['telegram','improver','websearch'].map(t=>(
              <button key={t} className={`tab-btn ${settingsTab===t?'active':''}`}
                onClick={()=>setSettingsTab(t)}>
                {t==='telegram'?'📱 Telegram':t==='improver'?'🔄 Improver':'🌐 Web Search'}
              </button>
            ))}
          </div>
          <div className="panel-body">
            {settingsTab === 'telegram' && (
              <div>
                <div className="form-field">
                  <label>Bot Token {tgBotSet && <span className="badge-active">set</span>}</label>
                  <input type="password" placeholder="Enter new token to change…"
                    value={tgConfig.bot_token} onChange={e=>setTgConfig(p=>({...p,bot_token:e.target.value}))}/>
                </div>
                <div className="form-field">
                  <label>Allowed Chat IDs (comma-separated)</label>
                  <input value={tgConfig.allowed_chat_ids} onChange={e=>setTgConfig(p=>({...p,allowed_chat_ids:e.target.value}))}/>
                </div>
                <div className="form-field">
                  <label>Notify Chat ID</label>
                  <input value={tgConfig.notify_chat_id} onChange={e=>setTgConfig(p=>({...p,notify_chat_id:e.target.value}))}/>
                </div>
                <label className="checkbox-row">
                  <input type="checkbox" checked={tgConfig.enabled} onChange={e=>setTgConfig(p=>({...p,enabled:e.target.checked}))}/>
                  Enabled
                </label>
                <div className="form-btn-row">
                  <button className="run-btn" onClick={handleSaveTelegram} disabled={tgSaving}>{tgSaving?'⏳ Saving…':'💾 Save'}</button>
                  <button className="sec-btn" onClick={handleTestTelegram} disabled={tgTesting}>{tgTesting?'⏳ Testing…':'📤 Test'}</button>
                </div>
                {tgTestResult && <pre className="test-result">{tgTestResult}</pre>}
              </div>
            )}
            {settingsTab === 'improver' && (
              <div>
                <label className="checkbox-row">
                  <input type="checkbox" checked={siConfig.enabled} onChange={e=>setSiConfig(p=>({...p,enabled:e.target.checked}))}/>
                  Auto-improve enabled
                </label>
                <div className="form-field">
                  <label>Interval (hours)</label>
                  <input type="number" value={siConfig.interval_hours} onChange={e=>setSiConfig(p=>({...p,interval_hours:+e.target.value}))}/>
                </div>
                <label className="checkbox-row">
                  <input type="checkbox" checked={siConfig.auto_apply_safe} onChange={e=>setSiConfig(p=>({...p,auto_apply_safe:e.target.checked}))}/>
                  Auto-apply safe changes
                </label>
                <div className="form-btn-row">
                  <button className="run-btn" onClick={handleSaveSiConfig} disabled={siSaving}>{siSaving?'⏳ Saving…':'💾 Save'}</button>
                  <button className="sec-btn" onClick={handleRunImprover} disabled={siRunning}>{siRunning?'⏳ Running…':'▶ Run Now'}</button>
                </div>
              </div>
            )}
            {settingsTab === 'websearch' && (
              <div>
                <label className="checkbox-row">
                  <input type="checkbox" checked={wsConfig.enabled} onChange={e=>setWsConfig(p=>({...p,enabled:e.target.checked}))}/>
                  Web search enabled
                </label>
                <div className="form-field">
                  <label>Provider</label>
                  <select value={wsConfig.provider} onChange={e=>setWsConfig(p=>({...p,provider:e.target.value}))}>
                    {['auto','duckduckgo','google','bing'].map(v=><option key={v} value={v}>{v}</option>)}
                  </select>
                </div>
                <div className="form-field">
                  <label>Max results</label>
                  <input type="number" value={wsConfig.max_results} onChange={e=>setWsConfig(p=>({...p,max_results:+e.target.value}))}/>
                </div>
                <div className="form-btn-row">
                  <button className="run-btn" onClick={handleSaveWsConfig} disabled={wsSaving}>{wsSaving?'⏳…':'💾 Save'}</button>
                  <button className="sec-btn" onClick={handleTestWsProviders} disabled={wsTesting}>{wsTesting?'⏳…':'🧪 Test'}</button>
                </div>
                <div className="input-row" style={{marginTop:'0.5rem'}}>
                  <input className="topic-input" placeholder="Test query…"
                    value={wsTestQuery} onChange={e=>setWsTestQuery(e.target.value)}/>
                  <button className="sec-btn" onClick={handleRunWsQuery} disabled={wsTesting}>▶</button>
                </div>
                {wsTestResult && <pre className="test-result">{wsTestResult}</pre>}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Knowledge Base Panel ─────────────────────────── */}
      {showKbPanel && (
        <div className="side-panel kb-panel">
          <div className="panel-header">
            <span>📚 Knowledge Base</span>
            <button className="close-btn" onClick={()=>setShowKbPanel(false)}>✕</button>
          </div>
          <div className="panel-tabs">
            {['browse','add','config'].map(t=>(
              <button key={t} className={`tab-btn ${kbTab===t?'active':''}`}
                onClick={()=>setKbTab(t)}>{t==='browse'?'Browse':t==='add'?'+ Add':'Config'}</button>
            ))}
          </div>
          <div className="panel-body">
            {kbTab === 'browse' && (
              <div>
                <p className="panel-hint">
                  {kbEntries.count||0} chunks · {(kbEntries.sources||[]).length} sources
                </p>
                <div className="input-row">
                  <input className="topic-input" placeholder="Search KB…"
                    value={kbSearchQ} onChange={e=>setKbSearchQ(e.target.value)}/>
                  <button className="sec-btn" onClick={handleKbSearch} disabled={kbSearching}>🔍</button>
                </div>
                {kbSearchResult && <pre className="test-result">{kbSearchResult}</pre>}
                <div className="source-list" style={{marginTop:'0.75rem'}}>
                  {(kbEntries.sources||[]).map(s=>(
                    <div key={s} className="source-row">
                      <span>{s}</span>
                      <button className="del-btn" onClick={()=>handleDeleteKbSource(s)}>✕</button>
                    </div>
                  ))}
                </div>
                <button className="sec-btn danger" style={{marginTop:'0.75rem'}} onClick={handleClearKb}>
                  🗑 Clear All
                </button>
              </div>
            )}
            {kbTab === 'add' && (
              <div>
                <div className="form-field">
                  <label>Upload file(s)</label>
                  <input type="file" ref={kbFileRef} multiple onChange={handleKbFileUpload} disabled={kbUploading}/>
                </div>
                <hr style={{borderColor:'var(--border)',margin:'0.75rem 0'}}/>
                <div className="form-field">
                  <label>Paste text — Source name</label>
                  <input value={kbPasteName} onChange={e=>setKbPasteName(e.target.value)} placeholder="doc-name"/>
                </div>
                <div className="form-field">
                  <label>Tags (comma-sep)</label>
                  <input value={kbPasteTags} onChange={e=>setKbPasteTags(e.target.value)} placeholder="tag1, tag2"/>
                </div>
                <div className="form-field">
                  <label>Text</label>
                  <textarea value={kbPasteText} onChange={e=>setKbPasteText(e.target.value)} rows={8} placeholder="Paste content…"/>
                </div>
                <button className="run-btn" onClick={handleKbPasteIngest} disabled={kbUploading}>
                  {kbUploading?'⏳ Ingesting…':'📥 Ingest'}
                </button>
              </div>
            )}
            {kbTab === 'config' && (
              <div>
                <label className="checkbox-row">
                  <input type="checkbox" checked={kbConfig.enabled} onChange={e=>setKbConfig(p=>({...p,enabled:e.target.checked}))}/>
                  RAG enabled
                </label>
                {[['Embed model','embed_model','text'],['Top K','top_k','number'],['Min score','min_score','number'],['Chunk size','chunk_size','number']].map(([lbl,key,type])=>(
                  <div key={key} className="form-field">
                    <label>{lbl}</label>
                    <input type={type} value={kbConfig[key]||''} onChange={e=>setKbConfig(p=>({...p,[key]:type==='number'?+e.target.value:e.target.value}))}/>
                  </div>
                ))}
                <button className="run-btn" onClick={handleSaveKbConfig} disabled={kbConfigSaving}>
                  {kbConfigSaving?'⏳ Saving…':'💾 Save Config'}
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Spawn request toasts ──────────────────────────── */}
      {spawnRequests.length > 0 && (
        <div className="spawn-toasts">
          {spawnRequests.map(req=>(
            <div key={req.request_id} className="spawn-toast">
              <span>{req.message||`Spawn: ${req.role}`}</span>
              <button className="run-btn small" onClick={()=>handleSpawnDecision(req.request_id,true)}>✅ Approve</button>
              <button className="sec-btn small" onClick={()=>handleSpawnDecision(req.request_id,false)}>❌ Reject</button>
            </div>
          ))}
        </div>
      )}

      {/* ── Tool spawn toasts ─────────────────────────────── */}
      {toolSpawnReqs.length > 0 && (
        <div className="spawn-toasts tool-spawns">
          {toolSpawnReqs.map(req=>(
            <div key={req.request_id} className="spawn-toast">
              <span>🔧 New tool requested: <strong>{req.suggestion?.name||'?'}</strong></span>
              <button className="run-btn small" onClick={()=>handleToolSpawnDecision(req.request_id,true)}>✅ Approve</button>
              <button className="sec-btn small" onClick={()=>handleToolSpawnDecision(req.request_id,false)}>❌ Reject</button>
            </div>
          ))}
        </div>
      )}

      {/* ── Main layout ──────────────────────────────────── */}
      <div className="main-layout">
        {/* Left: 3D scene */}
        <div className="scene-col">
          <AgentScene3D
            activeAgent={activeAgent}
            agents={agents}
            currentPhase={currentPhase}
            phaseAgents={phaseAgents}
            currentWorker={currentWorker}
          />
        </div>

        {/* Centre: controls + result */}
        <div className="centre-col">
          {/* Mode selector */}
          <div className="mode-selector">
            {MODES.map(m=>(
              <button key={m.id}
                className={`mode-btn ${mode===m.id?'active':''}`}
                onClick={()=>setMode(m.id)}
                title={m.desc}>
                {m.label}
              </button>
            ))}
          </div>

          {/* Topic input */}
          <div className="input-row">
            <input
              className="topic-input"
              value={topic}
              onChange={e=>setTopic(e.target.value)}
              onKeyDown={e=>e.key==='Enter'&&handleRun()}
              placeholder="Enter research topic or question…"
              disabled={running}
            />
            <button className="run-btn" onClick={handleRun} disabled={running||!topic.trim()}>
              {running ? '⏳ Running…' : '▶ Run'}
            </button>
          </div>

          {/* File upload (file mode) */}
          {mode === 'file' && (
            <div className="upload-section">
              <button className="sec-btn" onClick={()=>setShowUploadPanel(p=>!p)}>
                📎 Files {uploads.length>0&&`(${uploads.length})`}
              </button>
              {showUploadPanel && (
                <div className="upload-panel">
                  <input type="file" ref={fileInputRef} multiple onChange={handleFileUpload} disabled={uploading}/>
                  <div className="file-list">
                    {uploads.map(f=>(
                      <div key={f.name} className={`file-row ${selectedFiles.includes(f.name)?'selected':''}`}>
                        <label>
                          <input type="checkbox" checked={selectedFiles.includes(f.name)}
                            onChange={e=>{
                              if(e.target.checked) setSelectedFiles(p=>[...p,f.name])
                              else setSelectedFiles(p=>p.filter(x=>x!==f.name))
                            }}/>
                          {f.name} <span className="muted">({(f.size/1024).toFixed(1)}KB)</span>
                        </label>
                        <button className="del-btn" onClick={()=>handleDeleteUpload(f.name)}>✕</button>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Phase progress bar */}
          {running && (
            <div className="phase-bar">
              {PHASE_ORDER.map(id=>{
                const meta  = PHASE_META[id]
                const done  = currentPhase && PHASE_ORDER.indexOf(id) < PHASE_ORDER.indexOf(currentPhase)
                const active= currentPhase === id
                return (
                  <div key={id} className={`phase-step ${active?'active':''} ${done?'done':''}`}>
                    <span className="phase-icon">{meta.icon}</span>
                    <span className="phase-name">{meta.name}</span>
                  </div>
                )
              })}
            </div>
          )}

          {/* Agent cards */}
          <div className="agent-cards">
            {phaseAgents.map(id => {
              const agent = agents.find(a=>a.role===id)
              const meta  = PHASE_META[id]
              return (
                <AgentCard
                  key={id}
                  agentId={id}
                  label={agent?.label || meta?.name || id}
                  icon={agent?.icon  || meta?.icon  || '🤖'}
                  color={agent?.color}
                  isActive={activeAgent===id}
                  isDone={currentPhase && PHASE_ORDER.indexOf(id) < PHASE_ORDER.indexOf(currentPhase)}
                  lastMessage={lastMessages[id]}
                />
              )
            })}
          </div>

          {/* Result */}
          {result && (
            <div className="result-panel">
              <div className="result-header">
                <span>📄 Report</span>
                <div className="result-actions">
                  {reportFile && (
                    <button className="sec-btn small" onClick={handleDownload}>
                      ⬇ Download {reportFormat.toUpperCase()}
                    </button>
                  )}
                  <button className="sec-btn small" onClick={()=>setResult(null)}>✕</button>
                </div>
              </div>
              <pre className="result-body">{result}</pre>
            </div>
          )}
        </div>

        {/* Right: activity feed */}
        <div className="feed-col">
          <ActivityFeed logs={logs} agents={agents} />
        </div>
      </div>
    </div>
  )
}
