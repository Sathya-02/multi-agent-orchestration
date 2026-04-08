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
  // FIX: default to 'websearch' to match the first rendered tab
  const [settingsTab,       setSettingsTab]       = useState('websearch')
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
      setFsConfig(d)
      setOutputDirInput(d.output_dir || '')
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
      const d = await fetch(`${API_URL}/telegram/config`).then(r=>r.json())
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
    if (msg.type === 'job_status') {
      setRunning(msg.status === 'running')
      if (msg.status === 'running')
        addLog('system','⚙️ System',`▶ Job started — model: ${msg.model}, mode: ${msg.mode}`)
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
        setFsConfig(msg.config)
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
    if (selectedModel === currentModel) return
    setModelSaving(true); setModelError(null)
    try {
      const d = await fetch(`${API_URL}/model`, { method:'POST',
        headers:{'Content-Type':'application/json'}, body:JSON.stringify({model:selectedModel}) }).then(r=>r.json())
      if (d.error) setModelError(d.error)
      else { setCurrentModel(d.active_model); addLog('system','⚙️ System',`✅ Model: ${d.active_model}`); setShowModelPanel(false) }
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

  /* ── FIX: Missing handleToggleActive ──────────────────── */
  const handleToggleActive = async (agent) => {
    const ep = agent.active === false ? 'activate' : 'deactivate'
    await fetch(`${API_URL}/agents/${agent.id}/${ep}`, { method: 'POST' })
    await fetchAgents()
  }

  /* ── FIX: Missing handleOpenSkills ───────────────────── */
  const handleOpenSkills = async (agent) => {
    setSkillsAgentId(agent.id)
    setSkillsText('')
    setAgentTab('skills')
    try {
      const d = await fetch(`${API_URL}/agents/${agent.id}/skills`).then(r => r.json())
      setSkillsText(d.content || '')
    } catch { setSkillsText('# Failed to load SKILLS.md') }
  }

  /* ── handleSaveSkills (companion to handleOpenSkills) ─── */
  const handleSaveSkills = async () => {
    if (!skillsAgentId) return
    setSkillsSaving(true)
    try {
      await fetch(`${API_URL}/agents/${skillsAgentId}/skills`, {
        method: 'PUT', headers: {'Content-Type':'application/json'},
        body: JSON.stringify({ text: skillsText }),
      })
      addLog('system','⚙️ System', `📄 SKILLS.md saved for ${skillsAgentId}`)
      await fetchAgents()
    } catch {} finally { setSkillsSaving(false) }
  }

  /* ── Spawn decisions ──────────────────────────────────── */
  const handleSpawnDecision = async (request_id, approved) => {
    await fetch(`${API_URL}/spawns/decide`, { method:'POST',
      headers:{'Content-Type':'application/json'}, body:JSON.stringify({request_id, approved}) })
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
          <button className="model-badge"
            onClick={() => { setShowModelPanel(v=>!v); setShowDashboard(false); setShowUploadPanel(false); setShowAgentEditor(false); fetchModels() }}
            style={{'--badge-color': modelBadgeColor()}} title="Change model">
            <span className="model-dot"/>
            {currentModel}
            <span className="model-chevron">{showModelPanel?'▲':'▼'}</span>
          </button>
          <div style={{width:1,height:16,background:'rgba(99,102,241,0.3)',margin:'0 6px'}}/>
          {/* FIX: Proper status dot with circle child element */}
          <div className={`status-dot ${connected ? 'connected' : ''}`}>
            <span className="status-dot-circle"/>
            {connected ? 'Connected' : 'Connecting…'}
          </div>
          {jobId && <span style={{marginLeft:8,color:'#6366f1',fontSize:11}}>Job #{jobId}</span>}
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
            <StatCard label="RAM Used" value={`${stats.ram_used_gb??'—'} GB`} sub={`of ${stats.ram_total_gb??'—'} GB`} pct={stats.ram_pct} color="#6366f1"/>
            <StatCard label="CPU" value={`${stats.cpu_pct}%`} sub="utilisation" pct={stats.cpu_pct} color="#00BFA6"/>
            <StatCard label="Disk Used" value={`${stats.disk_used_gb??'—'} GB`} sub={`of ${stats.disk_total_gb??'—'} GB`} pct={stats.disk_pct} color="#FF6584"/>
            <StatCard label="Model VRAM" value={`${stats.ollama?.vram_mb||0} MB`} sub={stats.ollama?.model||currentModel||'No model loaded'} pct={null} color="#FFC107"/>
            <StatCard label="Tokens In" value={stats.tokens_in.toLocaleString()} sub="session total" pct={null} color="#a78bfa"/>
            <StatCard label="Tokens Out" value={stats.tokens_out.toLocaleString()} sub={`last job: ${stats.tokens_last}`} pct={null} color="#34d399"/>
            <StatCard label="Active Jobs" value={stats.active_jobs} sub={`${stats.total_jobs} total`} pct={null} color="#fb7185"/>
            <StatCard label="RAM Free" value={`${stats.ram_free_gb??'—'} GB`} sub="available" pct={null} color="#38bdf8"/>
          </div>
          <div className="dashboard-model-row">
            <span>Active Model:</span>
            <span style={{color:'#a5b4fc',fontWeight:700}}>{stats.ollama?.model||currentModel||'No model loaded'}</span>
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
                {uploads.map(f => (
                  <div key={f.filename}
                    className={`upload-item ${selectedFiles.includes(f.filename) ? 'selected' : ''}`}
                    onClick={() => setSelectedFiles(p =>
                      p.includes(f.filename) ? p.filter(x=>x!==f.filename) : [...p, f.filename]
                    )}>
                    <span className="upload-item-icon">{fileIcon(f.filename)}</span>
                    <div className="upload-item-info">
                      <span className="upload-item-name">{f.filename}</span>
                      <span className="upload-item-size">{formatBytes(f.size)}</span>
                    </div>
                    <div style={{display:'flex',gap:6,alignItems:'center'}}>
                      {selectedFiles.includes(f.filename) && (
                        <span className="upload-selected-badge">✓ selected</span>
                      )}
                      <button className="upload-delete-btn"
                        onClick={e => { e.stopPropagation(); handleDeleteUpload(f.filename) }}>✕</button>
                    </div>
                  </div>
                ))}
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
              {fsConfig.access_list.length === 0 ? (
                <div style={{color:'#475569',fontSize:11,padding:'10px 0'}}>
                  No folders configured. Add a folder above to grant agents access.
                </div>
              ) : (
                <div className="fs-access-list">
                  {fsConfig.access_list.map((entry, i) => (
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
                <div style={{flex:1}}>
                  <div style={{fontSize:13,fontWeight:600,color:'var(--text)'}}>Enable Web Search</div>
                  <div style={{fontSize:11,color:'var(--tx-muted)',marginTop:2}}>
                    Agents will search the web when they need current information
                  </div>
                </div>
                <label className="toggle-switch">
                  <input type="checkbox" checked={wsConfig.enabled}
                    onChange={e => setWsConfig(c=>({...c,enabled:e.target.checked}))} />
                  <span className="toggle-track"/>
                </label>
              </div>

              <div className="form-group">
                <label>Provider</label>
                <select value={wsConfig.provider}
                  onChange={e => setWsConfig(c=>({...c,provider:e.target.value}))}>
                  <option value="auto">Auto (try all)</option>
                  <option value="duckduckgo">DuckDuckGo</option>
                  <option value="wikipedia">Wikipedia only</option>
                </select>
              </div>

              <div className="form-row">
                <div className="form-group">
                  <label>Max Results</label>
                  <input type="number" min={1} max={20} value={wsConfig.max_results}
                    onChange={e => setWsConfig(c=>({...c,max_results:+e.target.value}))} />
                </div>
                <div className="form-group">
                  <label>Timeout (s)</label>
                  <input type="number" min={5} max={60} value={wsConfig.timeout_seconds}
                    onChange={e => setWsConfig(c=>({...c,timeout_seconds:+e.target.value}))} />
                </div>
              </div>

              <div style={{display:'flex',gap:8}}>
                <button className="run-btn" style={{flex:1}} onClick={handleSaveWsConfig} disabled={wsSaving}>
                  {wsSaving ? '⟳ Saving…' : '💾 Save Config'}
                </button>
                <button className="run-btn" style={{flex:1,background:'rgba(30,41,59,.8)'}} onClick={handleTestWsProviders} disabled={wsTesting}>
                  {wsTesting ? '⟳ Testing…' : '🧪 Test Providers'}
                </button>
              </div>

              <div className="form-group">
                <label>Test Query</label>
                <div style={{display:'flex',gap:8}}>
                  <input value={wsTestQuery} onChange={e=>setWsTestQuery(e.target.value)}
                    placeholder="weather in Tokyo" style={{flex:1}} className="topic-input"
                    onKeyDown={e=>e.key==='Enter'&&handleRunWsQuery()} />
                  <button className="fs-apply-btn" onClick={handleRunWsQuery} disabled={wsTesting}>
                    {wsTesting ? '…' : '▶'}
                  </button>
                </div>
              </div>

              {wsTestResult && (
                <div className="test-result">{wsTestResult}</div>
              )}
            </div>
          )}

          {/* ── Telegram Tab ────────────────────────────── */}
          {settingsTab === 'telegram' && (
            <div className="agent-form">
              <div className="settings-section-desc" style={{fontSize:11,color:'var(--tx-muted)',lineHeight:1.6,marginBottom:4}}>
                Connect a Telegram bot to receive job notifications and send queries from your phone.
                Create a bot via <strong>@BotFather</strong> and paste the token below.
              </div>

              <div className="form-group">
                <label>Bot Token {tgBotSet && <span style={{color:'var(--success)',fontSize:10}}>● set</span>}</label>
                <input type="password" value={tgConfig.bot_token}
                  placeholder={tgBotSet ? '••••••••••• (leave blank to keep current)' : 'paste token from @BotFather'}
                  onChange={e => setTgConfig(c=>({...c,bot_token:e.target.value}))} />
              </div>

              <div className="form-group">
                <label>Allowed Chat IDs <span style={{color:'var(--tx-hint)',fontWeight:400}}>(comma-separated)</span></label>
                <input value={tgConfig.allowed_chat_ids} placeholder="123456789, 987654321"
                  onChange={e => setTgConfig(c=>({...c,allowed_chat_ids:e.target.value}))} />
              </div>

              <div className="form-group">
                <label>Notify Chat ID <span style={{color:'var(--tx-hint)',fontWeight:400}}>(receives job completion messages)</span></label>
                <input value={tgConfig.notify_chat_id} placeholder="123456789"
                  onChange={e => setTgConfig(c=>({...c,notify_chat_id:e.target.value}))} />
              </div>

              <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',padding:'8px 12px',
                background:'rgba(99,102,241,.06)',border:'1px solid rgba(99,102,241,.2)',borderRadius:8,marginBottom:4}}>
                <span style={{fontSize:13,fontWeight:600}}>Enable Bot</span>
                <label className="toggle-switch">
                  <input type="checkbox" checked={tgConfig.enabled}
                    onChange={e => setTgConfig(c=>({...c,enabled:e.target.checked}))} />
                  <span className="toggle-track"/>
                </label>
              </div>

              <div style={{display:'flex',gap:8}}>
                <button className="run-btn" style={{flex:1}} onClick={handleSaveTelegram} disabled={tgSaving}>
                  {tgSaving ? '⟳ Saving…' : '💾 Save'}
                </button>
                <button className="run-btn" style={{flex:1,background:'rgba(30,41,59,.8)'}} onClick={handleTestTelegram} disabled={tgTesting||!tgBotSet}>
                  {tgTesting ? '⟳ Sending…' : '📨 Test Message'}
                </button>
              </div>

              {tgTestResult && <div className="test-result">{tgTestResult}</div>}
            </div>
          )}

          {/* ── Self-Improver Tab ────────────────────────── */}
          {settingsTab === 'improver' && (
            <div className="agent-form">
              <div className="settings-section-desc" style={{fontSize:11,color:'var(--tx-muted)',lineHeight:1.6,marginBottom:4}}>
                The self-improver analyses completed jobs and proposes improvements to agent prompts,
                tool configs, and best practices. Safe changes are applied automatically; risky ones
                require your approval.
              </div>

              <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',padding:'8px 12px',
                background:'rgba(99,102,241,.06)',border:'1px solid rgba(99,102,241,.2)',borderRadius:8}}>
                <span style={{fontSize:13,fontWeight:600}}>Enable Self-Improver</span>
                <label className="toggle-switch">
                  <input type="checkbox" checked={siConfig.enabled}
                    onChange={e => setSiConfig(c=>({...c,enabled:e.target.checked}))} />
                  <span className="toggle-track"/>
                </label>
              </div>

              <div className="form-row">
                <div className="form-group">
                  <label>Run interval (hours)</label>
                  <input type="number" min={1} max={168} value={siConfig.interval_hours}
                    onChange={e => setSiConfig(c=>({...c,interval_hours:+e.target.value}))} />
                </div>
                <div className="form-group">
                  <label>Min confidence</label>
                  <input type="number" min={0} max={1} step={0.05} value={siConfig.min_confidence}
                    onChange={e => setSiConfig(c=>({...c,min_confidence:+e.target.value}))} />
                </div>
              </div>

              <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',padding:'8px 12px',
                background:'rgba(99,102,241,.06)',border:'1px solid rgba(99,102,241,.2)',borderRadius:8}}>
                <span style={{fontSize:13,fontWeight:600}}>Auto-apply safe changes</span>
                <label className="toggle-switch">
                  <input type="checkbox" checked={siConfig.auto_apply_safe}
                    onChange={e => setSiConfig(c=>({...c,auto_apply_safe:e.target.checked}))} />
                  <span className="toggle-track"/>
                </label>
              </div>

              <div style={{display:'flex',gap:8}}>
                <button className="run-btn" style={{flex:1}} onClick={handleSaveSiConfig} disabled={siSaving}>
                  {siSaving ? '⟳ Saving…' : '💾 Save Config'}
                </button>
                <button className="run-btn" style={{flex:1,background:'rgba(30,41,59,.8)'}} onClick={handleRunImprover} disabled={siRunning}>
                  {siRunning ? '⟳ Running…' : '▶ Run Now'}
                </button>
              </div>
            </div>
          )}

          {/* ── Best Practices Tab ──────────────────────── */}
          {settingsTab === 'practices' && (
            <div className="agent-form">
              <div className="form-group">
                <label>best_practices.md</label>
                <textarea rows={10} style={{fontFamily:'var(--mono)',fontSize:11,lineHeight:1.55,resize:'vertical'}}
                  value={bestPractices} readOnly />
              </div>
              <div className="form-group">
                <label>Improvement Proposals</label>
                <textarea rows={8} style={{fontFamily:'var(--mono)',fontSize:11,lineHeight:1.55,resize:'vertical'}}
                  value={proposals} readOnly />
              </div>
              <div className="form-group">
                <label>Improvement Log</label>
                <textarea rows={6} style={{fontFamily:'var(--mono)',fontSize:11,lineHeight:1.55,resize:'vertical'}}
                  value={improvLog} readOnly />
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

/* ── Utility helpers ──────────────────────────────────────────────────────── */
function fileIcon(name) {
  const ext = name.split('.').pop().toLowerCase()
  const map = { pdf:'📄', docx:'📝', doc:'📝', txt:'📃', csv:'📊', xlsx:'📊', xls:'📊', json:'🔧', md:'📋', log:'🗒️' }
  return map[ext] || '📁'
}

function formatBytes(bytes) {
  if (!bytes) return '0 B'
  const k = 1024
  const sizes = ['B','KB','MB','GB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`
}

function StatCard({ label, value, sub, pct, color }) {
  return (
    <div className="stat-card">
      <div className="stat-card-label">{label}</div>
      <div className="stat-card-value" style={{color}}>{value}</div>
      {sub && <div className="stat-card-sub">{sub}</div>}
      {pct != null && (
        <div className="stat-bar">
          <div className="stat-bar-fill" style={{width:`${Math.min(pct,100)}%`,background:color}}/>
        </div>
      )}
    </div>
  )
}
