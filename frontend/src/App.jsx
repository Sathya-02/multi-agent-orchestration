import { useState, useEffect, useRef, useCallback } from 'react'
import AgentScene3D from './components/AgentScene3D'
import ActivityFeed from './components/ActivityFeed'
import AgentCard    from './components/AgentCard'
import './styles/App.css'

const WS_URL  = 'ws://localhost:8000/ws'
const API_URL = 'http://localhost:8000'
const BUILTIN     = ['coordinator','researcher','analyst','writer']
const PHASE_ORDER = ['coordinator','researcher','analyst','writer']
const PHASE_META  = {
  coordinator:{ icon:'🎯', name:'Coordinator' },
  researcher: { icon:'🔍', name:'Researcher'  },
  analyst:    { icon:'📊', name:'Analyst'      },
  writer:     { icon:'✍️', name:'Writer'       },
}
const MODES = [
  { id:'research', label:'🔬 Research',      desc:'Full 4-agent pipeline' },
  { id:'query',    label:'💬 Quick Query',    desc:'Single-agent Q&A / maths' },
  { id:'file',     label:'📎 File Analysis', desc:'Analyse uploaded files' },
]

export default function App() {

  /* ── Core state ─────────────────────────────────────── */
  const [connected,     setConnected]     = useState(false)
  const [activeAgent,   setActiveAgent]   = useState(null)
  const [logs,          setLogs]          = useState([])
  const [topic,         setTopic]         = useState('Impact of AI on software development')
  const [mode,          setMode]          = useState('research')
  const [running,       setRunning]       = useState(false)
  const [jobId,         setJobId]         = useState(null)
  const [result,        setResult]        = useState(null)
  const [reportFile,    setReportFile]    = useState(null)
  const [reportFormat,  setReportFormat]  = useState('md')
  const [lastMessages,  setLastMessages]  = useState({})
  const [currentPhase,  setCurrentPhase]  = useState(null)
  const [currentWorker, setCurrentWorker] = useState(null)

  /* ── Model state ─────────────────────────────────────── */
  const [availableModels, setAvailableModels] = useState([])
  const [selectedModel,   setSelectedModel]   = useState('phi3:mini')
  const [currentModel,    setCurrentModel]    = useState('phi3:mini')
  const [modelSaving,     setModelSaving]     = useState(false)
  const [modelError,      setModelError]      = useState(null)
  const [showModelPanel,  setShowModelPanel]  = useState(false)

  /* ── File upload state ───────────────────────────────── */
  const [uploads,          setUploads]          = useState([])
  const [selectedFiles,    setSelectedFiles]    = useState([])
  const [uploading,        setUploading]        = useState(false)
  const [showUploadPanel,  setShowUploadPanel]  = useState(false)
  const fileInputRef = useRef(null)

  /* ── Dashboard state ─────────────────────────────────── */
  const [stats,          setStats]          = useState(null)
  const [showDashboard,  setShowDashboard]  = useState(false)

  /* ── Agent editor state ──────────────────────────────── */
  const [agents,           setAgents]           = useState([])
  const [showAgentEditor,  setShowAgentEditor]  = useState(false)
  const [editingAgent,     setEditingAgent]     = useState(null)
  const [newAgentForm,     setNewAgentForm]     = useState({ label:'', role:'', goal:'', backstory:'', icon:'🤖', color:'#a78bfa' })
  const [agentTab,         setAgentTab]         = useState('list')  // list | new | edit | skills
  const [skillsText,       setSkillsText]       = useState('')
  const [skillsSaving,     setSkillsSaving]     = useState(false)
  const [skillsAgentId,    setSkillsAgentId]    = useState(null)

  /* ── Filesystem config state ─────────────────────────── */
  const [showFsPanel,     setShowFsPanel]     = useState(false)
  const [fsConfig,        setFsConfig]        = useState({ access_list: [], output_dir: null })
  const [fsAudit,         setFsAudit]         = useState([])
  const [fsAuditTab,      setFsAuditTab]      = useState(false)
  const [newFsPath,       setNewFsPath]       = useState('')
  const [newFsRead,       setNewFsRead]       = useState(true)
  const [newFsWrite,      setNewFsWrite]      = useState(false)
  const [newFsEdit,       setNewFsEdit]       = useState(false)
  const [newFsLabel,      setNewFsLabel]      = useState('')
  const [outputDirInput,setOutputDirInput]    = useState('')
  const [fsError,         setFsError]         = useState(null)
  const [spawnRequests,   setSpawnRequests]   = useState([])
  const [spawnEnabled,    setSpawnEnabled]    = useState(true)
  const [spawnToggling,   setSpawnToggling]   = useState(false)

  /* ── Tool state ──────────────────────────────────────── */
  const [tools,          setTools]          = useState([])
  const [showToolPanel,  setShowToolPanel]  = useState(false)
  const [toolTab,        setToolTab]        = useState('list')  // list | new | edit | toolmd
  const [editingTool,    setEditingTool]    = useState(null)
  const [toolMdText,     setToolMdText]     = useState('')
  const [toolMdId,       setToolMdId]       = useState(null)
  const [toolMdSaving,   setToolMdSaving]   = useState(false)
  const [toolSpawnReqs,  setToolSpawnReqs]  = useState([])
  const [newToolForm,    setNewToolForm]    = useState({ name:'', display_name:'', description:'', tags:'', code:'  return str(input_data)' })

  /* ── Settings / Telegram / Self-Improver state ───────── */
  const [showSettings,   setShowSettings]   = useState(false)
  const [settingsTab,    setSettingsTab]    = useState('telegram')  // telegram | improver | practices
  const [tgConfig,       setTgConfig]       = useState({ bot_token:'', allowed_chat_ids:'', notify_chat_id:'', enabled:false })
  const [tgSaving,       setTgSaving]       = useState(false)
  const [tgTesting,      setTgTesting]      = useState(false)
  const [tgTestResult,   setTgTestResult]   = useState(null)
  const [tgBotSet,       setTgBotSet]       = useState(false)
  const [siConfig,       setSiConfig]       = useState({ enabled:true, interval_hours:6, auto_apply_safe:true, notify_telegram:true, min_confidence:0.7, model_override:'' })
  const [siSaving,       setSiSaving]       = useState(false)
  const [siRunning,      setSiRunning]      = useState(false)
  const [bestPractices,  setBestPractices]  = useState('')
  const [proposals,      setProposals]      = useState('')
  const [improvLog,      setImprovLog]      = useState('')

  /* ── Web Search state ────────────────────────────────── */
  const [wsConfig, setWsConfig] = useState({
    enabled: false, provider: 'auto', max_results: 5,
    timeout_seconds: 10, safe_search: true, region: 'wt-wt', fallback_to_mock: true
  })
  const [wsSaving,      setWsSaving]      = useState(false)
  const [wsTesting,     setWsTesting]     = useState(false)
  const [wsTestResult,  setWsTestResult]  = useState(null)
  const [wsTestQuery,   setWsTestQuery]   = useState('weather in Tokyo')

  /* ── Knowledge Base / RAG state ─────────────────────── */
  const [showKbPanel,     setShowKbPanel]     = useState(false)
  const [kbTab,           setKbTab]           = useState('browse')  // browse | add | config
  const [kbEntries,       setKbEntries]       = useState({ entries:[], sources:[], count:0 })
  const [kbConfig,        setKbConfig]        = useState({ enabled:true, embed_model:'nomic-embed-text', chunk_size:400, chunk_overlap:80, top_k:4, min_score:0.25, use_ollama_embed:true })
  const [kbConfigSaving,  setKbConfigSaving]  = useState(false)
  const [kbUploading,     setKbUploading]     = useState(false)
  const [kbSearchQ,       setKbSearchQ]       = useState('')
  const [kbSearchResult,  setKbSearchResult]  = useState(null)
  const [kbSearching,     setKbSearching]     = useState(false)
  const [kbPasteText,     setKbPasteText]     = useState('')
  const [kbPasteName,     setKbPasteName]     = useState('')
  const [kbPasteTags,     setKbPasteTags]     = useState('')
  const kbFileRef = useRef(null)

  const wsRef       = useRef(null)
  const activeTimer = useRef(null)
  const statsTimer  = useRef(null)

  /* ── Init ─────────────────────────────────────────────── */
  useEffect(() => {
    fetchModels(); fetchUploads(); fetchAgents(); fetchSpawnSettings();
    fetchFsConfig(); fetchTools(); fetchToolSpawns(); fetchTelegramConfig();
    fetchSiConfig(); fetchWsConfig(); fetchKbEntries(); fetchKbConfig()
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
      ws.onopen    = () => setConnected(true)
      ws.onmessage = (e) => handleMessage(JSON.parse(e.data))
      ws.onclose   = () => { setConnected(false); setTimeout(connect, 3000) }
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
  const addLog = (agent, label, message, phase=false, ts=null, taskResult=false) =>
    setLogs(p => [...p.slice(-150), { agent, label, message, phase, taskResult, ts: ts||Date.now()/1000 }])

  const fetchModels = async () => {
    try {
      const d = await fetch(`${API_URL}/models`).then(r=>r.json())
      if (d.models) { setAvailableModels(d.models); setCurrentModel(d.active_model); setSelectedModel(d.active_model) }
    } catch {}
  }
  const fetchUploads = async () => {
    try { setUploads(await fetch(`${API_URL}/uploads`).then(r=>r.json())) } catch {}
  }
  const fetchAgents = async () => {
    try {
      const d = await fetch(`${API_URL}/agents`).then(r=>r.json())
      if (d.agents) setAgents(d.agents)
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
      const d = await fetch(`${API_URL}/fs-config`).then(r=>r.json())
      setFsConfig(d); setOutputDirInput(d.output_dir || '')
    } catch {}
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
        method: 'POST', headers: {'Content-Type':'application/json'},
        body: JSON.stringify({ path: newFsPath.trim(), read: newFsRead, write: newFsWrite, edit: newFsEdit, label: newFsLabel.trim() }),
      }).then(r=>r.json())
      if (d.error) { setFsError(d.error); return }
      setNewFsPath(''); setNewFsLabel('')
      await fetchFsConfig()
    } catch (e) { setFsError('Failed to add access entry') }
  }
  const handleRemoveFsAccess = async (path) => {
    await fetch(`${API_URL}/fs-config/access?path=${encodeURIComponent(path)}`, {
      method: 'DELETE', headers: {'Accept': 'application/json'}
    })
    await fetchFsConfig()
  }
  const handleToggleFsFlag = async (path, flag, current) => {
    await fetch(`${API_URL}/fs-config/access`, {
      method: 'PUT', headers: {'Content-Type':'application/json'},
      body: JSON.stringify({ path, [flag]: !current }),
    })
    await fetchFsConfig()
  }

  const fetchTools = async () => {
    try {
      const d = await fetch(`${API_URL}/tools`).then(r => r.json())
      if (d.tools) setTools(d.tools)
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
      method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify(payload),
    }).then(r => r.json())
    if (d.duplicate) {
      addLog('system','⚙️ System', `⚠️ Tool '${newToolForm.name}' already exists.`)
    } else {
      setNewToolForm({ name:'', display_name:'', description:'', tags:'', code:'  return str(input_data)' })
      setToolTab('list')
    }
    await fetchTools()
  }
  const handleUpdateTool = async () => {
    if (!editingTool) return
    await fetch(`${API_URL}/tools/${editingTool.id}`, {
      method: 'PUT', headers: {'Content-Type':'application/json'}, body: JSON.stringify(editingTool),
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
    } catch {}
    finally { setToolMdSaving(false) }
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
        method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify(wsConfig),
      }).then(r => r.json())
      if (d.error) setWsTestResult(`❌ ${d.error}`)
      else setWsTestResult('✅ Configuration saved')
    } catch(e) { setWsTestResult(`❌ ${e}`) }
    finally { setWsSaving(false) }
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
    } catch(e) { setWsTestResult(`❌ ${e}`) }
    finally { setWsTesting(false) }
  }
  const handleRunWsQuery = async () => {
    if (!wsTestQuery.trim()) return
    setWsTesting(true); setWsTestResult(null)
    try {
      const d = await fetch(`${API_URL}/web-search/query?q=${encodeURIComponent(wsTestQuery)}`).then(r => r.json())
      if (d.error) setWsTestResult(`❌ ${d.error}`)
      else setWsTestResult(`Query: "${d.query}"\n\n${d.result}`)
    } catch(e) { setWsTestResult(`❌ ${e}`) }
    finally { setWsTesting(false) }
  }

  /* ── Telegram / Self-Improver fetch + handlers ─────────── */
  const fetchTelegramConfig = async () => {
    try {
      const d = await fetch(`${API_URL}/telegram/config`).then(r=>r.json())
      if (!d.error) {
        setTgBotSet(!!d.bot_token_set)
        setTgConfig(c => ({
          ...c,
          allowed_chat_ids: (d.allowed_chat_ids||[]).join(', '),
          notify_chat_id: d.notify_chat_id || '',
          enabled: !!d.enabled,
        }))
      }
    } catch {}
  }
  const handleSaveTelegram = async () => {
    setTgSaving(true); setTgTestResult(null)
    try {
      const payload = {
        bot_token: tgConfig.bot_token || undefined,
        allowed_chat_ids: tgConfig.allowed_chat_ids ? tgConfig.allowed_chat_ids.split(',').map(s=>s.trim()).filter(Boolean) : [],
        notify_chat_id: tgConfig.notify_chat_id,
        enabled: tgConfig.enabled,
      }
      const d = await fetch(`${API_URL}/telegram/config`, {
        method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(payload)
      }).then(r=>r.json())
      if (d.error) { setTgTestResult(`❌ ${d.error}`) }
      else { setTgTestResult('✅ Configuration saved'); setTgBotSet(true); await fetchTelegramConfig() }
    } catch(e) { setTgTestResult(`❌ ${e}`) }
    finally { setTgSaving(false) }
  }
  const handleTestTelegram = async () => {
    setTgTesting(true); setTgTestResult(null)
    try {
      const d = await fetch(`${API_URL}/telegram/test`, {method:'POST'}).then(r=>r.json())
      setTgTestResult(d.error ? `❌ ${d.error}` : '✅ Test message sent! Check your Telegram.')
    } catch(e) { setTgTestResult(`❌ ${e}`) }
    finally { setTgTesting(false) }
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
    } catch {}
    finally { setSiSaving(false) }
  }
  const handleRunImprover = async () => {
    setSiRunning(true)
    try {
      await fetch(`${API_URL}/self-improver/run-now`, {method:'POST'})
      addLog('system','⚙️ System','🔄 Self-improvement cycle triggered…')
    } catch {}
    finally { setTimeout(()=>setSiRunning(false), 3000) }
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
        method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(kbConfig),
      })
      addLog('system','📚 KB','✅ Knowledge base config saved')
    } catch {}
    finally { setKbConfigSaving(false) }
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
          text: kbPasteText, source_name: kbPasteName,
          tags: kbPasteTags ? kbPasteTags.split(',').map(t=>t.trim()).filter(Boolean) : []
        }),
      }).then(r=>r.json())
      addLog('system','📚 KB', d.message || 'Ingested text')
      setKbPasteText(''); setKbPasteName(''); setKbPasteTags('')
      await fetchKbEntries()
    } catch {}
    finally { setKbUploading(false) }
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
    } catch(e) { setKbSearchResult(`Error: ${e}`) }
    finally { setKbSearching(false) }
  }

  const handleSetOutputDir = async () => {
    setFsError(null)
    try {
      const d = await fetch(`${API_URL}/fs-config/output-dir`, {
        method: 'POST', headers: {'Content-Type':'application/json'},
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
        method: 'POST', headers: {'Content-Type':'application/json'},
        body: JSON.stringify({ enabled: !spawnEnabled }),
      }).then(r=>r.json())
      if (typeof d.spawn_enabled === 'boolean') setSpawnEnabled(d.spawn_enabled)
    } catch {}
    setSpawnToggling(false)
  }

  /* ── Message handler ────────────────────────────────────── */
  const handleMessage = useCallback((msg) => {
    if (msg.type === 'agent_working') { setCurrentWorker(msg) }
    if (msg.type === 'agent_activity') {
      const { agent, label, message, ts, phase, task_result } = msg
      if (phase) setCurrentPhase(agent)
      setActiveAgent(agent)
      addLog(agent, label, message, !!phase, ts, !!task_result)
      setLastMessages(p => ({...p, [agent]: message}))
      clearTimeout(activeTimer.current)
      activeTimer.current = setTimeout(() => setActiveAgent(null), 4000)
    }
    if (msg.type === 'job_status') {
      setRunning(msg.status === 'running')
      if (msg.status === 'running') addLog('system','⚙️ System',`▶ Job started — model: ${msg.model}, mode: ${msg.mode}`)
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
      if (msg.config) { setFsConfig(msg.config); setOutputDirInput(msg.config.output_dir || '') }
    }
    if (msg.type === 'spawn_settings') {
      if (typeof msg.spawn_enabled === 'boolean') setSpawnEnabled(msg.spawn_enabled)
    }
    if (msg.type === 'tool_spawn_request') {
      setToolSpawnReqs(p => [...p, msg])
      addLog('system','⚙️ System', `🔧 Agent requests new tool: '${msg.suggestion?.name||'?'}' — awaiting approval`)
    }
    if (msg.type === 'tool_created' || msg.type === 'tool_updated' || msg.type === 'tool_deleted' || msg.type === 'tools_updated') {
      fetchTools()
    }
  }, [currentModel])

  /* ── Model actions ────────────────────────────────────── */
  const handleModelChange = async () => {
    if (selectedModel === currentModel) return
    setModelSaving(true); setModelError(null)
    try {
      const d = await fetch(`${API_URL}/model`, {
        method:'POST', headers:{'Content-Type':'application/json'},
        body:JSON.stringify({model:selectedModel})
      }).then(r=>r.json())
      if (d.error) setModelError(d.error)
      else { setCurrentModel(d.active_model); addLog('system','⚙️ System',`✅ Model: ${d.active_model}`); setShowModelPanel(false) }
    } catch { setModelError('Failed') }
    finally { setModelSaving(false) }
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
    const res = await fetch(`${API_URL}/run`, {
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
    const res = await fetch(`${API_URL}/agents`, {
      method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify(newAgentForm),
    })
    const data = await res.json()
    await fetchAgents()
    if (data.duplicate) {
      addLog('system', '⚙️ System', `⚠️ Role "${newAgentForm.role}" already exists (${data.agent?.label}). No duplicate created.`)
      return
    }
    setNewAgentForm({ label:'', role:'', goal:'', backstory:'', icon:'🤖', color:'#a78bfa' })
    setAgentTab('list')
  }
  const handleUpdateAgent = async () => {
    if (!editingAgent) return
    await fetch(`${API_URL}/agents/${editingAgent.id}`, {
      method:'PUT', headers:{'Content-Type':'application/json'}, body:JSON.stringify(editingAgent)
    })
    await fetchAgents()
    setEditingAgent(null); setAgentTab('list')
  }
  const handleDeleteAgent = async (id) => {
    await fetch(`${API_URL}/agents/${id}`, { method:'DELETE' })
    await fetchAgents()
  }

  /* ── Spawn decisions ──────────────────────────────────── */
  const handleSpawnDecision = async (request_id, approved) => {
    await fetch(`${API_URL}/spawns/decide`, {
      method:'POST', headers:{'Content-Type':'application/json'},
      body:JSON.stringify({request_id, approved})
    })
    setSpawnRequests(p => p.filter(r => r.request_id !== request_id))
    await fetchAgents()
  }

  const modelBadgeColor = () => {
    if (currentModel.includes('llama3')||currentModel.includes('mistral')||currentModel.includes('qwen')) return '#22c55e'
    if (currentModel.includes('phi3')||currentModel.includes('gemma')) return '#f59e0b'
    return '#6366f1'
  }

  const currentPhaseIndex = currentPhase ? PHASE_ORDER.indexOf(currentPhase) : -1
  const pendingSpawns     = spawnRequests.filter(r => !r._resolved)
  const pendingToolSpawns = toolSpawnReqs.filter(r => !r._resolved)

  return (
    <div className="app-shell">

      {/* ── Header ─────────────────────────────────────────── */}
      <header className="app-header">
        <div className="header-left">
          <div className="header-logo">
            <span className="logo-icon">🤖</span>
            <span className="logo-text">Multi-Agent Orchestration</span>
          </div>
        </div>

        <div className="header-center">
          {/* Phase progress */}
          {running && (
            <div className="phase-progress">
              {PHASE_ORDER.map((p, i) => (
                <div key={p} className={`phase-step ${i < currentPhaseIndex ? 'done' : i === currentPhaseIndex ? 'active' : ''}`}>
                  <span className="phase-icon">{PHASE_META[p].icon}</span>
                  <span className="phase-name">{PHASE_META[p].name}</span>
                  {i < PHASE_ORDER.length - 1 && <span className="phase-arrow">→</span>}
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="header-right">
          {/* Spawn alert */}
          {(pendingSpawns.length > 0 || pendingToolSpawns.length > 0) && (
            <button className="spawn-alert-btn" onClick={() => setShowAgentEditor(true)}>
              🧬 {pendingSpawns.length + pendingToolSpawns.length} pending
            </button>
          )}

          {/* Model badge */}
          <button className="model-badge" onClick={() => setShowModelPanel(v => !v)}>
            <span className="model-dot" style={{ background: modelBadgeColor() }} />
            <span className="model-name">{currentModel}</span>
            <span className="model-chevron">▾</span>
          </button>

          {/* Nav icons */}
          <button className={`header-icon-btn ${showDashboard ? 'active' : ''}`} onClick={() => setShowDashboard(v => !v)} title="Dashboard">📊</button>
          <button className={`header-icon-btn ${showUploadPanel ? 'active' : ''}`} onClick={() => setShowUploadPanel(v => !v)} title="Files">📎</button>
          <button className={`header-icon-btn ${showAgentEditor ? 'active' : ''}`} onClick={() => setShowAgentEditor(v => !v)} title="Agents">🧠</button>
          <button className={`header-icon-btn ${showToolPanel ? 'active' : ''}`} onClick={() => setShowToolPanel(v => !v)} title="Tools">🔧</button>
          <button className={`header-icon-btn ${showFsPanel ? 'active' : ''}`} onClick={() => setShowFsPanel(v => !v)} title="Filesystem">📂</button>
          <button className={`header-icon-btn ${showKbPanel ? 'active' : ''}`} onClick={() => setShowKbPanel(v => !v)} title="Knowledge Base">📚</button>
          <button className={`header-icon-btn ${showSettings ? 'active' : ''}`} onClick={() => setShowSettings(v => !v)} title="Settings">⚙️</button>

          {/* Connection status */}
          <div className={`status-dot ${connected ? 'connected' : 'disconnected'}`} title={connected ? 'Connected' : 'Reconnecting…'} />
        </div>
      </header>

      {/* ── Model Panel ───────────────────────────────────── */}
      {showModelPanel && (
        <div className="overlay-panel model-panel">
          <div className="overlay-header">
            <span>🤖 Select Model</span>
            <button className="overlay-close" onClick={() => setShowModelPanel(false)}>✕</button>
          </div>
          <div className="overlay-body">
            <div className="model-list">
              {availableModels.length === 0 && <p className="muted-text">No models found. Is Ollama running?</p>}
              {availableModels.map(m => (
                <label key={m} className={`model-option ${selectedModel === m ? 'selected' : ''}`}>
                  <input type="radio" name="model" value={m} checked={selectedModel === m} onChange={() => setSelectedModel(m)} />
                  <span className="model-option-name">{m}</span>
                  {m === currentModel && <span className="model-active-badge">active</span>}
                </label>
              ))}
            </div>
            {modelError && <p className="error-text">{modelError}</p>}
            <button className="btn btn-primary" onClick={handleModelChange} disabled={modelSaving || selectedModel === currentModel}>
              {modelSaving ? '⏳ Switching…' : 'Apply Model'}
            </button>
          </div>
        </div>
      )}

      {/* ── Main layout ───────────────────────────────────── */}
      <main className="app-main">

        {/* Left: 3D scene + agent cards */}
        <aside className="left-panel">
          <AgentScene3D
            agents={agents.length ? agents : BUILTIN.map(id => ({ id, label: PHASE_META[id]?.name || id, icon: PHASE_META[id]?.icon || '🤖', color: '#6366f1' }))}
            activeAgent={activeAgent}
            currentPhase={currentPhase}
            connected={connected}
          />
          <div className="agent-cards-row">
            {PHASE_ORDER.map(id => {
              const ag = agents.find(a => a.id === id) || { id, label: PHASE_META[id]?.name || id, icon: PHASE_META[id]?.icon || '🤖' }
              return (
                <AgentCard
                  key={id}
                  agent={ag}
                  active={activeAgent === id}
                  phase={currentPhase === id}
                  message={lastMessages[id]}
                  worker={currentWorker?.agent === id ? currentWorker : null}
                />
              )
            })}
          </div>
        </aside>

        {/* Center: control + results */}
        <section className="center-panel">

          {/* Mode selector */}
          <div className="mode-selector">
            {MODES.map(m => (
              <button
                key={m.id}
                className={`mode-btn ${mode === m.id ? 'active' : ''}`}
                onClick={() => setMode(m.id)}
                disabled={running}
              >
                <span className="mode-label">{m.label}</span>
                <span className="mode-desc">{m.desc}</span>
              </button>
            ))}
          </div>

          {/* Topic input */}
          <div className="topic-row">
            <textarea
              className="topic-input"
              rows={2}
              value={topic}
              onChange={e => setTopic(e.target.value)}
              placeholder={mode === 'file' ? 'Describe what to analyse in the uploaded file…' : 'Enter research topic or question…'}
              disabled={running}
              onKeyDown={e => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) handleRun() }}
            />
            <button className="run-btn" onClick={handleRun} disabled={running || !topic.trim()}>
              {running ? <span className="spinner" /> : '▶ Run'}
            </button>
          </div>

          {/* Result */}
          {result && (
            <div className="result-card">
              <div className="result-header">
                <span>📄 Report</span>
                <div className="result-actions">
                  <span className="result-format-badge">{(reportFormat||'md').toUpperCase()}</span>
                  {reportFile && (
                    <button className="btn btn-sm" onClick={handleDownload}>⬇ Download</button>
                  )}
                </div>
              </div>
              <pre className="result-body">{result}</pre>
            </div>
          )}

          {/* Activity Feed */}
          <ActivityFeed logs={logs} running={running} />
        </section>

        {/* Right: spawn requests */}
        {(pendingSpawns.length > 0 || pendingToolSpawns.length > 0) && (
          <aside className="right-panel">
            <div className="spawn-panel">
              <div className="spawn-panel-title">🧬 Spawn Requests</div>

              {pendingSpawns.map(req => (
                <div key={req.request_id} className="spawn-request-banner">
                  <div className="spawn-request-info">
                    <span className="spawn-icon">{req.suggested_agent?.icon || '🤖'}</span>
                    <div>
                      <div className="spawn-name">{req.suggested_agent?.label || req.suggested_agent?.role || 'New Agent'}</div>
                      <div className="spawn-reason">{req.reason}</div>
                    </div>
                  </div>
                  <div className="spawn-actions">
                    <button className="spawn-approve-btn" onClick={() => handleSpawnDecision(req.request_id, true)}>✓</button>
                    <button className="spawn-reject-btn" onClick={() => handleSpawnDecision(req.request_id, false)}>✕</button>
                  </div>
                </div>
              ))}

              {pendingToolSpawns.map(req => (
                <div key={req.request_id} className="spawn-request-banner tool-spawn">
                  <div className="spawn-request-info">
                    <span className="spawn-icon">🔧</span>
                    <div>
                      <div className="spawn-name">{req.suggestion?.display_name || req.suggestion?.name || 'New Tool'}</div>
                      <div className="spawn-reason">{req.suggestion?.description || req.reason}</div>
                    </div>
                  </div>
                  <div className="spawn-actions">
                    <button className="spawn-approve-btn" onClick={() => handleToolSpawnDecision(req.request_id, true)}>✓</button>
                    <button className="spawn-reject-btn" onClick={() => handleToolSpawnDecision(req.request_id, false)}>✕</button>
                  </div>
                </div>
              ))}
            </div>
          </aside>
        )}
      </main>

      {/* ── Dashboard Overlay ─────────────────────────────── */}
      {showDashboard && (
        <div className="overlay-panel dashboard-panel">
          <div className="overlay-header">
            <span>📊 Dashboard</span>
            <button className="overlay-close" onClick={() => setShowDashboard(false)}>✕</button>
          </div>
          <div className="overlay-body">
            {!stats ? (
              <p className="muted-text">Loading stats…</p>
            ) : (
              <div className="dashboard-grid">
                {[
                  { label: 'Jobs Run', val: stats.total_jobs ?? 0, sub: 'all time', bar: null },
                  { label: 'Active Model', val: currentModel, sub: '', bar: null },
                  { label: 'Agents', val: agents.length, sub: `${BUILTIN.length} built-in`, bar: null },
                  { label: 'Tools', val: tools.length, sub: `${tools.filter(t=>t.active!==false).length} active`, bar: null },
                ].map(s => (
                  <div key={s.label} className="stat-card">
                    <div className="stat-label">{s.label}</div>
                    <div className="stat-val">{s.val}</div>
                    {s.sub && <div className="stat-sub">{s.sub}</div>}
                  </div>
                ))}

                {stats.model_usage && Object.keys(stats.model_usage).length > 0 && (
                  <div className="stat-card wide">
                    <div className="stat-label">Model Usage</div>
                    {Object.entries(stats.model_usage).map(([m, c]) => (
                      <div key={m} className="dashboard-model-row">
                        <span>{m}</span>
                        <span>{c} jobs</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Upload Overlay ────────────────────────────────── */}
      {showUploadPanel && (
        <div className="overlay-panel upload-panel">
          <div className="overlay-header">
            <span>📎 File Uploads</span>
            <button className="overlay-close" onClick={() => setShowUploadPanel(false)}>✕</button>
          </div>
          <div className="overlay-body upload-body">
            <div
              className="upload-drop-zone"
              onClick={() => fileInputRef.current?.click()}
              onDragOver={e => e.preventDefault()}
              onDrop={e => { e.preventDefault(); handleFileUpload({ target: { files: e.dataTransfer.files } }) }}
            >
              <span>📂 Click or drag files here</span>
              <input ref={fileInputRef} type="file" multiple hidden onChange={handleFileUpload} />
            </div>
            {uploading && <p className="muted-text">⏳ Uploading…</p>}
            {uploads.length > 0 && (
              <div className="upload-list">
                {uploads.map(u => (
                  <div key={u.filename} className="upload-item">
                    <label className="upload-item-label">
                      <input
                        type="checkbox"
                        checked={selectedFiles.includes(u.filename)}
                        onChange={e => setSelectedFiles(p => e.target.checked ? [...p, u.filename] : p.filter(f => f !== u.filename))}
                      />
                      <span className="upload-filename">{u.filename}</span>
                      <span className="upload-size">{formatBytes(u.size)}</span>
                    </label>
                    <button className="btn-icon-danger" onClick={() => handleDeleteUpload(u.filename)}>🗑</button>
                  </div>
                ))}
              </div>
            )}
            {selectedFiles.length > 0 && (
              <div className="upload-selected-badge">{selectedFiles.length} file{selectedFiles.length > 1 ? 's' : ''} selected for next run</div>
            )}
          </div>
        </div>
      )}

      {/* ── Agent Editor Overlay ──────────────────────────── */}
      {showAgentEditor && (
        <div className="overlay-panel agent-panel">
          <div className="overlay-header">
            <span>🧠 Agent Editor</span>
            <button className="overlay-close" onClick={() => setShowAgentEditor(false)}>✕</button>
          </div>
          <div className="overlay-body">

            {/* Spawn toggle */}
            <div className="spawn-toggle-row">
              <span>Allow agent self-spawn</span>
              <button
                className={`toggle-btn ${spawnEnabled ? 'on' : 'off'}`}
                onClick={handleToggleSpawn}
                disabled={spawnToggling}
              >
                {spawnEnabled ? 'ON' : 'OFF'}
              </button>
            </div>

            {/* Pending spawns */}
            {pendingSpawns.length > 0 && (
              <div className="pending-spawns">
                <div className="section-label">🧬 Pending Agent Spawns</div>
                {pendingSpawns.map(req => (
                  <div key={req.request_id} className="spawn-request-banner">
                    <div className="spawn-request-info">
                      <span>{req.suggested_agent?.icon || '🤖'}</span>
                      <div>
                        <div className="spawn-name">{req.suggested_agent?.label || req.suggested_agent?.role}</div>
                        <div className="spawn-reason">{req.reason}</div>
                      </div>
                    </div>
                    <div className="spawn-actions">
                      <button className="spawn-approve-btn" onClick={() => handleSpawnDecision(req.request_id, true)}>✓ Approve</button>
                      <button className="spawn-reject-btn" onClick={() => handleSpawnDecision(req.request_id, false)}>✕ Reject</button>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Tabs */}
            <div className="agent-tabs">
              {['list','new'].map(t => (
                <button key={t} className={`tab-btn ${agentTab === t ? 'active' : ''}`} onClick={() => setAgentTab(t)}>
                  {t === 'list' ? '📋 Agents' : '+ New Agent'}
                </button>
              ))}
              {editingAgent && (
                <button className={`tab-btn ${agentTab === 'edit' ? 'active' : ''}`} onClick={() => setAgentTab('edit')}>✏️ Edit</button>
              )}
              {skillsAgentId && (
                <button className={`tab-btn ${agentTab === 'skills' ? 'active' : ''}`} onClick={() => setAgentTab('skills')}>🎓 Skills</button>
              )}
            </div>

            {/* List tab */}
            {agentTab === 'list' && (
              <div className="agent-list">
                {agents.map(ag => (
                  <div key={ag.id} className={`agent-editor-card ${BUILTIN.includes(ag.id) ? 'builtin' : 'custom'}`}>
                    <div className="agent-editor-card-header">
                      <span className="agent-icon">{ag.icon}</span>
                      <div className="agent-editor-info">
                        <span className="agent-editor-name">{ag.label}</span>
                        <span className="agent-editor-role muted-text">{ag.role}</span>
                      </div>
                      {BUILTIN.includes(ag.id) && <span className="builtin-badge">built-in</span>}
                    </div>
                    <div className="agent-action-group">
                      <button className="btn btn-sm" onClick={() => { setEditingAgent({...ag}); setAgentTab('edit') }}>Edit</button>
                      <button className="btn btn-sm" onClick={async () => {
                        setSkillsAgentId(ag.id); setAgentTab('skills'); setSkillsText('')
                        try { const d = await fetch(`${API_URL}/agents/${ag.id}/skills`).then(r=>r.json()); setSkillsText(d.content||'') } catch {}
                      }}>Skills</button>
                      {!BUILTIN.includes(ag.id) && (
                        <button className="btn btn-sm btn-danger" onClick={() => handleDeleteAgent(ag.id)}>Delete</button>
                      )}
                    </div>
                  </div>
                ))}
                {agents.length === 0 && <p className="muted-text">No agents yet.</p>}
              </div>
            )}

            {/* New agent tab */}
            {agentTab === 'new' && (
              <div className="agent-form">
                {[['label','Display Name'],['role','Role (unique ID)'],['goal','Goal'],['backstory','Backstory']].map(([k, ph]) => (
                  <div key={k} className="form-group">
                    <label className="form-label">{ph}</label>
                    {k === 'goal' || k === 'backstory'
                      ? <textarea className="form-textarea" rows={3} value={newAgentForm[k]} onChange={e => setNewAgentForm(p => ({...p, [k]: e.target.value}))} placeholder={ph} />
                      : <input className="form-input" value={newAgentForm[k]} onChange={e => setNewAgentForm(p => ({...p, [k]: e.target.value}))} placeholder={ph} />
                    }
                  </div>
                ))}
                <div className="form-row">
                  <div className="form-group">
                    <label className="form-label">Icon</label>
                    <input className="form-input short" value={newAgentForm.icon} onChange={e => setNewAgentForm(p=>({...p, icon: e.target.value}))} />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Colour</label>
                    <input type="color" className="form-color" value={newAgentForm.color} onChange={e => setNewAgentForm(p=>({...p, color: e.target.value}))} />
                  </div>
                </div>
                <button className="btn btn-primary" onClick={handleCreateAgent}>Create Agent</button>
              </div>
            )}

            {/* Edit tab */}
            {agentTab === 'edit' && editingAgent && (
              <div className="agent-form">
                {[['label','Display Name'],['role','Role'],['goal','Goal'],['backstory','Backstory']].map(([k, ph]) => (
                  <div key={k} className="form-group">
                    <label className="form-label">{ph}</label>
                    {k === 'goal' || k === 'backstory'
                      ? <textarea className="form-textarea" rows={3} value={editingAgent[k]||''} onChange={e => setEditingAgent(p => ({...p, [k]: e.target.value}))} />
                      : <input className="form-input" value={editingAgent[k]||''} onChange={e => setEditingAgent(p => ({...p, [k]: e.target.value}))} />
                    }
                  </div>
                ))}
                <button className="btn btn-primary" onClick={handleUpdateAgent}>Save Changes</button>
                <button className="btn btn-ghost" onClick={() => { setEditingAgent(null); setAgentTab('list') }}>Cancel</button>
              </div>
            )}

            {/* Skills tab */}
            {agentTab === 'skills' && skillsAgentId && (
              <div className="agent-form">
                <p className="muted-text form-hint">
                  Edit the agent's SKILLS.md. Use <code>## Role</code>, <code>## Goal</code>, <code>## Backstory</code>, <code>## Tools</code> (comma-separated), and <code>## Config</code> (<code>max_iter: 10</code> / <code>allow_delegation: false</code>).
                  Changes take effect on the next job run.
                </p>
                <textarea
                  className="form-textarea code-textarea"
                  rows={14}
                  value={skillsText}
                  onChange={e => setSkillsText(e.target.value)}
                  spellCheck={false}
                />
                <button className="btn btn-primary" disabled={skillsSaving} onClick={async () => {
                  setSkillsSaving(true)
                  try {
                    await fetch(`${API_URL}/agents/${skillsAgentId}/skills`, {
                      method:'PUT', headers:{'Content-Type':'application/json'}, body:JSON.stringify({ text: skillsText })
                    })
                    addLog('system','⚙️ System',`🎓 Skills saved for ${skillsAgentId}`)
                  } catch {}
                  finally { setSkillsSaving(false) }
                }}>
                  {skillsSaving ? '⏳ Saving…' : '💾 Save Skills'}
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Tool Panel Overlay ────────────────────────────── */}
      {showToolPanel && (
        <div className="overlay-panel tool-panel">
          <div className="overlay-header">
            <span>🔧 Tool Manager</span>
            <button className="overlay-close" onClick={() => setShowToolPanel(false)}>✕</button>
          </div>
          <div className="overlay-body">

            {pendingToolSpawns.length > 0 && (
              <div className="pending-spawns">
                <div className="tool-section-label">🔧 Pending Tool Spawns</div>
                {pendingToolSpawns.map(req => (
                  <div key={req.request_id} className="spawn-request-banner tool-spawn">
                    <div className="spawn-request-info">
                      <span>🔧</span>
                      <div>
                        <div className="spawn-name">{req.suggestion?.display_name || req.suggestion?.name}</div>
                        <div className="spawn-reason">{req.suggestion?.description || req.reason}</div>
                      </div>
                    </div>
                    <div className="spawn-actions">
                      <button className="spawn-approve-btn" onClick={() => handleToolSpawnDecision(req.request_id, true)}>✓ Approve</button>
                      <button className="spawn-reject-btn" onClick={() => handleToolSpawnDecision(req.request_id, false)}>✕ Reject</button>
                    </div>
                  </div>
                ))}
              </div>
            )}

            <div className="agent-tabs">
              {['list','new'].map(t => (
                <button key={t} className={`tab-btn ${toolTab === t ? 'active' : ''}`} onClick={() => setToolTab(t)}>
                  {t === 'list' ? '📋 Tools' : '+ New Tool'}
                </button>
              ))}
              {editingTool && <button className={`tab-btn ${toolTab === 'edit' ? 'active' : ''}`} onClick={() => setToolTab('edit')}>✏️ Edit</button>}
              {toolMdId && <button className={`tab-btn ${toolTab === 'toolmd' ? 'active' : ''}`} onClick={() => setToolTab('toolmd')}>📄 TOOL.md</button>}
            </div>

            {toolTab === 'list' && (
              <div className="tool-list">
                {tools.length === 0 && <p className="muted-text">No custom tools yet.</p>}
                {tools.map(tool => (
                  <div key={tool.id} className="tool-card">
                    <div className="tool-card-header">
                      <span className="tool-name">{tool.display_name || tool.name}</span>
                      <div className="tool-tags">
                        {(tool.tags||[]).map(tag => <span key={tag} className="tool-tag">{tag}</span>)}
                        <span className={`tool-tag ${tool.active === false ? 'inactive' : 'active-tag'}`}>
                          {tool.active === false ? 'inactive' : 'active'}
                        </span>
                      </div>
                    </div>
                    {tool.description && <p className="tool-desc muted-text">{tool.description}</p>}
                    <div className="agent-action-group">
                      <button className="btn btn-sm" onClick={() => { setEditingTool({...tool}); setToolTab('edit') }}>Edit</button>
                      <button className="btn btn-sm" onClick={() => handleOpenToolMd(tool)}>TOOL.md</button>
                      <button className="btn btn-sm" onClick={() => handleToggleToolActive(tool)}>
                        {tool.active === false ? 'Activate' : 'Deactivate'}
                      </button>
                      <button className="btn btn-sm btn-danger" onClick={() => handleDeleteTool(tool.id)}>Delete</button>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {toolTab === 'new' && (
              <div className="agent-form">
                {[['name','Tool ID (snake_case)'],['display_name','Display Name'],['description','Description'],['tags','Tags (comma-sep)']].map(([k, ph]) => (
                  <div key={k} className="form-group">
                    <label className="form-label">{ph}</label>
                    <input className="form-input" value={newToolForm[k]} onChange={e => setNewToolForm(p=>({...p,[k]:e.target.value}))} placeholder={ph} />
                  </div>
                ))}
                <div className="form-group">
                  <label className="form-label">Code Body</label>
                  <p className="muted-text form-hint"><code>self</code> and <code>input_data: str</code> are provided. Must return a <code>str</code>. Import standard library modules at the top of the body. The tool is available to agents immediately on the next job after approval.</p>
                  <textarea className="form-textarea code-textarea" rows={8} value={newToolForm.code} onChange={e => setNewToolForm(p=>({...p,code:e.target.value}))} spellCheck={false} />
                </div>
                <button className="btn btn-primary" onClick={handleCreateTool}>Create Tool</button>
              </div>
            )}

            {toolTab === 'edit' && editingTool && (
              <div className="agent-form">
                {[['display_name','Display Name'],['description','Description'],['tags','Tags (comma-sep)']].map(([k, ph]) => (
                  <div key={k} className="form-group">
                    <label className="form-label">{ph}</label>
                    <input className="form-input" value={editingTool[k]||(Array.isArray(editingTool[k]) ? editingTool[k].join(', ') : '')} onChange={e => setEditingTool(p=>({...p,[k]:e.target.value}))} placeholder={ph} />
                  </div>
                ))}
                <div className="form-group">
                  <label className="form-label">Code Body</label>
                  <p className="muted-text form-hint">Edit <code>## Code</code> to change tool behaviour, <code>## Description</code> to update what the LLM sees, and <code>## Tags</code> for categorisation. Changes take effect on the next job run.</p>
                  <textarea className="form-textarea code-textarea" rows={8} value={editingTool.code||''} onChange={e => setEditingTool(p=>({...p,code:e.target.value}))} spellCheck={false} />
                </div>
                <button className="btn btn-primary" onClick={handleUpdateTool}>Save Changes</button>
                <button className="btn btn-ghost" onClick={() => { setEditingTool(null); setToolTab('list') }}>Cancel</button>
              </div>
            )}

            {toolTab === 'toolmd' && toolMdId && (
              <div className="agent-form">
                <p className="muted-text form-hint">Editing TOOL.md for <strong>{toolMdId}</strong></p>
                <textarea className="form-textarea code-textarea" rows={14} value={toolMdText} onChange={e => setToolMdText(e.target.value)} spellCheck={false} />
                <button className="btn btn-primary" disabled={toolMdSaving} onClick={handleSaveToolMd}>{toolMdSaving ? '⏳ Saving…' : '💾 Save TOOL.md'}</button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Filesystem Panel Overlay ──────────────────────── */}
      {showFsPanel && (
        <div className="overlay-panel fs-panel">
          <div className="overlay-header">
            <span>📂 Filesystem Access</span>
            <button className="overlay-close" onClick={() => setShowFsPanel(false)}>✕</button>
          </div>
          <div className="overlay-body fs-body">

            {/* Output dir */}
            <div className="form-group">
              <label className="form-label">Output Directory</label>
              <div className="form-row">
                <input className="form-input" value={outputDirInput} onChange={e => setOutputDirInput(e.target.value)} placeholder="/path/to/output" />
                <button className="btn btn-sm btn-primary" onClick={handleSetOutputDir}>Set</button>
              </div>
              {fsConfig.output_dir && <p className="muted-text form-hint">Current: {fsConfig.output_dir}</p>}
            </div>

            {/* Access list */}
            <div className="fs-section-label">Allowed Paths</div>
            {fsConfig.access_list?.length === 0 && <p className="muted-text">No paths configured.</p>}
            {(fsConfig.access_list||[]).map(entry => (
              <div key={entry.path} className="fs-access-row">
                <div className="fs-access-path">{entry.label ? <strong>{entry.label}</strong> : null} <code>{entry.path}</code></div>
                <div className="fs-access-flags">
                  {['read','write','edit'].map(flag => (
                    <button
                      key={flag}
                      className={`fs-flag-toggle ${entry[flag] ? 'on' : 'off'}`}
                      onClick={() => handleToggleFsFlag(entry.path, flag, entry[flag])}
                    >{flag}</button>
                  ))}
                </div>
                <button className="btn-icon-danger" onClick={() => handleRemoveFsAccess(entry.path)}>✕</button>
              </div>
            ))}

            {/* Add path */}
            <div className="fs-section-label">Add Path</div>
            {fsError && <p className="error-text">{fsError}</p>}
            <div className="form-group">
              <input className="form-input" value={newFsPath} onChange={e => setNewFsPath(e.target.value)} placeholder="/path/to/directory" />
            </div>
            <div className="form-group">
              <input className="form-input" value={newFsLabel} onChange={e => setNewFsLabel(e.target.value)} placeholder="Label (optional)" />
            </div>
            <div className="form-row flags-row">
              {[['read', newFsRead, setNewFsRead],['write', newFsWrite, setNewFsWrite],['edit', newFsEdit, setNewFsEdit]].map(([f, v, sv]) => (
                <label key={f} className="flag-checkbox">
                  <input type="checkbox" checked={v} onChange={e => sv(e.target.checked)} /> {f}
                </label>
              ))}
              <button className="btn btn-sm btn-primary" onClick={handleAddFsAccess}>Add</button>
            </div>

            {/* Audit log */}
            <div className="fs-section-label">
              <button className="btn btn-sm" onClick={() => { setFsAuditTab(v=>!v); if (!fsAuditTab) fetchFsAudit() }}>
                {fsAuditTab ? '▲ Hide' : '▼ Show'} Audit Log
              </button>
            </div>
            {fsAuditTab && (
              <div className="fs-audit-log">
                {fsAudit.length === 0 ? <p className="muted-text">No audit entries.</p> : fsAudit.slice(-30).reverse().map((e,i) => (
                  <div key={i} className={`fs-audit-row ${e.allowed ? 'allowed' : 'denied'}`}>
                    <span className="fs-audit-op">{e.operation}</span>
                    <code className="fs-audit-path">{e.path}</code>
                    <span className="fs-audit-status">{e.allowed ? '✅' : '❌'}</span>
                    <span className="fs-audit-ts">{new Date(e.ts*1000).toLocaleTimeString()}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Knowledge Base Overlay ────────────────────────── */}
      {showKbPanel && (
        <div className="overlay-panel kb-panel">
          <div className="overlay-header">
            <span>📚 Knowledge Base</span>
            <button className="overlay-close" onClick={() => setShowKbPanel(false)}>✕</button>
          </div>
          <div className="overlay-body">

            <div className="agent-tabs">
              {['browse','add','config'].map(t => (
                <button key={t} className={`tab-btn ${kbTab === t ? 'active' : ''}`} onClick={() => setKbTab(t)}>
                  {t === 'browse' ? '🗂 Browse' : t === 'add' ? '+ Add' : '⚙️ Config'}
                </button>
              ))}
            </div>

            {kbTab === 'browse' && (
              <div>
                <div className="form-row" style={{marginBottom:'var(--space-3)'}}>
                  <input className="form-input" value={kbSearchQ} onChange={e=>setKbSearchQ(e.target.value)} placeholder="Search knowledge base…" onKeyDown={e=>e.key==='Enter'&&handleKbSearch()} />
                  <button className="btn btn-sm btn-primary" onClick={handleKbSearch} disabled={kbSearching}>{kbSearching?'…':'Search'}</button>
                </div>
                {kbSearchResult && <pre className="result-body" style={{maxHeight:180}}>{kbSearchResult}</pre>}

                <div className="stat-label" style={{marginBottom:'var(--space-2)'}}>
                  {kbEntries.count} chunks · {kbEntries.sources?.length || 0} sources
                </div>
                {(kbEntries.sources||[]).length === 0 && <p className="muted-text">No documents ingested yet.</p>}
                {(kbEntries.sources||[]).map(src => (
                  <div key={src} className="upload-item">
                    <span className="upload-filename">{src}</span>
                    <button className="btn-icon-danger" onClick={() => handleDeleteKbSource(src)}>🗑</button>
                  </div>
                ))}
                {kbEntries.count > 0 && (
                  <button className="btn btn-sm btn-danger" style={{marginTop:'var(--space-4)'}} onClick={handleClearKb}>🗑 Clear All</button>
                )}
              </div>
            )}

            {kbTab === 'add' && (
              <div className="agent-form">
                <div className="form-group">
                  <label className="form-label">Upload Files (PDF, TXT, MD, DOCX…)</label>
                  <input ref={kbFileRef} type="file" multiple accept=".pdf,.txt,.md,.docx,.csv,.json" onChange={handleKbFileUpload} />
                  {kbUploading && <p className="muted-text">⏳ Processing…</p>}
                </div>
                <div className="form-group">
                  <label className="form-label">Or Paste Text</label>
                  <input className="form-input" value={kbPasteName} onChange={e=>setKbPasteName(e.target.value)} placeholder="Source name (required)" />
                  <textarea className="form-textarea" rows={5} value={kbPasteText} onChange={e=>setKbPasteText(e.target.value)} placeholder="Paste text here…" style={{marginTop:'var(--space-2)'}} />
                  <input className="form-input" value={kbPasteTags} onChange={e=>setKbPasteTags(e.target.value)} placeholder="Tags (comma-sep, optional)" style={{marginTop:'var(--space-2)'}} />
                  <button className="btn btn-primary" style={{marginTop:'var(--space-3)'}} onClick={handleKbPasteIngest} disabled={kbUploading}>
                    {kbUploading ? '⏳ Ingesting…' : '📥 Ingest Text'}
                  </button>
                </div>
              </div>
            )}

            {kbTab === 'config' && (
              <div className="agent-form">
                <p className="muted-text form-hint">
                  RAG uses <code>knowledge_base_search</code> automatically.
                  Requires: <code>ollama pull nomic-embed-text</code> (274 MB, very fast).
                </p>
                <label className="flag-checkbox" style={{marginBottom:'var(--space-3)'}}>
                  <input type="checkbox" checked={kbConfig.enabled} onChange={e=>setKbConfig(p=>({...p,enabled:e.target.checked}))} /> Enable RAG
                </label>
                {[['embed_model','Embed Model','text'],['chunk_size','Chunk Size','number'],['chunk_overlap','Chunk Overlap','number'],['top_k','Top K','number'],['min_score','Min Score (0-1)','number']].map(([k,l,t]) => (
                  <div key={k} className="form-group">
                    <label className="form-label">{l}</label>
                    <input className="form-input" type={t} value={kbConfig[k]} onChange={e=>setKbConfig(p=>({...p,[k]:t==='number'?parseFloat(e.target.value):e.target.value}))} />
                  </div>
                ))}
                <button className="btn btn-primary" disabled={kbConfigSaving} onClick={handleSaveKbConfig}>{kbConfigSaving?'⏳ Saving…':'💾 Save Config'}</button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Settings Overlay ──────────────────────────────── */}
      {showSettings && (
        <div className="overlay-panel settings-panel">
          <div className="overlay-header">
            <span>⚙️ Settings</span>
            <button className="overlay-close" onClick={() => setShowSettings(false)}>✕</button>
          </div>
          <div className="overlay-body">
            <div className="agent-tabs">
              {['telegram','websearch','improver','practices'].map(t => (
                <button key={t} className={`tab-btn ${settingsTab === t ? 'active' : ''}`} onClick={() => {
                  setSettingsTab(t)
                  if (t === 'practices') { fetchBestPractices(); fetchProposals() }
                }}>
                  {t === 'telegram' ? '📱 Telegram' : t === 'websearch' ? '🌐 Web Search' : t === 'improver' ? '🔄 Self-Improver' : '📋 Practices'}
                </button>
              ))}
            </div>

            {/* Telegram */}
            {settingsTab === 'telegram' && (
              <div className="agent-form">
                <p className="settings-section-desc">
                  Control the bot via Telegram. Send <code>/run &lt;topic&gt;</code>, <code>/query &lt;q&gt;</code>, <code>/file &lt;...&gt;</code>.
                  Requires: <code>pip install "python-telegram-bot==20.7"</code>.
                  Create a bot with <code>/newbot</code> on @BotFather.
                </p>
                <div className="form-group">
                  <label className="form-label">Bot Token {tgBotSet && <span className="model-active-badge">set</span>}</label>
                  <input className="form-input" type="password" value={tgConfig.bot_token} onChange={e=>setTgConfig(p=>({...p,bot_token:e.target.value}))} placeholder={tgBotSet ? '(token saved — paste to update)' : 'Paste bot token…'} />
                </div>
                <div className="form-group">
                  <label className="form-label">Allowed Chat IDs (comma-sep)</label>
                  <input className="form-input" value={tgConfig.allowed_chat_ids} onChange={e=>setTgConfig(p=>({...p,allowed_chat_ids:e.target.value}))} placeholder="123456789, -987654321" />
                </div>
                <div className="form-group">
                  <label className="form-label">Notify Chat ID</label>
                  <input className="form-input" value={tgConfig.notify_chat_id} onChange={e=>setTgConfig(p=>({...p,notify_chat_id:e.target.value}))} placeholder="Chat ID to send reports to" />
                </div>
                <label className="flag-checkbox">
                  <input type="checkbox" checked={tgConfig.enabled} onChange={e=>setTgConfig(p=>({...p,enabled:e.target.checked}))} /> Enable Telegram Bot
                </label>
                {tgTestResult && <p className={tgTestResult.startsWith('✅') ? 'success-text' : 'error-text'} style={{marginTop:'var(--space-3)'}}>{tgTestResult}</p>}
                <div className="agent-action-group" style={{marginTop:'var(--space-4)'}}>
                  <button className="btn btn-primary" disabled={tgSaving} onClick={handleSaveTelegram}>{tgSaving?'⏳ Saving…':'💾 Save'}</button>
                  <button className="btn btn-sm" disabled={tgTesting} onClick={handleTestTelegram}>{tgTesting?'⏳ Testing…':'🧪 Test'}</button>
                </div>
                <div className="settings-section-desc" style={{marginTop:'var(--space-4)'}}>
                  <strong>Commands:</strong>
                  <table className="tg-cmd-table">
                    <tbody>
                      {[['/run <topic>', 'Start a full research job'], ['/query <q>', 'Quick question / maths'], ['/file <topic>', 'Analyse an uploaded file'], ['/status', 'Check current job status'], ['/agents', 'List all active agents'], ['/tools', 'List all active tools'], ['/model [name]', 'Show or switch active model'], ['/report', 'Resend last report as file'], ['/help', 'Show all commands']].map(([cmd, desc]) => (
                        <tr key={cmd}><td><code>{cmd}</code></td><td>{desc}</td></tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* Web Search */}
            {settingsTab === 'websearch' && (
              <div className="agent-form">
                <p className="settings-section-desc">
                  Real-time web search for agents. Install: <code>pip install duckduckgo-search</code>
                </p>
                <label className="flag-checkbox" style={{marginBottom:'var(--space-3)'}}>
                  <input type="checkbox" checked={wsConfig.enabled} onChange={e=>setWsConfig(p=>({...p,enabled:e.target.checked}))} /> Enable Web Search
                </label>
                <div className="form-group">
                  <label className="form-label">Provider</label>
                  <select className="form-input" value={wsConfig.provider} onChange={e=>setWsConfig(p=>({...p,provider:e.target.value}))}>
                    {['auto','duckduckgo','wikipedia','mock'].map(v => <option key={v} value={v}>{v}</option>)}
                  </select>
                </div>
                {[['max_results','Max Results','number'],['timeout_seconds','Timeout (s)','number'],['region','Region','text']].map(([k,l,t]) => (
                  <div key={k} className="form-group">
                    <label className="form-label">{l}</label>
                    <input className="form-input" type={t} value={wsConfig[k]} onChange={e=>setWsConfig(p=>({...p,[k]:t==='number'?parseInt(e.target.value)||0:e.target.value}))} />
                  </div>
                ))}
                <label className="flag-checkbox">
                  <input type="checkbox" checked={wsConfig.safe_search} onChange={e=>setWsConfig(p=>({...p,safe_search:e.target.checked}))} /> Safe Search
                </label>
                <label className="flag-checkbox" style={{marginTop:'var(--space-2)'}}>
                  <input type="checkbox" checked={wsConfig.fallback_to_mock} onChange={e=>setWsConfig(p=>({...p,fallback_to_mock:e.target.checked}))} /> Fallback to Mock
                </label>
                {wsTestResult && <pre className="result-body" style={{maxHeight:160,marginTop:'var(--space-3)'}}>{wsTestResult}</pre>}
                <div className="agent-action-group" style={{marginTop:'var(--space-4)'}}>
                  <button className="btn btn-primary" disabled={wsSaving} onClick={handleSaveWsConfig}>{wsSaving?'⏳ Saving…':'💾 Save'}</button>
                  <button className="btn btn-sm" disabled={wsTesting} onClick={handleTestWsProviders}>{wsTesting?'⏳…':'🧪 Test Providers'}</button>
                </div>
                <div className="form-row" style={{marginTop:'var(--space-4)'}}>
                  <input className="form-input" value={wsTestQuery} onChange={e=>setWsTestQuery(e.target.value)} placeholder="Test query…" onKeyDown={e=>e.key==='Enter'&&handleRunWsQuery()} />
                  <button className="btn btn-sm" disabled={wsTesting} onClick={handleRunWsQuery}>{wsTesting?'⏳…':'▶ Run Query'}</button>
                </div>
              </div>
            )}

            {/* Self-Improver */}
            {settingsTab === 'improver' && (
              <div className="agent-form">
                <p className="settings-section-desc">
                  Periodically reviews <code>BEST_PRACTICES.md</code> and optionally auto-improve agent/tool descriptions.
                </p>
                <label className="flag-checkbox">
                  <input type="checkbox" checked={siConfig.enabled} onChange={e=>setSiConfig(p=>({...p,enabled:e.target.checked}))} /> Enable Self-Improver
                </label>
                {[['interval_hours','Interval (hours)','number'],['min_confidence','Min Confidence (0-1)','number'],['model_override','Model Override (blank = active model)','text']].map(([k,l,t]) => (
                  <div key={k} className="form-group" style={{marginTop:'var(--space-3)'}}>
                    <label className="form-label">{l}</label>
                    <input className="form-input" type={t} value={siConfig[k]} onChange={e=>setSiConfig(p=>({...p,[k]:t==='number'?parseFloat(e.target.value)||0:e.target.value}))} />
                  </div>
                ))}
                <label className="flag-checkbox" style={{marginTop:'var(--space-3)'}}>
                  <input type="checkbox" checked={siConfig.auto_apply_safe} onChange={e=>setSiConfig(p=>({...p,auto_apply_safe:e.target.checked}))} /> Auto-apply safe proposals
                </label>
                <label className="flag-checkbox" style={{marginTop:'var(--space-2)'}}>
                  <input type="checkbox" checked={siConfig.notify_telegram} onChange={e=>setSiConfig(p=>({...p,notify_telegram:e.target.checked}))} /> Notify via Telegram
                </label>
                <div className="agent-action-group" style={{marginTop:'var(--space-4)'}}>
                  <button className="btn btn-primary" disabled={siSaving} onClick={handleSaveSiConfig}>{siSaving?'⏳ Saving…':'💾 Save'}</button>
                  <button className="btn btn-sm" disabled={siRunning} onClick={handleRunImprover}>{siRunning?'⏳ Running…':'▶ Run Now'}</button>
                </div>
              </div>
            )}

            {/* Best Practices */}
            {settingsTab === 'practices' && (
              <div className="agent-form">
                <div className="form-group">
                  <label className="form-label">BEST_PRACTICES.md</label>
                  <textarea className="form-textarea code-textarea" rows={8} value={bestPractices} onChange={e=>setBestPractices(e.target.value)} spellCheck={false} />
                  <button className="btn btn-sm btn-primary" style={{marginTop:'var(--space-2)'}} onClick={async () => {
                    try { await fetch(`${API_URL}/self-improver/best-practices`, { method:'PUT', headers:{'Content-Type':'application/json'}, body:JSON.stringify({content:bestPractices}) }); addLog('system','⚙️ System','📋 Best practices saved') } catch {}
                  }}>Save</button>
                </div>
                <div className="form-group">
                  <label className="form-label">Pending Proposals</label>
                  <pre className="result-body" style={{maxHeight:180}}>{proposals || '(none)'}</pre>
                </div>
                <div className="form-group">
                  <label className="form-label">Improvement Log</label>
                  <pre className="result-body" style={{maxHeight:180}}>{improvLog || '(empty)'}</pre>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

    </div>
  )
}

function formatBytes(b) {
  if (b < 1024) return `${b} B`
  if (b < 1048576) return `${(b/1024).toFixed(1)} KB`
  return `${(b/1048576).toFixed(1)} MB`
}
