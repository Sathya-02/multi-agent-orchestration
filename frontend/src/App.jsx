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
  const [show3DRoom, setShow3DRoom] = useState(false)

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
  const [fsConfig,      setFsConfig]      = useState({ access_list: [], output_dir: null })
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
  const modelTimer = useRef(null)

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

  // Models polling — refresh installed status every 15s when panel is open
  useEffect(() => {
    if (!showModelPanel) return
    fetchModels() // immediate refresh when panel opens
    const id = setInterval(fetchModels, 15000)
    return () => clearInterval(id)
  }, [showModelPanel])

  /* ── WebSocket ────────────────────────────────────────── */
  useEffect(() => {
    const connect = () => {
      const ws = new WebSocket(WS_URL)
      wsRef.current = ws
      ws.onopen    = () => {
        setConnected(true)
        // Re-fetch current state in case we missed events during reconnect
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
    // If the last entry is from the same agent with the same message, skip it
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

  const fetchModels = async () => {
    try {
      const d = await fetch(`${API_URL}/models`).then(r => r.json())
      const raw = d.models || d.installed || []
      // ✅ Only include models where pulled === true (or plain strings = legacy format)
      const installed = raw
        .filter(m => typeof m === 'string' || m.pulled === true)
        .map(m => typeof m === 'string' ? m : (m.name || m.id || String(m)))
      const active = typeof d.active_model === 'string'
        ? d.active_model
        : (d.active_model?.name || d.active || '')
      setAvailableModels(installed)          // always update (even empty = all unpulled)
      if (active) setCurrentModel(active)    // don't reset selectedModel
    } catch {}
  }
  const fetchUploads = async () => {
    try { setUploads(await fetch(`${API_URL}/uploads`).then(r=>r.json())) } catch {}
  }
  const fetchAgents = async () => {
    try {
      const d = await fetch(`${API_URL}/agents`).then(r=>r.json())
      // Handle both {agents:[...]} dict and plain array
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

  const fetchFsConfig = async () => {
    try {
      const d = await fetch(`${API_URL}/fs-config`).then(r => r.json())
      setFsConfig({
        output_dir: null,
        ...d,
        access_list: Array.isArray(d.access_list) ? d.access_list : []
      })
      setOutputDirInput(d.output_dir || '')
    } catch {
      // Keep existing state intact — never let access_list become undefined
      setFsConfig(prev => ({ ...prev, access_list: Array.isArray(prev.access_list) ? prev.access_list : [] }))
    }
  }

  const fetchFsAudit = async () => {
    try {
      const d = await fetch(`${API_URL}/fs-config/audit`).then(r=>r.json())
      setFsAudit(d.audit || [])
    } catch {}
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
      const d = await fetch(`${API_URL}/web-search/config`, {
        method: 'POST', headers: {'Content-Type': 'application/json'},
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
      if (!r.ok) return   // 404 = Telegram disabled, skip silently
      const d = await r.json()
      if (d._note) return  // disabled stub, skip
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
      const d = await fetch(`${API_URL}/telegram/config`, {
        method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(payload)
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
      await fetch(`${API_URL}/self-improver/config`, {
        method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(siConfig)
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
      await fetch(`${API_URL}/kb/config`, {
        method:'POST', headers:{'Content-Type':'application/json'},
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
        const d = await fetch(`${API_URL}/kb/ingest-file`, {method:'POST', body:fd}).then(r=>r.json())
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
      const d = await fetch(`${API_URL}/kb/ingest-text`, {
        method:'POST', headers:{'Content-Type':'application/json'},
        body: JSON.stringify({
          text: kbPasteText,
          source_name: kbPasteName,
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
    await fetch(`${API_URL}/kb/sources/${encodeURIComponent(source)}`, {method:'DELETE'})
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

  // Handler function
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
      const mRaw = msg.active_model || msg.model
      const m = typeof mRaw === 'string' ? mRaw : (mRaw?.name || mRaw?.id || '')
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
      // Server pushed the full updated config — apply immediately without a round-trip
      if (msg.config) {
        setFsConfig({ output_dir: null, ...msg.config, access_list: Array.isArray(msg.config.access_list) ? msg.config.access_list : [] })
        setOutputDirInput(msg.config.output_dir || '')
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
    const currentStr = typeof currentModel === 'string' ? currentModel : ''
    if (selectedModel === currentStr) return
    setModelSaving(true); setModelError(null)
    try {
      const d = await fetch(`${API_URL}/models/select`, { method:'POST',
  headers:{'Content-Type':'application/json'}, body:JSON.stringify({model:selectedModel}) }).then(r=>r.json())
      if (d.error) setModelError(d.error)
      else {
        const mRaw = d.active_model || d.model
        const m = typeof mRaw === 'string' ? mRaw : (mRaw?.name || mRaw?.id || selectedModel)
        setCurrentModel(m)
        setSelectedModel(m)  // ← keep selected in sync so disabled check works correctly
        addLog('system', '⚙️ System', `✅ Model switched to: ${m}`)
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
      // Show duplicate warning inline — do NOT switch to list
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
      setSkillsText(d.content || '')
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
      headers:{'Content-Type':'application/json'}, body:JSON.stringify({request_id, approved}) })
    setSpawnRequests(p => p.filter(r => r.request_id !== request_id))
    await fetchAgents()
  }

  const modelBadgeColor = () => {
    const m = typeof currentModel === 'string' ? currentModel : ''
    if (m.includes('llama3') || m.includes('mistral') || m.includes('qwen')) return '#22c55e'
    if (m.includes('phi3')   || m.includes('gemma'))                         return '#f59e0b'
    return '#6366f1'
  }

  const currentPhaseIndex = currentPhase ? PHASE_ORDER.indexOf(currentPhase) : -1
  const pendingSpawns     = spawnRequests.filter(r => !r._resolved)
  const pendingToolSpawns = toolSpawnReqs.filter(r => !r._resolved)

  return (
    <div className="app-container">

      {/* ── Header ────────────────────────────────────────── */}
      <header className="header">
        <span className="header-title">⬡ Multi Agent Orchestration</span>
        <div className="header-right">
          {/* Spawn approval badge */}
          {pendingSpawns.length > 0 && (
            <button className="spawn-alert-btn" onClick={() => setShowAgentEditor(true)}>
              🤖 {pendingSpawns.length} spawn request{pendingSpawns.length>1?'s':''}
            </button>
          )}
          {/* Nav buttons */}
          <button className={`nav-btn ${showDashboard ? 'active' : ''}`}
            onClick={() => { setShowDashboard(v=>!v); setShowUploadPanel(false); setShowAgentEditor(false); setShowModelPanel(false) }}>
            📊 Dashboard
          </button>
          <button className={`nav-btn ${showUploadPanel ? 'active' : ''}`}
            onClick={() => { setShowUploadPanel(v=>!v); setShowDashboard(false); setShowAgentEditor(false); setShowModelPanel(false) }}>
            📎 Files {uploads.length > 0 && <span className="nav-badge">{uploads.length}</span>}
          </button>
          <button className={`nav-btn ${showFsPanel ? 'active' : ''}`}
            onClick={() => { setShowFsPanel(v=>!v); setShowDashboard(false); setShowUploadPanel(false); setShowAgentEditor(false); setShowModelPanel(false); if (!showFsPanel) fetchFsConfig() }}>
            📁 Filesystem
          </button>
          <button className={`nav-btn ${showKbPanel ? 'active' : ''}`}
            onClick={() => {
              setShowKbPanel(v=>!v)
              setShowDashboard(false); setShowUploadPanel(false)
              setShowAgentEditor(false); setShowModelPanel(false)
              setShowToolPanel(false); setShowFsPanel(false); setShowSettings(false)
              if (!showKbPanel) { fetchKbEntries(); fetchKbConfig() }
            }}>
            📚 Knowledge Base
            <span className="nav-badge">{kbEntries.count || 0}</span>
          </button>
          {pendingToolSpawns.length > 0 && (
            <button className="spawn-alert-btn" style={{background:'rgba(16,185,129,.12)',border:'1px solid rgba(16,185,129,.35)',color:'#6ee7b7'}}
              onClick={() => setShowToolPanel(true)}>
              🔧 {pendingToolSpawns.length} tool request{pendingToolSpawns.length>1?'s':''}
            </button>
          )}
          <button className={`nav-btn ${showToolPanel ? 'active' : ''}`}
            onClick={() => { setShowToolPanel(v=>!v); setShowDashboard(false); setShowUploadPanel(false); setShowAgentEditor(false); setShowModelPanel(false); setShowFsPanel(false) }}>
            🔧 Tools <span className="nav-badge">{tools.length}</span>
          </button>
          <button className={`nav-btn ${showAgentEditor ? 'active' : ''}`}
            onClick={() => { setShowAgentEditor(v=>!v); setShowDashboard(false); setShowUploadPanel(false); setShowModelPanel(false); setShowToolPanel(false) }}>
            🤖 Agents <span className="nav-badge">{agents.length}</span>
          </button>
          <button className={`nav-btn ${showSettings ? 'active' : ''}`}
            onClick={() => { setShowSettings(v=>!v); if(!showSettings){fetchTelegramConfig();fetchSiConfig();fetchBestPractices();fetchProposals()} setShowDashboard(false); setShowUploadPanel(false); setShowAgentEditor(false); setShowToolPanel(false); setShowFsPanel(false); setShowModelPanel(false) }}>
            ⚙️ Settings
          </button>
        </div>
      </header>

      {/* ── Dashboard Overlay ─────────────────────────────── */}
      {showDashboard && stats && (
        <div className="overlay-panel dashboard-panel">
          <div className="overlay-header">
            <span>📊 System Dashboard</span>
            <button className="overlay-close" onClick={() => setShowDashboard(false)}>✕</button>
          </div>
          <div className="dashboard-grid">
            <StatCard label="RAM Used" value={`${stats.ram_used_gb} GB`} sub={`of ${stats.ram_total_gb} GB`} pct={stats.ram_pct} color="#6366f1"/>
            <StatCard label="CPU" value={`${stats.cpu_pct}%`} sub="utilisation" pct={stats.cpu_pct} color="#00BFA6"/>
            <StatCard label="Disk Used" value={`${stats.disk_used_gb} GB`} sub={`of ${stats.disk_total_gb} GB`} pct={stats.disk_pct} color="#FF6584"/>
            <StatCard label="Model VRAM" value={`${stats.ollama?.vram_mb||0} MB`} sub={stats.ollama?.model||currentModel} pct={null} color="#FFC107"/>
            <StatCard label="Tokens In" value={stats.tokens_in.toLocaleString()} sub="session total" pct={null} color="#a78bfa"/>
            <StatCard label="Tokens Out" value={stats.tokens_out.toLocaleString()} sub={`last job: ${stats.tokens_last}`} pct={null} color="#34d399"/>
            <StatCard label="Active Jobs" value={stats.active_jobs} sub={`${stats.total_jobs} total`} pct={null} color="#fb7185"/>
            <StatCard label="RAM Free" value={`${stats.ram_free_gb} GB`} sub="available" pct={null} color="#38bdf8"/>
          </div>
          <div className="dashboard-model-row">
            <span>Active Model:</span>
            <span style={{color:'#a5b4fc',fontWeight:700}}>{stats.ollama?.model||currentModel}</span>
            <span style={{color:'#475569',marginLeft:'auto'}}>Refreshes every 3s</span>
          </div>
        </div>
      )}

      {/* ── File Upload Overlay ────────────────────────────── */}
      {showUploadPanel && (
        <div className="overlay-panel upload-panel">
          <div className="overlay-header">
            <span>📎 File Manager</span>
            <button className="overlay-close" onClick={() => setShowUploadPanel(false)}>✕</button>
          </div>
          <div className="upload-body">
            <div className="upload-drop-zone" onClick={() => fileInputRef.current?.click()}>
              <span className="upload-icon">📤</span>
              <span>Click to upload files</span>
              <span className="upload-hint">PDF, DOCX, TXT, CSV, XLSX, JSON</span>
              {uploading && <span className="upload-hint">Uploading…</span>}
            </div>
            <input ref={fileInputRef} type="file" multiple style={{display:'none'}}
              accept=".pdf,.docx,.txt,.csv,.xlsx,.json,.md,.log"
              onChange={handleFileUpload} />

            {uploads.length > 0 && (
              <div className="upload-list">
                <div className="upload-list-header">
                  <span>Uploaded Files</span>
                  <span style={{color:'#475569'}}>{uploads.length} file{uploads.length>1?'s':''}</span>
                </div>
                {uploads.map(f => {
                  const fname = f.filename || f.name
                  if (!fname) return null

                  const isSelected = selectedFiles.includes(fname)

                  return (
                    <div key={fname}
                      className={`upload-item ${isSelected ? 'selected' : ''}`}
                      onClick={() => setSelectedFiles(p =>
                        p.includes(fname) ? p.filter(x => x !== fname) : [...p, fname]
                      )}>
                      <span className="upload-item-icon">{fileIcon(fname)}</span>
                      <div className="upload-item-info">
                        <span className="upload-item-name">{fname}</span>
                        <span className="upload-item-size">{formatBytes(f.size)}</span>
                      </div>
                      <div style={{display:'flex',gap:6,alignItems:'center'}}>
                        {isSelected && (
                          <span className="upload-selected-badge">✓ selected</span>
                        )}
                        <button
                          className="upload-delete-btn"
                          onClick={e => { e.stopPropagation(); handleDeleteUpload(fname) }}
                        >
                          ✕
                        </button>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
            {selectedFiles.length > 0 && (
              <div className="upload-selected-info">
                {selectedFiles.length} file{selectedFiles.length>1?'s':''} selected for analysis.
                Switch to <strong>File Analysis</strong> mode and launch agents.
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Filesystem Config Overlay ─────────────────────── */}
      {showFsPanel && (
        <div className="overlay-panel fs-panel">
          <div className="overlay-header">
            <span>📁 Filesystem Access</span>
            <div style={{display:'flex',gap:8,alignItems:'center'}}>
              <button className={`nav-btn ${fsAuditTab?'active':''}`}
                onClick={() => { setFsAuditTab(v=>!v); if (!fsAuditTab) fetchFsAudit() }}
                style={{fontSize:10}}>
                📋 Audit Log
              </button>
              <button className="overlay-close" onClick={() => setShowFsPanel(false)}>✕</button>
            </div>
          </div>

          {fsAuditTab ? (
            /* ── Audit log tab ── */
            <div className="fs-body">
              <div className="fs-section-label">Last {fsAudit.length} filesystem operations by agents</div>
              {fsAudit.length === 0 && (
                <div style={{color:'#475569',fontSize:11,padding:'10px 0'}}>No operations recorded yet.</div>
              )}
              <div className="fs-audit-list">
                {fsAudit.map((entry, i) => (
                  <div key={i} className={`fs-audit-row ${entry.status==='denied'?'denied':''}`}>
                    <span className={`fs-audit-op fs-op-${entry.op}`}>{entry.op.toUpperCase()}</span>
                    <span className={`fs-audit-status ${entry.status==='denied'?'denied':'allowed'}`}>
                      {entry.status==='denied'?'✕':'✓'}
                    </span>
                    <span className="fs-audit-path" title={entry.path}>{entry.path}</span>
                    {entry.detail && <span className="fs-audit-detail">{entry.detail}</span>}
                    <span className="fs-audit-time">{new Date(entry.ts*1000).toLocaleTimeString()}</span>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            /* ── Config tab ── */
            <div className="fs-body">

              {/* Output directory */}
              <div className="fs-section-label">Output Directory
                <span className="fs-section-note"> — reports are also saved here</span>
              </div>
              <div className="fs-output-row">
                <input className="topic-input" style={{flex:1,marginBottom:0}}
                  value={outputDirInput}
                  onChange={e => setOutputDirInput(e.target.value)}
                  placeholder="/Users/yourname/Documents/reports  (leave blank to disable)" />
                <button className="fs-apply-btn" onClick={handleSetOutputDir}>Apply</button>
              </div>
              {fsConfig.output_dir && (
                <div className="fs-active-path">✓ Active: {fsConfig.output_dir}</div>
              )}

              {/* Divider */}
              <div style={{height:1,background:'rgba(99,102,241,.12)',margin:'14px 0'}}/>

              {/* Add access entry */}
              <div className="fs-section-label">Folder Access Permissions
                <span className="fs-section-note"> — by default no access is granted</span>
              </div>

              <div className="fs-add-row">
                <input className="topic-input" style={{flex:1,marginBottom:0}}
                  value={newFsPath}
                  onChange={e => setNewFsPath(e.target.value)}
                  placeholder="/absolute/path/to/folder" />
                <input className="topic-input" style={{width:130,marginBottom:0}}
                  value={newFsLabel}
                  onChange={e => setNewFsLabel(e.target.value)}
                  placeholder="Label (optional)" />
              </div>

              <div className="fs-flags-row">
                {[['read','Read','Agents can read files',newFsRead,setNewFsRead],
                  ['write','Write','Agents can create new files',newFsWrite,setNewFsWrite],
                  ['edit','Edit','Agents can overwrite/append to files',newFsEdit,setNewFsEdit]
                ].map(([key,lbl,tip,val,setter]) => (
                  <label key={key} className="fs-flag-check" title={tip}>
                    <input type="checkbox" checked={val} onChange={e=>setter(e.target.checked)} />
                    <span className={`fs-flag-label fs-flag-${key}`}>{lbl}</span>
                  </label>
                ))}
                <button className="fs-apply-btn" onClick={handleAddFsAccess}
                  disabled={!newFsPath.trim()}>
                  + Add
                </button>
              </div>

              {fsError && <div className="fs-error">{fsError}</div>}

              {/* Access list */}
              {(fsConfig.access_list ?? []).length === 0 ? (
                <div style={{color:'#475569',fontSize:11,padding:'10px 0'}}>
                  No folders configured. Add a folder above to grant agents access.
                </div>
              ) : (
                <div className="fs-access-list">
                  {(fsConfig.access_list ?? []).map((entry, i) => (
                    <div key={i} className="fs-access-card">
                      <div className="fs-access-top">
                        <span className="fs-access-label">{entry.label}</span>
                        <button className="upload-delete-btn"
                          onClick={() => handleRemoveFsAccess(entry.path)}>✕</button>
                      </div>
                      <div className="fs-access-path" title={entry.path}>{entry.path}</div>
                      <div className="fs-access-flags">
                        {[['read','Read',entry.read],
                          ['write','Write',entry.write],
                          ['edit','Edit',entry.edit]
                        ].map(([flag,lbl,active]) => (
                          <button key={flag}
                            className={`fs-flag-toggle ${active?'active':''} fs-flag-${flag}`}
                            onClick={() => handleToggleFsFlag(entry.path, flag, active)}
                            title={active ? `Click to revoke ${lbl} access` : `Click to grant ${lbl} access`}>
                            {active ? '✓' : '○'} {lbl}
                          </button>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* Info box */}
              <div className="fs-info-box">
                <strong>🗂️ File System Agent</strong> is available in every job.
                Use it by including file/folder tasks in your query, e.g.:<br/>
                <em>"Read all .py files in /projects/myapp and summarise what each does"</em><br/>
                <em>"Write a summary report to /Users/me/Documents/output.md"</em>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── Agent Editor Overlay ───────────────────────────── */}
      {showAgentEditor && (
        <div className="overlay-panel agent-panel">
          <div className="overlay-header">
            <span>🤖 Agent Manager</span>
            <button className="overlay-close" onClick={() => setShowAgentEditor(false)}>✕</button>
          </div>

          {/* Spawn approval banners */}
          {pendingSpawns.map(req => (
            <div key={req.request_id} className="spawn-request-banner">
              <div className="spawn-banner-title">🔔 Agent Spawn Request</div>
              <div className="spawn-banner-role">{req.suggestion?.role || '?'}</div>
              <div className="spawn-banner-reason">{req.suggestion?.reason || req.suggestion?.goal}</div>
              <div className="spawn-banner-actions">
                <button className="spawn-approve-btn"
                  onClick={() => handleSpawnDecision(req.request_id, true)}>✓ Approve</button>
                <button className="spawn-reject-btn"
                  onClick={() => handleSpawnDecision(req.request_id, false)}>✕ Reject</button>
              </div>
            </div>
          ))}

          {/* Spawn toggle */}
          <div className="spawn-toggle-row">
            <div className="spawn-toggle-info">
              <span className="spawn-toggle-label">Agent Spawning</span>
              <span className="spawn-toggle-desc">
                {spawnEnabled
                  ? 'Agents can request creation of new agents (requires your approval)'
                  : 'Agents cannot request new agents — existing team handles all tasks'}
              </span>
            </div>
            <button
              className={`spawn-toggle-btn ${spawnEnabled ? 'on' : 'off'}`}
              onClick={handleToggleSpawn}
              disabled={spawnToggling}
              title={spawnEnabled ? 'Click to disable agent spawning' : 'Click to enable agent spawning'}
            >
              {spawnToggling ? '…' : spawnEnabled ? '● ON' : '○ OFF'}
            </button>
          </div>

          {/* Tabs */}
          <div className="agent-tabs">
            {['list','new','edit','skills'].filter(t => (t!=='edit'||editingAgent) && (t!=='skills'||skillsAgentId)).map(t => (
              <button key={t} className={`agent-tab ${agentTab===t?'active':''}`}
                onClick={() => setAgentTab(t)}>
                {t==='list'?`Agents (${agents.filter(a=>a.active!==false).length}/${agents.length})`:t==='new'?'+ New Agent':t==='skills'?`📄 SKILLS.md`:'✏️ Edit'}
              </button>
            ))}
          </div>

          {/* Agent list */}
          {agentTab === 'list' && (
            <div className="agent-list">
              {agents.map(a => {
                const isInactive = a.active === false
                return (
                <div key={a.id}
                  className={`agent-editor-card ${isInactive ? 'inactive' : ''}`}
                  style={{'--ac': isInactive ? '#94a3b8' : a.color}}>
                  <span className="agent-editor-icon" style={{opacity: isInactive ? 0.4 : 1}}>
                    {a.icon}
                  </span>
                  <div className="agent-editor-info">
                    <div style={{display:'flex',alignItems:'center',gap:6}}>
                      <span className="agent-editor-role" style={{opacity: isInactive ? 0.5 : 1}}>
                        {a.role}
                      </span>
                      {isInactive && <span className="agent-inactive-badge">INACTIVE</span>}
                      {a.builtin && !isInactive && <span className="agent-builtin-badge">BUILT-IN</span>}
                    </div>
                    <span className="agent-editor-goal">{a.goal?.slice(0,55)}…</span>
                    {a.skills_file && (
                      <span className="agent-skills-path">📄 agents/{a.id}/SKILLS.md</span>
                    )}
                  </div>
                  <div className="agent-editor-actions">
                    <button className="agent-skills-btn"
                      title="View / edit SKILLS.md"
                      onClick={() => handleOpenSkills(a)}>📄</button>
                    <button className="agent-edit-btn"
                      onClick={() => { setEditingAgent({...a}); setAgentTab('edit') }}>Edit</button>
                    <button
                      className={isInactive ? 'agent-activate-btn' : 'agent-deactivate-btn'}
                      title={isInactive ? 'Activate agent' : 'Deactivate agent'}
                      onClick={() => handleToggleActive(a)}>
                      {isInactive ? '▶' : '⏸'}
                    </button>
                    {!a.builtin && (
                      <button className="agent-delete-btn"
                        title="Permanently delete agent"
                        onClick={() => handleDeleteAgent(a.id)}>🗑</button>
                    )}
                  </div>
                </div>
                )
              })}
            </div>
          )}

          {/* New agent form */}
          {agentTab === 'new' && (
            <div className="agent-form">
              {[
                ['label','Display Label','e.g. CRITIC'],
                ['role','Role','e.g. Critical Reviewer'],
                ['goal','Goal (one sentence)','What this agent aims to accomplish'],
              ].map(([k,l,p]) => (
                <div className="form-group" key={k}>
                  <label>{l}</label>
                  <input value={newAgentForm[k]} placeholder={p}
                    onChange={e => setNewAgentForm(f=>({...f,[k]:e.target.value}))} />
                </div>
              ))}
              <div className="form-group">
                <label>Backstory</label>
                <textarea rows={3} value={newAgentForm.backstory}
                  placeholder="Describe the agent's background and personality…"
                  onChange={e => setNewAgentForm(f=>({...f,backstory:e.target.value}))} />
              </div>
              <div className="form-row">
                <div className="form-group">
                  <label>Icon</label>
                  <input value={newAgentForm.icon} maxLength={2}
                    onChange={e => setNewAgentForm(f=>({...f,icon:e.target.value}))} />
                </div>
                <div className="form-group">
                  <label>Colour</label>
                  <input type="color" value={newAgentForm.color}
                    onChange={e => setNewAgentForm(f=>({...f,color:e.target.value}))} />
                </div>
              </div>
              <button className="run-btn" onClick={handleCreateAgent}
                disabled={!newAgentForm.role.trim()}>
                ＋ Create Agent
              </button>
            </div>
          )}

          {/* SKILLS.md editor */}
          {agentTab === 'skills' && skillsAgentId && (
            <div className="agent-form">
              <div style={{display:'flex',alignItems:'center',gap:8,marginBottom:6}}>
                <span style={{fontSize:11,color:'var(--tx-muted)',fontFamily:'var(--mono)'}}>
                  agents/{skillsAgentId}/SKILLS.md
                </span>
                <span style={{fontSize:10,color:'var(--tx-hint)'}}>
                  — edit role, goal, backstory, tools, config
                </span>
              </div>
              <div className="form-group">
                <label>File Contents</label>
                <textarea
                  rows={18}
                  style={{fontFamily:'var(--mono)',fontSize:11,lineHeight:1.55,resize:'vertical'}}
                  value={skillsText}
                  onChange={e => setSkillsText(e.target.value)}
                  placeholder="Loading SKILLS.md…"
                />
              </div>
              <div style={{display:'flex',gap:8}}>
                <button className="run-btn" style={{flex:1}}
                  onClick={handleSaveSkills} disabled={skillsSaving}>
                  {skillsSaving ? '⟳ Saving…' : '💾 Save SKILLS.md'}
                </button>
                <button className="run-btn"
                  style={{flex:'0 0 80px',background:'rgba(30,41,59,0.8)'}}
                  onClick={() => { setAgentTab('list'); setSkillsAgentId(null) }}>
                  Back
                </button>
              </div>
              <div className="skills-hint">
                <strong>Format guide:</strong> Use <code>## Role</code>, <code>## Goal</code>,
                <code>## Backstory</code>, <code>## Tools</code> (comma-separated),
                <code>## Config</code> (<code>max_iter: 10</code>, <code>allow_delegation: false</code>).
                Changes take effect on the next job run.
              </div>
            </div>
          )}

                    {/* Edit agent form */}
          {agentTab === 'edit' && editingAgent && (
            <div className="agent-form">
              {[
                ['label','Display Label'],
                ['role','Role'],
                ['goal','Goal'],
              ].map(([k,l]) => (
                <div className="form-group" key={k}>
                  <label>{l}</label>
                  <input value={editingAgent[k]||''}
                    onChange={e => setEditingAgent(a=>({...a,[k]:e.target.value}))} />
                </div>
              ))}
              <div className="form-group">
                <label>Backstory</label>
                <textarea rows={4} value={editingAgent.backstory||''}
                  onChange={e => setEditingAgent(a=>({...a,backstory:e.target.value}))} />
              </div>
              <div className="form-row">
                <div className="form-group">
                  <label>Icon</label>
                  <input value={editingAgent.icon||'🤖'} maxLength={2}
                    onChange={e => setEditingAgent(a=>({...a,icon:e.target.value}))} />
                </div>
                <div className="form-group">
                  <label>Colour</label>
                  <input type="color" value={editingAgent.color||'#a78bfa'}
                    onChange={e => setEditingAgent(a=>({...a,color:e.target.value}))} />
                </div>
              </div>
              <div style={{display:'flex',gap:8}}>
                <button className="run-btn" style={{flex:1}} onClick={handleUpdateAgent}>
                  ✓ Save Changes
                </button>
                <button className="run-btn" style={{flex:1,background:'rgba(30,41,59,0.8)'}}
                  onClick={() => { setEditingAgent(null); setAgentTab('list') }}>
                  Cancel
                </button>
              </div>
            </div>
          )}
        </div>
      )}


      {/* ── Tools Panel ────────────────────────────────────── */}
      {showToolPanel && (
        <div className="overlay-panel agent-panel" style={{width:640}}>
          <div className="overlay-header">
            <span>🔧 Tool Manager</span>
            <button className="overlay-close" onClick={() => setShowToolPanel(false)}>✕</button>
          </div>

          {/* Tool spawn approval banners */}
          {pendingToolSpawns.map(req => (
            <div key={req.request_id} className="spawn-request-banner" style={{borderColor:'rgba(16,185,129,.35)',background:'rgba(16,185,129,.07)'}}>
              <div className="spawn-banner-title" style={{color:'#6ee7b7'}}>🔧 Tool Spawn Request</div>
              <div className="spawn-banner-role">{req.suggestion?.display_name || req.suggestion?.name || '?'}</div>
              <div className="spawn-banner-reason" style={{fontSize:11,color:'var(--tx-secondary)',marginBottom:6}}>{req.suggestion?.description}</div>
              {req.suggestion?.reason && (
                <div style={{fontSize:10,color:'var(--tx-muted)',marginBottom:8,fontStyle:'italic'}}>
                  Reason: {req.suggestion.reason}
                </div>
              )}
              <div className="spawn-banner-actions">
                <button className="spawn-approve-btn" onClick={() => handleToolSpawnDecision(req.request_id, true)}>✓ Approve</button>
                <button className="spawn-reject-btn" onClick={() => handleToolSpawnDecision(req.request_id, false)}>✕ Reject</button>
              </div>
            </div>
          ))}

          {/* Tabs */}
          <div className="agent-tabs">
            {['list','new','edit','toolmd'].filter(t=>(t!=='edit'||editingTool)&&(t!=='toolmd'||toolMdId)).map(t => (
              <button key={t} className={`agent-tab ${toolTab===t?'active':''}`}
                onClick={() => setToolTab(t)}>
                {t==='list'?`Tools (${tools.filter(x=>x.active!==false).length}/${tools.length})`:
                 t==='new'?'+ New Tool':
                 t==='toolmd'?'📄 TOOL.md':'✏️ Edit'}
              </button>
            ))}
          </div>

          {/* Tool list */}
          {toolTab === 'list' && (
            <div className="agent-list" style={{maxHeight:480,overflowY:'auto'}}>
              {/* Builtin tools */}
              <div className="tool-section-label">Built-in Tools</div>
              {tools.filter(t=>t.builtin).map(t => (
                <div key={t.id} className="tool-card tool-card-builtin">
                  <div className="tool-card-icon">🔩</div>
                  <div className="tool-card-info">
                    <div className="tool-card-name">{t.display_name || t.name}</div>
                    <div className="tool-card-id">{t.name}</div>
                    <div className="tool-card-desc">{t.description?.slice(0,80)}…</div>
                  </div>
                  <div style={{display:'flex',flexWrap:'wrap',gap:3,alignItems:'flex-start'}}>
                    {(t.tags||[]).map(tag => (
                      <span key={tag} className="tool-tag">{tag}</span>
                    ))}
                  </div>
                </div>
              ))}
              {/* Custom tools */}
              {tools.filter(t=>!t.builtin).length > 0 && (
                <>
                  <div className="tool-section-label" style={{marginTop:10}}>Custom Tools</div>
                  {tools.filter(t=>!t.builtin).map(t => {
                    const isInactive = t.active === false
                    return (
                      <div key={t.id} className={`tool-card ${isInactive?'tool-card-inactive':''}`}>
                        <div className="tool-card-icon" style={{opacity:isInactive?.4:1}}>🔧</div>
                        <div className="tool-card-info">
                          <div style={{display:'flex',alignItems:'center',gap:6}}>
                            <div className="tool-card-name">{t.display_name || t.name}</div>
                            {isInactive && <span className="agent-inactive-badge">INACTIVE</span>}
                          </div>
                          <div className="tool-card-id">{t.name}</div>
                          <div className="tool-card-desc">{t.description?.slice(0,72)}…</div>
                          <div className="tool-file-path">📄 tools/{t.id}/TOOL.md</div>
                        </div>
                        <div className="agent-editor-actions" style={{flexDirection:'column',gap:4}}>
                          <button className="agent-skills-btn"
                            onClick={() => handleOpenToolMd(t)}>📄</button>
                          <button className="agent-edit-btn"
                            onClick={() => { setEditingTool({...t, tags: (t.tags||[]).join(', ')}); setToolTab('edit') }}>Edit</button>
                          <button className={isInactive?'agent-activate-btn':'agent-deactivate-btn'}
                            onClick={() => handleToggleToolActive(t)}>
                            {isInactive?'▶':'⏸'}
                          </button>
                          <button className="agent-delete-btn"
                            onClick={() => handleDeleteTool(t.id)}>🗑</button>
                        </div>
                      </div>
                    )
                  })}
                </>
              )}
            </div>
          )}

          {/* New tool form */}
          {toolTab === 'new' && (
            <div className="agent-form">
              <div className="form-group">
                <label>Tool Name (snake_case)</label>
                <input value={newToolForm.name} placeholder="e.g. sentiment_analyser"
                  onChange={e => setNewToolForm(f=>({...f, name: e.target.value.replace(/[^a-z0-9_]/g,'')}))} />
              </div>
              <div className="form-group">
                <label>Display Name</label>
                <input value={newToolForm.display_name} placeholder="e.g. Sentiment Analyser"
                  onChange={e => setNewToolForm(f=>({...f, display_name: e.target.value}))} />
              </div>
              <div className="form-group">
                <label>Description (shown to the LLM)</label>
                <input value={newToolForm.description} placeholder="Analyse text sentiment and return score…"
                  onChange={e => setNewToolForm(f=>({...f, description: e.target.value}))} />
              </div>
              <div className="form-group">
                <label>Tags (comma-separated)</label>
                <input value={newToolForm.tags} placeholder="analysis, nlp"
                  onChange={e => setNewToolForm(f=>({...f, tags: e.target.value}))} />
              </div>
              <div className="form-group">
                <label>Python Code — body of _run(self, input_data: str) → str</label>
                <textarea rows={8}
                  style={{fontFamily:'var(--mono)',fontSize:11,lineHeight:1.55,resize:'vertical'}}
                  value={newToolForm.code}
                  onChange={e => setNewToolForm(f=>({...f, code: e.target.value}))}
                  placeholder={"    # input_data is always a string\n    return f'Processed: {input_data}'"} />
              </div>
              <div className="skills-hint">
                <strong>Code guide:</strong> Write the function body only — <code>self</code> and <code>input_data: str</code> are provided.
                Must return a <code>str</code>. Import standard library modules at the top of the body.
                The tool is available to agents immediately on the next job after approval.
              </div>
              <button className="run-btn" onClick={handleCreateTool}
                disabled={!newToolForm.name.trim()}>
                ＋ Create Tool
              </button>
            </div>
          )}

          {/* Edit tool form */}
          {toolTab === 'edit' && editingTool && (
            <div className="agent-form">
              {[['display_name','Display Name'],['description','Description']].map(([k,l]) => (
                <div className="form-group" key={k}>
                  <label>{l}</label>
                  <input value={editingTool[k]||''} onChange={e => setEditingTool(a=>({...a,[k]:e.target.value}))} />
                </div>
              ))}
              <div className="form-group">
                <label>Tags (comma-separated)</label>
                <input value={typeof editingTool.tags==='string'?editingTool.tags:(editingTool.tags||[]).join(', ')}
                  onChange={e => setEditingTool(a=>({...a, tags: e.target.value}))} />
              </div>
              <div className="form-group">
                <label>Python Code</label>
                <textarea rows={8}
                  style={{fontFamily:'var(--mono)',fontSize:11,lineHeight:1.55,resize:'vertical'}}
                  value={editingTool.code||''} onChange={e => setEditingTool(a=>({...a, code: e.target.value}))} />
              </div>
              <div style={{display:'flex',gap:8}}>
                <button className="run-btn" style={{flex:1}} onClick={handleUpdateTool}>✓ Save</button>
                <button className="run-btn" style={{flex:'0 0 80px',background:'rgba(30,41,59,.8)'}}
                  onClick={() => { setEditingTool(null); setToolTab('list') }}>Cancel</button>
              </div>
            </div>
          )}

          {/* TOOL.md editor */}
          {toolTab === 'toolmd' && toolMdId && (
            <div className="agent-form">
              <div style={{fontSize:11,color:'var(--tx-muted)',fontFamily:'var(--mono)',marginBottom:6}}>
                tools/{toolMdId}/TOOL.md
              </div>
              <div className="form-group">
                <label>File Contents</label>
                <textarea rows={18}
                  style={{fontFamily:'var(--mono)',fontSize:11,lineHeight:1.55,resize:'vertical'}}
                  value={toolMdText} onChange={e => setToolMdText(e.target.value)} />
              </div>
              <div style={{display:'flex',gap:8}}>
                <button className="run-btn" style={{flex:1}} onClick={handleSaveToolMd} disabled={toolMdSaving}>
                  {toolMdSaving?'⟳ Saving…':'💾 Save TOOL.md'}
                </button>
                <button className="run-btn" style={{flex:'0 0 80px',background:'rgba(30,41,59,.8)'}}
                  onClick={() => { setToolTab('list'); setToolMdId(null) }}>Back</button>
              </div>
              <div className="skills-hint">
                Edit <code>## Code</code> to change tool behaviour, <code>## Description</code> to update
                what the LLM sees, and <code>## Tags</code> for categorisation.
                Changes take effect on the next job run.
              </div>
            </div>
          )}
        </div>
      )}


      {/* ── Settings Panel (Telegram + Self-Improver) ─────── */}
      {showSettings && (
        <div className="overlay-panel settings-panel">
          <div className="overlay-header">
            <span>⚙️ Settings</span>
            <button className="overlay-close" onClick={() => setShowSettings(false)}>✕</button>
          </div>

          {/* Tabs */}
          <div className="agent-tabs">
            {[
              ['websearch', '🌐 Web Search'],
              ['telegram',  '📱 Telegram'],
              ['improver',  '🔄 Self-Improver'],
              ['practices', '📋 Best Practices'],
            ].map(([id, label]) => (
              <button key={id} className={`agent-tab ${settingsTab===id?'active':''}`}
                onClick={() => {
                  setSettingsTab(id)
                  if (id==='practices') { fetchBestPractices(); fetchProposals() }
                  if (id==='websearch') { fetchWsConfig(); setWsTestResult(null) }
                }}>
                {label}
              </button>
            ))}
          </div>

          {/* ── Web Search Tab ──────────────────────────── */}
          {settingsTab === 'websearch' && (
            <div className="agent-form">
              <div className="settings-section-desc">
                Enable real-time web search so agents can retrieve live data —
                today's date, weather, news, exchange rates, Wikipedia lookups, and more.
                Uses zero-API-key providers. Install DuckDuckGo for general search:
                <code style={{display:'block',marginTop:6,padding:'4px 8px',
                  background:'rgba(15,23,42,.6)',borderRadius:4,fontFamily:'var(--mono)'}}>
                  pip install duckduckgo-search
                </code>
              </div>

              {/* Enable toggle */}
              <div style={{display:'flex',alignItems:'center',gap:10,marginBottom:16,
                padding:'10px 14px',background:'rgba(99,102,241,.06)',
                border:'1px solid rgba(99,102,241,.2)',borderRadius:8}}>
                <label className="settings-toggle-label" style={{flex:1,fontWeight:600,fontSize:13}}>
                  <input type="checkbox" checked={!!wsConfig.enabled}
                    onChange={e => setWsConfig(c=>({...c,enabled:e.target.checked}))}
                    style={{marginRight:8,transform:'scale(1.2)'}}/>
                  Enable Real-Time Web Search
                </label>
                <span style={{fontSize:12,fontWeight:700,color:wsConfig.enabled?'#34d399':'#64748b'}}>
                  {wsConfig.enabled ? '● LIVE' : '○ MOCK'}
                </span>
              </div>

              {/* Provider */}
              <div className="form-group">
                <label>Search Provider</label>
                <select value={wsConfig.provider}
                  onChange={e => setWsConfig(c=>({...c,provider:e.target.value}))}
                  style={{background:'rgba(30,41,59,.8)',border:'1px solid var(--bd-mid)',
                    borderRadius:6,padding:'8px 10px',color:'var(--tx-primary)',
                    fontSize:12,width:'100%'}}>
                  <option value="auto">Auto-detect (recommended)</option>
                  <option value="duckduckgo">DuckDuckGo only</option>
                  <option value="wikipedia">Wikipedia only</option>
                  <option value="mock">Mock (offline testing)</option>
                </select>
                <div style={{fontSize:10,color:'var(--tx-muted)',marginTop:4}}>
                  Auto: weather → wttr.in · time → WorldTimeAPI · currency → ExchangeRate-API · general → DuckDuckGo
                </div>
              </div>

              <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:10}}>
                <div className="form-group">
                  <label>Max results</label>
                  <input type="number" min="1" max="10" value={wsConfig.max_results}
                    onChange={e => setWsConfig(c=>({...c,max_results:parseInt(e.target.value)||5}))}/>
                </div>
                <div className="form-group">
                  <label>Timeout (seconds)</label>
                  <input type="number" min="3" max="30" value={wsConfig.timeout_seconds}
                    onChange={e => setWsConfig(c=>({...c,timeout_seconds:parseInt(e.target.value)||10}))}/>
                </div>
              </div>

              <div style={{display:'flex',flexWrap:'wrap',gap:16,marginBottom:14}}>
                {[
                  ['safe_search',      'Safe search'],
                  ['fallback_to_mock', 'Fall back to mock if search fails'],
                ].map(([key, label]) => (
                  <label key={key} className="settings-toggle-label">
                    <input type="checkbox" checked={!!wsConfig[key]}
                      onChange={e => setWsConfig(c=>({...c,[key]:e.target.checked}))}
                      style={{marginRight:6}}/>
                    {label}
                  </label>
                ))}
              </div>

              <div style={{display:'flex',gap:8,marginBottom:14}}>
                <button className="run-btn" style={{flex:1}} onClick={handleSaveWsConfig} disabled={wsSaving}>
                  {wsSaving ? '⟳ Saving…' : '💾 Save Config'}
                </button>
                <button className="run-btn"
                  style={{flex:'0 0 140px',background:'rgba(99,102,241,.15)',
                    border:'1px solid rgba(99,102,241,.3)',color:'#a5b4fc'}}
                  onClick={handleTestWsProviders} disabled={wsTesting}>
                  {wsTesting ? '⟳ Testing…' : '🔬 Test All Providers'}
                </button>
              </div>

              {/* Live query tester */}
              <div style={{borderTop:'1px solid var(--bd-subtle)',paddingTop:14}}>
                <div className="settings-cmd-title" style={{marginBottom:8}}>Live Query Tester</div>
                <div style={{display:'flex',gap:8}}>
                  <input value={wsTestQuery}
                    onChange={e => setWsTestQuery(e.target.value)}
                    onKeyDown={e => e.key==='Enter' && handleRunWsQuery()}
                    placeholder="weather in Mumbai  |  USD to INR  |  today's date"
                    style={{flex:1}}/>
                  <button className="run-btn"
                    style={{flex:'0 0 80px',padding:'8px 10px',fontSize:12}}
                    onClick={handleRunWsQuery} disabled={wsTesting}>
                    Search
                  </button>
                </div>
                {!wsConfig.enabled && (
                  <div style={{fontSize:10,color:'#f59e0b',marginTop:4}}>
                    ⚠️ Enable real-time search above then save before testing
                  </div>
                )}
              </div>

              {/* Results */}
              {wsTestResult && (
                <div style={{
                  marginTop:12,padding:'10px 12px',
                  background:'rgba(15,23,42,.7)',
                  border:'1px solid var(--bd-mid)',
                  borderRadius:7,
                }}>
                  <pre style={{
                    fontFamily:'var(--mono)',fontSize:10.5,
                    color:'var(--tx-secondary)',lineHeight:1.6,
                    whiteSpace:'pre-wrap',wordBreak:'break-word',margin:0,
                    maxHeight:220,overflowY:'auto',
                  }}>{wsTestResult}</pre>
                </div>
              )}

              {/* Provider reference */}
              <div className="settings-cmd-ref" style={{marginTop:14}}>
                <div className="settings-cmd-title">Providers & Query Examples (click to try)</div>
                {[
                  ['weather in Tokyo',          'wttr.in — no key — worldwide weather'],
                  ['current time in IST',        'WorldTimeAPI — no key — any timezone'],
                  ['USD to INR exchange rate',   'ExchangeRate-API — no key — 150+ currencies'],
                  ['who is Ada Lovelace',        'Wikipedia REST — no key — factual lookups'],
                  ['latest Python news',         'DuckDuckGo — pip install duckduckgo-search'],
                  ['today date',                 'WorldTimeAPI — current date and day'],
                ].map(([ex, desc]) => (
                  <div key={ex} className="settings-cmd-row"
                    style={{cursor:'pointer'}}
                    onClick={() => setWsTestQuery(ex)}>
                    <code style={{color:'#a5b4fc',minWidth:200}}>{ex}</code>
                    <span>{desc}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ── Telegram Tab ────────────────────────────── */}
          {settingsTab === 'telegram' && (
            <div className="agent-form">
              <div className="settings-section-desc">
                Connect to a Telegram bot to run jobs, check status, and receive
                reports — all from your phone.
              </div>

              <div className="settings-setup-steps">
                <div className="settings-step">
                  <span className="settings-step-num">1</span>
                  <span>Open Telegram → search <strong>@BotFather</strong> → send <code>/newbot</code></span>
                </div>
                <div className="settings-step">
                  <span className="settings-step-num">2</span>
                  <span>Copy the <strong>Bot Token</strong> and paste below</span>
                </div>
                <div className="settings-step">
                  <span className="settings-step-num">3</span>
                  <span>Message <strong>@userinfobot</strong> to get your Chat ID</span>
                </div>
                <div className="settings-step">
                  <span className="settings-step-num">4</span>
                  <span>Run: <code>pip install "python-telegram-bot==20.7"</code></span>
                </div>
              </div>

              <div className="form-group">
                <label>Bot Token {tgBotSet && <span className="tg-token-set">✓ token saved</span>}</label>
                <input type="password" value={tgConfig.bot_token}
                  onChange={e => setTgConfig(c=>({...c, bot_token:e.target.value}))}
                  placeholder={tgBotSet ? '••••••••••••• (leave blank to keep existing)' : '1234567890:AAF…'}/>
              </div>
              <div className="form-group">
                <label>Allowed Chat IDs <span style={{fontWeight:400,color:'var(--tx-muted)'}}>— comma-separated, leave blank to allow all</span></label>
                <input value={tgConfig.allowed_chat_ids}
                  onChange={e => setTgConfig(c=>({...c, allowed_chat_ids:e.target.value}))}
                  placeholder="123456789, 987654321"/>
              </div>
              <div className="form-group">
                <label>Notify Chat ID <span style={{fontWeight:400,color:'var(--tx-muted)'}}>— where job results are pushed automatically</span></label>
                <input value={tgConfig.notify_chat_id}
                  onChange={e => setTgConfig(c=>({...c, notify_chat_id:e.target.value}))}
                  placeholder="123456789"/>
              </div>
              <div style={{display:'flex',alignItems:'center',gap:10,marginBottom:14}}>
                <label className="settings-toggle-label">
                  <input type="checkbox" checked={!!tgConfig.enabled}
                    onChange={e => setTgConfig(c=>({...c, enabled:e.target.checked}))}
                    style={{marginRight:6}}/>
                  Enable Telegram bot
                </label>
              </div>
              {tgTestResult && (
                <div className={`tg-test-result ${tgTestResult.startsWith('✅')?'ok':'err'}`}>
                  {tgTestResult}
                </div>
              )}
              <div style={{display:'flex',gap:8}}>
                <button className="run-btn" style={{flex:1}} onClick={handleSaveTelegram} disabled={tgSaving}>
                  {tgSaving?'⟳ Saving…':'💾 Save & Apply'}
                </button>
                <button className="run-btn" style={{flex:'0 0 100px', background:'rgba(16,185,129,.15)', border:'1px solid rgba(16,185,129,.35)', color:'#6ee7b7'}}
                  onClick={handleTestTelegram} disabled={tgTesting || !tgBotSet}>
                  {tgTesting?'⟳':'📱 Test'}
                </button>
              </div>

              <div className="settings-cmd-ref">
                <div className="settings-cmd-title">Available Bot Commands</div>
                {[
                  ['/run <topic>',      'Start a full research pipeline'],
                  ['/query <question>', 'Quick query or maths expression'],
                  ['/file <name> <q>',  'Analyse an uploaded file'],
                  ['/status',           'Check current job status'],
                  ['/agents',           'List all active agents'],
                  ['/tools',            'List all active tools'],
                  ['/model [name]',     'Show or switch active model'],
                  ['/report',           'Resend last report as file'],
                  ['/help',             'Show all commands'],
                ].map(([cmd, desc]) => (
                  <div key={cmd} className="settings-cmd-row">
                    <code>{cmd}</code>
                    <span>{desc}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ── Self-Improver Tab ────────────────────────── */}
          {settingsTab === 'improver' && (
            <div className="agent-form">
              <div className="settings-section-desc">
                Runs on a schedule — reads all agent SKILLS.md and tool definitions,
                reviews recent job activity, and uses the LLM to update
                <code>BEST_PRACTICES.md</code> and optionally auto-improve agent/tool descriptions.
              </div>

              <div style={{display:'flex',alignItems:'center',gap:10,marginBottom:14}}>
                <label className="settings-toggle-label">
                  <input type="checkbox" checked={!!siConfig.enabled}
                    onChange={e => setSiConfig(c=>({...c,enabled:e.target.checked}))}
                    style={{marginRight:6}}/>
                  Enable self-improvement scheduler
                </label>
              </div>

              <div className="form-group">
                <label>Run every (hours)</label>
                <input type="number" min="1" max="168" value={siConfig.interval_hours}
                  onChange={e => setSiConfig(c=>({...c,interval_hours:parseInt(e.target.value)||6}))}
                  style={{width:80}}/>
              </div>
              <div className="form-group">
                <label>Min confidence to auto-apply (0–1)</label>
                <input type="number" min="0" max="1" step="0.05" value={siConfig.min_confidence}
                  onChange={e => setSiConfig(c=>({...c,min_confidence:parseFloat(e.target.value)||0.7}))}
                  style={{width:80}}/>
              </div>
              <div className="form-group">
                <label>Model override <span style={{fontWeight:400,color:'var(--tx-muted)'}}>— blank = use active model</span></label>
                <input value={siConfig.model_override||''}
                  onChange={e => setSiConfig(c=>({...c,model_override:e.target.value}))}
                  placeholder="e.g. llama3.2:3b"/>
              </div>
              <div style={{display:'flex',flexDirection:'column',gap:8,marginBottom:14}}>
                {[
                  ['auto_apply_safe',   'Auto-apply safe changes (description/goal updates)'],
                  ['notify_telegram',   'Send Telegram notification after each cycle'],
                ].map(([key, label]) => (
                  <label key={key} className="settings-toggle-label">
                    <input type="checkbox" checked={!!siConfig[key]}
                      onChange={e => setSiConfig(c=>({...c,[key]:e.target.checked}))}
                      style={{marginRight:6}}/>
                    {label}
                  </label>
                ))}
              </div>

              <div style={{display:'flex',gap:8}}>
                <button className="run-btn" style={{flex:1}} onClick={handleSaveSiConfig} disabled={siSaving}>
                  {siSaving?'⟳ Saving…':'💾 Save Config'}
                </button>
                <button className="run-btn" style={{flex:'0 0 120px', background:'rgba(99,102,241,.15)', border:'1px solid rgba(99,102,241,.35)', color:'#a5b4fc'}}
                  onClick={handleRunImprover} disabled={siRunning}>
                  {siRunning?'⟳ Running…':'🔄 Run Now'}
                </button>
              </div>

              <div className="settings-cmd-ref" style={{marginTop:14}}>
                <div className="settings-cmd-title">Output Files (backend/)</div>
                {[
                  ['BEST_PRACTICES.md',      'Auto-updated best practices for this system'],
                  ['IMPROVEMENT_PROPOSALS.md','Structural suggestions needing human review'],
                  ['IMPROVEMENT_LOG.md',      'Log of every cycle and change applied'],
                  ['activity_log.jsonl',      'Rolling log of all job activity'],
                ].map(([f, d]) => (
                  <div key={f} className="settings-cmd-row">
                    <code>{f}</code><span>{d}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ── Best Practices Tab ───────────────────────── */}
          {settingsTab === 'practices' && (
            <div style={{display:'flex',flexDirection:'column',gap:10,padding:'0 2px'}}>
              <div className="settings-section-desc">
                Auto-maintained by the self-improver. View improvement proposals and the change log below.
              </div>

              <div className="form-group">
                <label style={{display:'flex',justifyContent:'space-between'}}>
                  <span>📋 BEST_PRACTICES.md</span>
                  <button className="feed-clear-btn" onClick={fetchBestPractices}>↻ Refresh</button>
                </label>
                <textarea rows={10} readOnly value={bestPractices || '(Not yet generated — run the self-improver first)'}
                  style={{fontFamily:'var(--mono)',fontSize:10.5,lineHeight:1.55,resize:'vertical',
                    background:'rgba(15,23,42,.6)',border:'1px solid var(--bd-subtle)',
                    borderRadius:6,padding:10,color:'var(--tx-secondary)',width:'100%'}}/>
              </div>

              {proposals && (
                <div className="form-group">
                  <label>📄 IMPROVEMENT_PROPOSALS.md</label>
                  <textarea rows={6} readOnly value={proposals}
                    style={{fontFamily:'var(--mono)',fontSize:10,lineHeight:1.5,resize:'vertical',
                      background:'rgba(15,23,42,.6)',border:'1px solid var(--bd-subtle)',
                      borderRadius:6,padding:10,color:'var(--tx-secondary)',width:'100%'}}/>
                </div>
              )}

              {improvLog && (
                <div className="form-group">
                  <label>🗒️ IMPROVEMENT_LOG.md <span style={{fontWeight:400,color:'var(--tx-muted)'}}>— last 20 cycles</span></label>
                  <textarea rows={5} readOnly
                    value={improvLog.split('\n').slice(-40).join('\n')}
                    style={{fontFamily:'var(--mono)',fontSize:10,lineHeight:1.5,resize:'vertical',
                      background:'rgba(15,23,42,.6)',border:'1px solid var(--bd-subtle)',
                      borderRadius:6,padding:10,color:'var(--tx-secondary)',width:'100%'}}/>
                </div>
              )}
            </div>
          )}
        </div>
      )}


      {/* ── Knowledge Base Panel ──────────────────────────── */}
      {showKbPanel && (
        <div className="overlay-panel kb-panel">
          <div className="overlay-header">
            <span>📚 Knowledge Base · {kbEntries.count} chunks · {kbEntries.sources?.length || 0} sources</span>
            <button className="overlay-close" onClick={() => setShowKbPanel(false)}>✕</button>
          </div>

          {/* Tabs */}
          <div className="agent-tabs">
            {[['browse','🗂 Browse'],['add','➕ Add Documents'],['search','🔍 Test Search'],['query','🤖 RAG Query'],['config','⚙️ Config']].map(([id,label]) => (
              <button key={id} className={`agent-tab ${kbTab===id?'active':''}`}
                onClick={() => setKbTab(id)}>
                {label}
              </button>
            ))}
          </div>

          {/* ── Browse Tab ────────────────────────── */}
          {kbTab === 'browse' && (
            <div style={{flex:1,overflowY:'auto',padding:'4px 2px'}}>
              {(!kbEntries.sources || kbEntries.sources.length === 0) ? (
                <div className="feed-empty" style={{marginTop:24}}>
                  No documents in the knowledge base yet.<br/>
                  Add documents via the ➕ Add Documents tab.
                </div>
              ) : (
                <>
                  <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:8}}>
                    <div style={{fontSize:11,color:'var(--tx-muted)'}}>
                      {kbEntries.sources.length} source{kbEntries.sources.length!==1?'s':''} · {kbEntries.count} total chunks
                    </div>
                    <button onClick={handleClearKb}
                      style={{fontSize:10,padding:'3px 10px',background:'rgba(248,113,113,.12)',
                        border:'1px solid rgba(248,113,113,.3)',color:'#fca5a5',
                        borderRadius:5,cursor:'pointer'}}>
                      🗑 Clear All
                    </button>
                  </div>
                  {kbEntries.sources.map(s => (
                    <div key={s.source} className="kb-source-card">
                      <div className="kb-source-icon">📄</div>
                      <div className="kb-source-info">
                        <div className="kb-source-name">{s.source}</div>
                        <div className="kb-source-meta">
                          {s.chunks} chunk{s.chunks!==1?'s':''}
                          {s.tags?.length > 0 && (
                            <span style={{marginLeft:8}}>
                              {s.tags.map(t=><span key={t} className="tool-tag" style={{marginRight:3}}>{t}</span>)}
                            </span>
                          )}
                        </div>
                      </div>
                      <button onClick={() => handleDeleteKbSource(s.source)}
                        style={{fontSize:11,padding:'3px 8px',background:'rgba(248,113,113,.1)',
                          border:'1px solid rgba(248,113,113,.25)',color:'#fca5a5',
                          borderRadius:5,cursor:'pointer',flexShrink:0}}>
                        Remove
                      </button>
                    </div>
                  ))}
                </>
              )}
            </div>
          )}

          {/* ── Add Documents Tab ─────────────────── */}
          {kbTab === 'add' && (
            <div className="agent-form" style={{gap:16}}>
              {/* Upload files */}
              <div>
                <div className="settings-cmd-title" style={{marginBottom:8}}>Upload Files</div>
                <div className="kb-upload-zone" onClick={() => kbFileRef.current?.click()}>
                  <span style={{fontSize:24}}>📂</span>
                  <span style={{fontSize:13,color:'var(--tx-secondary)'}}>
                    {kbUploading ? '⟳ Ingesting…' : 'Click to select files'}
                  </span>
                  <span style={{fontSize:11,color:'var(--tx-muted)'}}>
                    PDF, DOCX, TXT, MD, CSV, JSON, HTML, LOG
                  </span>
                </div>
                <input ref={kbFileRef} type="file" multiple style={{display:'none'}}
                  accept=".pdf,.docx,.txt,.md,.csv,.json,.html,.log,.yaml,.yml"
                  onChange={handleKbFileUpload} disabled={kbUploading}/>
                <div className="form-group" style={{marginTop:8}}>
                  <label>Tags for this upload (comma-separated, optional)</label>
                  <input value={kbPasteTags} onChange={e => setKbPasteTags(e.target.value)}
                    placeholder="e.g. policy, 2024, internal"/>
                </div>
              </div>

              <div style={{borderTop:'1px solid var(--bd-subtle)',paddingTop:14}}>
                <div className="settings-cmd-title" style={{marginBottom:8}}>Paste Text Directly</div>
                <div className="form-group">
                  <label>Source Name</label>
                  <input value={kbPasteName} onChange={e => setKbPasteName(e.target.value)}
                    placeholder="e.g. company-policy-2024"/>
                </div>
                <div className="form-group">
                  <label>Text Content</label>
                  <textarea rows={7} value={kbPasteText}
                    onChange={e => setKbPasteText(e.target.value)}
                    placeholder="Paste any text here — it will be chunked and indexed…"
                    style={{fontFamily:'var(--mono)',fontSize:11,lineHeight:1.5,resize:'vertical'}}/>
                </div>
                <button className="run-btn" onClick={handleKbPasteIngest}
                  disabled={kbUploading || !kbPasteText.trim() || !kbPasteName.trim()}>
                  {kbUploading ? '⟳ Ingesting…' : '📥 Ingest Text'}
                </button>
              </div>

              <div className="settings-cmd-ref">
                <div className="settings-cmd-title">Supported Formats</div>
                {[
                  ['.txt / .md / .log', 'Plain text — full content indexed'],
                  ['.pdf',              'Text layer extracted (not scanned images)'],
                  ['.docx',            'Paragraph text extracted'],
                  ['.csv',             'Rows indexed as text'],
                  ['.json',            'Formatted and indexed'],
                  ['.html',            'Tags stripped, text indexed'],
                ].map(([f,d]) => (
                  <div key={f} className="settings-cmd-row">
                    <code>{f}</code><span>{d}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ── Test Search Tab ───────────────────── */}
          {kbTab === 'search' && (
            <div className="agent-form">
              <div className="settings-section-desc">
                Test what the agents will find when they call <code>knowledge_base_search</code>.
              </div>
              <div style={{display:'flex',gap:8,marginBottom:12}}>
                <input value={kbSearchQ} onChange={e => setKbSearchQ(e.target.value)}
                  onKeyDown={e => e.key==='Enter' && handleKbSearch()}
                  placeholder="Ask a question about your documents…"
                  style={{flex:1}}/>
                <button className="run-btn" style={{flex:'0 0 90px',padding:'8px 10px'}}
                  onClick={handleKbSearch} disabled={kbSearching || !kbSearchQ.trim()}>
                  {kbSearching ? '⟳' : '🔍 Search'}
                </button>
              </div>
              {kbSearchResult && (
                <div style={{background:'rgba(15,23,42,.6)',border:'1px solid var(--bd-mid)',
                  borderRadius:7,padding:'10px 12px',maxHeight:360,overflowY:'auto'}}>
                  <pre style={{fontFamily:'var(--mono)',fontSize:10.5,color:'var(--tx-secondary)',
                    lineHeight:1.6,whiteSpace:'pre-wrap',wordBreak:'break-word',margin:0}}>
                    {kbSearchResult}
                  </pre>
                </div>
              )}
            </div>
          )}

        {/* ── RAG Query Tab ─────────────────── */}
        {kbTab === 'query' && (
          <div className="agent-form" style={{gap:16}}>
            <div className="settings-section-desc">
              Query your documents directly — answer generated strictly from the knowledge base, no agents, no web search.
            </div>

            <div className="form-group">
              <label>Your question</label>
              <textarea
                rows={3}
                value={ragQuery}
                onChange={e => setRagQuery(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && e.metaKey && handleRagQuery()}
                placeholder="Ask something about your documents…"
                style={{fontFamily:'var(--mono)',fontSize:12,lineHeight:1.5,resize:'vertical'}}
              />
            </div>

            <div style={{display:'flex',gap:8,alignItems:'center'}}>
              <label style={{fontSize:12,color:'var(--tx-secondary)',whiteSpace:'nowrap'}}>Top-K chunks</label>
              <input
                type="number" min={1} max={10}
                value={ragTopK}
                onChange={e => setRagTopK(Number(e.target.value))}
                style={{width:60}}
              />
              <button
                className="run-btn"
                style={{marginLeft:'auto',padding:'8px 18px'}}
                onClick={handleRagQuery}
                disabled={ragLoading || !ragQuery.trim()}>
                {ragLoading ? '⟳ Querying…' : '🔍 Query RAG'}
              </button>
            </div>

            {ragResult && (
              <>
                {/* Answer block */}
                <div style={{background:'rgba(99,102,241,.08)',border:'1px solid rgba(99,102,241,.25)',
                  borderRadius:8,padding:'12px 14px'}}>
                  <div style={{fontSize:11,fontWeight:600,color:'#a5b4fc',marginBottom:8,textTransform:'uppercase',letterSpacing:'.5px'}}>
                    Answer
                  </div>
                  <div style={{fontSize:13,color:'var(--tx-primary)',lineHeight:1.7,whiteSpace:'pre-wrap'}}>
                    {ragResult.answer}
                  </div>
                  <div style={{fontSize:10,color:'var(--tx-muted)',marginTop:8}}>
                    {ragResult.duration_ms}ms · {ragResult.chunks?.length || 0} chunk{ragResult.chunks?.length !== 1 ? 's' : ''} used · model: {ragResult.model}
                  </div>
                </div>

                {/* Source chunks */}
                {ragResult.chunks?.length > 0 && (
                  <div>
                    <div style={{fontSize:11,fontWeight:600,color:'var(--tx-secondary)',marginBottom:6,textTransform:'uppercase',letterSpacing:'.5px'}}>
                      Source chunks
                    </div>
                    {ragResult.chunks.map((c, i) => (
                      <div key={i} style={{background:'rgba(15,23,42,.5)',border:'1px solid var(--bd-subtle)',
                        borderRadius:6,padding:'8px 10px',marginBottom:6}}>
                        <div style={{fontSize:10,color:'#6ee7b7',marginBottom:4}}>
                          📄 {c.source} · chunk {c.chunk_index} · {Math.round(c.score * 100)}% match
                        </div>
                        <pre style={{fontFamily:'var(--mono)',fontSize:10.5,color:'var(--tx-secondary)',
                          lineHeight:1.6,whiteSpace:'pre-wrap',wordBreak:'break-word',margin:0}}>
                          {c.text}
                        </pre>
                      </div>
                    ))}
                  </div>
                )}

                {ragResult.chunks?.length === 0 && (
                  <div style={{fontSize:12,color:'var(--tx-muted)',fontStyle:'italic'}}>
                    No relevant chunks found above the min_score threshold.
                  </div>
                )}
              </>
            )}
          </div>
        )}

          {/* ── Config Tab ────────────────────────── */}
          {kbTab === 'config' && (
            <div className="agent-form">
              <div style={{display:'flex',alignItems:'center',gap:10,marginBottom:14,
                padding:'10px 14px',background:'rgba(99,102,241,.06)',
                border:'1px solid rgba(99,102,241,.2)',borderRadius:8}}>
                <label className="settings-toggle-label" style={{flex:1,fontWeight:600,fontSize:13}}>
                  <input type="checkbox" checked={!!kbConfig.enabled}
                    onChange={e => setKbConfig(c=>({...c,enabled:e.target.checked}))}
                    style={{marginRight:8,transform:'scale(1.2)'}}/>
                  Enable Knowledge Base for agents
                </label>
                <span style={{fontSize:12,fontWeight:700,color:kbConfig.enabled?'#34d399':'#64748b'}}>
                  {kbConfig.enabled ? '● ACTIVE' : '○ OFF'}
                </span>
              </div>

              <div className="form-group">
                <label>Embedding Model <span style={{fontWeight:400,color:'var(--tx-muted)'}}>
                  — Ollama model for vector embeddings
                </span></label>
                <input value={kbConfig.embed_model}
                  onChange={e => setKbConfig(c=>({...c,embed_model:e.target.value}))}
                  placeholder="nomic-embed-text"/>
                <div style={{fontSize:10,color:'var(--tx-muted)',marginTop:3}}>
                  Pull first: <code>ollama pull nomic-embed-text</code> (274 MB, very fast)
                </div>
              </div>

              <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:10}}>
                <div className="form-group">
                  <label>Chunk size (chars)</label>
                  <input type="number" min="100" max="2000" value={kbConfig.chunk_size}
                    onChange={e => setKbConfig(c=>({...c,chunk_size:parseInt(e.target.value)||400}))}/>
                </div>
                <div className="form-group">
                  <label>Chunk overlap (chars)</label>
                  <input type="number" min="0" max="400" value={kbConfig.chunk_overlap}
                    onChange={e => setKbConfig(c=>({...c,chunk_overlap:parseInt(e.target.value)||80}))}/>
                </div>
                <div className="form-group">
                  <label>Top-K results</label>
                  <input type="number" min="1" max="20" value={kbConfig.top_k}
                    onChange={e => setKbConfig(c=>({...c,top_k:parseInt(e.target.value)||4}))}/>
                </div>
                <div className="form-group">
                  <label>Min relevance score (0–1)</label>
                  <input type="number" min="0" max="1" step="0.05" value={kbConfig.min_score}
                    onChange={e => setKbConfig(c=>({...c,min_score:parseFloat(e.target.value)||0.25}))}/>
                </div>
              </div>

              <label className="settings-toggle-label" style={{marginBottom:12}}>
                <input type="checkbox" checked={!!kbConfig.use_ollama_embed}
                  onChange={e => setKbConfig(c=>({...c,use_ollama_embed:e.target.checked}))}
                  style={{marginRight:6}}/>
                Use Ollama for embeddings (uncheck to use keyword fallback)
              </label>

              <button className="run-btn" onClick={handleSaveKbConfig} disabled={kbConfigSaving}>
                {kbConfigSaving ? '⟳ Saving…' : '💾 Save Config'}
              </button>

              <div className="settings-cmd-ref" style={{marginTop:14}}>
                <div className="settings-cmd-title">How RAG works in this system</div>
                <div style={{fontSize:11,color:'var(--tx-secondary)',padding:'8px 12px',lineHeight:1.6}}>
                  1. You upload documents → they are chunked and embedded into vectors<br/>
                  2. When agents run a job, the Researcher and Analyst call
                  <code> knowledge_base_search</code> automatically<br/>
                  3. The top-K most relevant chunks are injected into their context<br/>
                  4. Agents cite the source file in their output<br/>
                  5. Use <strong>nomic-embed-text</strong> for semantic search or leave
                  Ollama embed off for fast keyword matching
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── Model Picker ───────────────────────────────────── */}
      {showModelPanel && (
        <div className="model-panel">
          <div className="model-panel-header">
            <span>🤖 Select Model</span>
            <button className="model-panel-close" onClick={() => setShowModelPanel(false)}>✕</button>
          </div>
          <div className="model-panel-body">
            {[
              { heading:'Recommended (M1 8 GB)', models:[
                {id:'phi3:mini',size:'2.3 GB',quality:'Fast',desc:'Default — good for simple tasks'},
                {id:'llama3.2:3b',size:'2.0 GB',quality:'Better',desc:'Better reasoning, same memory'},
                {id:'gemma2:2b',size:'1.6 GB',quality:'Fast',desc:'Google Gemma, very fast'},
                {id:'qwen2.5:3b',size:'1.9 GB',quality:'Better',desc:'Strong instruction following'},
              ]},
              { heading:'Larger (16 GB+)', models:[
                {id:'llama3:8b',size:'4.7 GB',quality:'Best',desc:'Best quality — needs 16 GB'},
                {id:'mistral:7b',size:'4.1 GB',quality:'Best',desc:'Excellent reasoning'},
                {id:'qwen2.5:7b',size:'4.4 GB',quality:'Best',desc:'Qwen 7B, top follow'},
                {id:'tinyllama:1.1b',size:'0.6 GB',quality:'Minimal',desc:'Emergency fallback'},
              ]},
            ].map(section => (
              <div key={section.heading}>
                <div className="model-section-label">{section.heading}</div>
                <div className="model-grid">
                  {section.models.map(m => (
                    <div key={m.id}
                      className={`model-card ${selectedModel === m.id ? 'selected' : ''} ${availableModels.includes(m.id) ? 'installed' : ''}`}
                      onClick={() => setSelectedModel(m.id)}>
                      <div className="model-card-top">
                        <span className="model-card-name">{m.id}</span>
                        <span className={`model-quality-badge quality-${m.quality.toLowerCase()}`}>{m.quality}</span>
                      </div>
                      <div className="model-card-desc">{m.desc}</div>
                      <div className="model-card-meta">
                        <span>{m.size}</span>
                        {availableModels.includes(m.id)
                          ? <span className="model-installed">✓ installed</span>
                          : <span className="model-not-installed">not pulled</span>}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
            <div className="model-section-label" style={{marginTop:12}}>Custom</div>
            <input className="topic-input" value={selectedModel}
              onChange={e => setSelectedModel(e.target.value)}
              placeholder="e.g. llama3.1:8b…" style={{marginBottom:0}}/>
           {!availableModels.includes(selectedModel) && selectedModel && (
              <div className="model-pull-hint">
                ⚠️ Not installed. Pull first:
                <code>ollama pull {selectedModel}</code>
              </div>
            )}
            {modelError && <div className="model-error">{modelError}</div>}
          </div>
          <div className="model-panel-footer">
            <span style={{fontSize:11,color:'#64748b'}}>Active: <strong style={{color:'#a5b4fc'}}>{currentModel}</strong></span>
            <button className="run-btn" style={{width:'auto',padding:'8px 20px'}}
              onClick={handleModelChange} disabled={modelSaving || selectedModel === (typeof currentModel === 'string' ? currentModel : '')}>
              {modelSaving?'⟳ Switching…':`Apply ${selectedModel}`}
            </button>
          </div>
        </div>
      )}

      {/* ── Info Bar ─────────────────────────────────────────── */}
      <div className="info-bar">
        <div className="info-bar-left">
          <div className="info-pill model-pill">
            <span className="info-pill-icon">🤖</span>
            <span className="info-pill-label">Model</span>
            <span className="info-pill-value" style={{color: modelBadgeColor()}}>{currentModel}</span>
          </div>
          <div className={`info-pill conn-pill ${connected ? 'conn-ok' : 'conn-bad'}`}>
            <span className="info-pill-icon">{connected ? '🟢' : '🔴'}</span>
            <span className="info-pill-value">{connected ? 'Connected' : 'Connecting…'}</span>
          </div>
          {currentPhase && (
            <div className="info-pill phase-pill">
              <span className="info-pill-icon">{PHASE_META[currentPhase]?.icon}</span>
              <span className="info-pill-label">Phase</span>
              <span className="info-pill-value">{PHASE_META[currentPhase]?.name}</span>
            </div>
          )}
          {running && (
            <div className="info-pill running-pill">
              <span className="info-pill-icon blink">⚡</span>
              <span className="info-pill-value">Running</span>
            </div>
          )}
        </div>
        <div className="info-bar-right">
          {stats && (
            <>
              <div className="info-stat"><span className="info-stat-label">RAM</span><span className="info-stat-value">{stats.ram_used_gb}GB/{stats.ram_total_gb}GB</span></div>
              <div className="info-stat"><span className="info-stat-label">CPU</span><span className="info-stat-value">{stats.cpu_pct}%</span></div>
              <div className="info-stat"><span className="info-stat-label">Tokens↑</span><span className="info-stat-value">{stats.tokens_in.toLocaleString()}</span></div>
              <div className="info-stat"><span className="info-stat-label">Tokens↓</span><span className="info-stat-value">{stats.tokens_out.toLocaleString()}</span></div>
              {jobId && <div className="info-stat"><span className="info-stat-label">Job</span><span className="info-stat-value" style={{color:'#818cf8'}}>#{jobId}</span></div>}
            </>
          )}
          <button
            className={`boardroom-btn ${show3DRoom ? 'active' : ''}`}
            onClick={() => setShow3DRoom(v => !v)}
            title="Toggle 3D Board Room">
            🏛️ {show3DRoom ? 'Hide Board Room' : 'View Board Room'}
          </button>
        </div>
      </div>

      {/* ── 3D Canvas ─────────────────────────────────────── */}
      {show3DRoom && (
        <div className="canvas-area">
          <div className="canvas-label">Agent Office · Drag to orbit · Scroll to zoom</div>
          {running && (
            <div className="phase-bar">
              {PHASE_ORDER.map((p,i) => {
                const m = PHASE_META[p] || { icon:'🤖', name:p }
                const active = currentPhase===p, done=currentPhaseIndex>i
                return (
                  <div key={p} className={`phase-step${active?' active':''}${done?' done':''}`}>
                    <span className="phase-icon">{m.icon}</span>
                    <span className="phase-name">{m.name}</span>
                    {i<3 && <span className="phase-arrow">→</span>}
                  </div>
                )
              })}
            </div>
          )}
          <AgentScene3D activeAgent={activeAgent} agents={agents}
            lastMessages={lastMessages} currentPhase={currentPhase}
            currentWorker={currentWorker}/>
        </div>
      )}

      {/* ── Side Panel ────────────────────────────────────── */}
      <aside className="side-panel">

        {/* Mode selector */}
        <div className="mode-section">
          {MODES.map(m => (
            <button key={m.id}
              className={`mode-btn ${mode===m.id?'active':''}`}
              onClick={() => setMode(m.id)} disabled={running}
              title={m.desc}>
              {m.label}
            </button>
          ))}
        </div>

        {/* Topic / query input */}
        <div className="topic-section">
          <div className="section-heading">{mode==='query'?'Your Question':mode==='file'?'Question about files':'Research Topic'}</div>
          {mode==='file' && selectedFiles.length > 0 && (
            <div className="file-context-badge">
              📎 {selectedFiles.length} file{selectedFiles.length>1?'s':''} selected
              <button onClick={() => setShowUploadPanel(true)} style={{marginLeft:6,background:'none',border:'none',color:'#6366f1',cursor:'pointer',fontSize:10}}>change</button>
            </div>
          )}
          {mode==='file' && selectedFiles.length === 0 && (
            <div className="file-context-badge warn">
              ⚠️ No files selected —
              <button onClick={() => setShowUploadPanel(true)} style={{marginLeft:4,background:'none',border:'none',color:'#f59e0b',cursor:'pointer',fontSize:10}}>upload files</button>
            </div>
          )}
          <input className="topic-input" value={topic}
            onChange={e => setTopic(e.target.value)}
            placeholder={mode==='query'?'Ask anything… e.g. sqrt(144) or What is TCP/IP?':
                         mode==='file'?'What do you want to know about the files?':
                         'Enter a research topic…'}
            disabled={running}/>
          <button className="run-btn" onClick={handleRun}
            disabled={running||!topic.trim()||(mode==='file'&&selectedFiles.length===0)}>
            {running?'⟳ Working…':'▶  Launch Agents'}
          </button>
        </div>

        {/* Agent cards */}
        <div className="agents-section">
          <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:6}}>
            <div className="section-heading">Agents</div>
            <span style={{fontSize:10,color:'var(--tx-hint)'}}>
              {agents.filter(a=>a.active!==false).length} active / {agents.length} total
            </span>
          </div>
          <div className="agents-scroll">
            {agents.map(a => (
              <AgentCard key={a.id} agentId={a.id} agentMeta={a}
                active={activeAgent===a.id} lastMessage={lastMessages[a.id]}
                inactive={a.active===false}/>
            ))}
          </div>
        </div>

        {/* Activity feed */}
        <div className="feed-section">
          <div className="feed-header">
            <div className="section-heading">Activity Feed</div>
            {logs.length>0 && <button className="feed-clear-btn" onClick={()=>setLogs([])}>Clear</button>}
          </div>
          <ActivityFeed logs={logs} agents={agents}/>
        </div>

        {/* Result */}
        {result && (
          <div className="result-section">
            <div className="result-header">
              <div style={{display:'flex',alignItems:'center',gap:7}}>
                <div className="section-heading">Result</div>
                <span className={`format-badge format-${reportFormat}`}>
                  {reportFormat.toUpperCase()}
                </span>
              </div>
              {reportFile && (
                <button className="download-btn" onClick={handleDownload}>⬇ Download</button>
              )}
            </div>
            {reportFile && <div className="report-file-badge">📄 {reportFile}</div>}
            {reportFormat === 'html'
              ? <div className="result-html"
                  dangerouslySetInnerHTML={{ __html: result }} />
              : <div className="result-text">{result}</div>
            }
          </div>
        )}
      </aside>
    </div>
  )
}

/* ── Sub-components ─────────────────────────────────────── */
function StatCard({ label, value, sub, pct, color }) {
  return (
    <div className="stat-card">
      <div className="stat-label">{label}</div>
      <div className="stat-value" style={{color}}>{value}</div>
      <div className="stat-sub">{sub}</div>
      {pct != null && (
        <div className="stat-bar-bg">
          <div className="stat-bar-fill" style={{width:`${Math.min(pct,100)}%`,background:color}}/>
        </div>
      )}
    </div>
  )
}

function fileIcon(name) {
  if (!name || typeof name !== 'string') {
    return '📎'
  }

  const parts = name.split('.')
  const ext = parts.length > 1 ? parts.pop().toLowerCase() : ''

  return {
    pdf:  '📄',
    docx: '📝',
    txt:  '📃',
    csv:  '📊',
    xlsx: '📊',
    json: '📋',
    md:   '📝',
    log:  '📃',
    png:  '🖼️',
    jpg:  '🖼️',
  }[ext] || '📎'
}
function formatBytes(b) {
  if (b < 1024) return `${b} B`
  if (b < 1048576) return `${(b/1024).toFixed(1)} KB`
  return `${(b/1048576).toFixed(1)} MB`
}
