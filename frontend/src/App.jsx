import { useState, useEffect, useRef, useCallback } from 'react'
import AgentScene3D from './components/AgentScene3D'
import ActivityFeed from './components/ActivityFeed'
import AgentCard    from './components/AgentCard'
import AppHeader    from './components/AppHeader'
import InfoBar      from './components/InfoBar'
import SidePanel    from './components/SidePanel'
import StatCard     from './components/ui/StatCard'
import { useWebSocket } from './hooks/useWebSocket'
import { useStats }     from './hooks/useStats'
import { API_URL, PHASE_ORDER, BUILTIN, MODES } from './utils/constants'
import './styles/App.css'

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

  /* ── Dashboard / 3-D state ───────────────────────────── */
  const [showDashboard, setShowDashboard] = useState(false)
  const [show3DRoom,    setShow3DRoom]    = useState(false)

  /* ── Agent editor state ──────────────────────────────── */
  const [agents,          setAgents]          = useState([])
  const [showAgentEditor, setShowAgentEditor] = useState(false)
  const [editingAgent,    setEditingAgent]    = useState(null)
  const [newAgentForm,    setNewAgentForm]    = useState({ label:'', role:'', goal:'', backstory:'', icon:'🤖', color:'#a78bfa' })
  const [agentTab,        setAgentTab]        = useState('list')
  const [skillsText,      setSkillsText]      = useState('')
  const [skillsSaving,    setSkillsSaving]    = useState(false)
  const [skillsAgentId,   setSkillsAgentId]   = useState(null)

  /* ── Filesystem config state ─────────────────────────── */
  const [showFsPanel,    setShowFsPanel]    = useState(false)
  const [fsConfig,       setFsConfig]       = useState({ access_list: [], output_dir: null })
  const [fsAudit,        setFsAudit]        = useState([])
  const [fsAuditTab,     setFsAuditTab]     = useState(false)
  const [newFsPath,      setNewFsPath]      = useState('')
  const [newFsRead,      setNewFsRead]      = useState(true)
  const [newFsWrite,     setNewFsWrite]     = useState(false)
  const [newFsEdit,      setNewFsEdit]      = useState(false)
  const [newFsLabel,     setNewFsLabel]     = useState('')
  const [outputDirInput, setOutputDirInput] = useState('')
  const [fsError,        setFsError]        = useState(null)
  const [spawnRequests,  setSpawnRequests]  = useState([])
  const [spawnEnabled,   setSpawnEnabled]   = useState(true)
  const [spawnToggling,  setSpawnToggling]  = useState(false)

  /* ── Tool state ──────────────────────────────────────── */
  const [tools,         setTools]         = useState([])
  const [showToolPanel, setShowToolPanel] = useState(false)
  const [toolTab,       setToolTab]       = useState('list')
  const [editingTool,   setEditingTool]   = useState(null)
  const [toolMdText,    setToolMdText]    = useState('')
  const [toolMdId,      setToolMdId]      = useState(null)
  const [toolMdSaving,  setToolMdSaving]  = useState(false)
  const [toolSpawnReqs, setToolSpawnReqs] = useState([])
  const [newToolForm,   setNewToolForm]   = useState({
    name:'', display_name:'', description:'',
    tags:'', code:'    return str(input_data)'
  })

  /* ── Settings / Telegram / Self-Improver state ───────── */
  const [showSettings,  setShowSettings]  = useState(false)
  const [settingsTab,   setSettingsTab]   = useState('telegram')
  const [tgConfig,      setTgConfig]      = useState({ bot_token:'', allowed_chat_ids:'', notify_chat_id:'', enabled:false })
  const [tgSaving,      setTgSaving]      = useState(false)
  const [tgTesting,     setTgTesting]     = useState(false)
  const [tgTestResult,  setTgTestResult]  = useState(null)
  const [tgBotSet,      setTgBotSet]      = useState(false)
  const [siConfig,      setSiConfig]      = useState({ enabled:true, interval_hours:6, auto_apply_safe:true, notify_telegram:true, min_confidence:0.7, model_override:'' })
  const [siSaving,      setSiSaving]      = useState(false)
  const [siRunning,     setSiRunning]     = useState(false)
  const [bestPractices, setBestPractices] = useState('')
  const [proposals,     setProposals]     = useState('')
  const [improvLog,     setImprovLog]     = useState('')

  /* ── Web Search state ────────────────────────────────── */
  const [wsConfig,     setWsConfig]     = useState({ enabled:false, provider:'auto', max_results:5, timeout_seconds:10, safe_search:true, region:'wt-wt', fallback_to_mock:true })
  const [wsSaving,     setWsSaving]     = useState(false)
  const [wsTesting,    setWsTesting]    = useState(false)
  const [wsTestResult, setWsTestResult] = useState(null)
  const [wsTestQuery,  setWsTestQuery]  = useState('weather in Tokyo')

  /* ── Knowledge Base / RAG state ─────────────────────── */
  const [showKbPanel,    setShowKbPanel]    = useState(false)
  const [kbTab,          setKbTab]          = useState('browse')
  const [kbEntries,      setKbEntries]      = useState({ entries:[], sources:[], count:0 })
  const [kbConfig,       setKbConfig]       = useState({ enabled:true, embed_model:'nomic-embed-text', chunk_size:400, chunk_overlap:80, top_k:4, min_score:0.25, use_ollama_embed:true })
  const [kbConfigSaving, setKbConfigSaving] = useState(false)
  const [kbUploading,    setKbUploading]    = useState(false)
  const [kbSearchQ,      setKbSearchQ]      = useState('')
  const [kbSearchResult, setKbSearchResult] = useState(null)
  const [kbSearching,    setKbSearching]    = useState(false)
  const [kbPasteText,    setKbPasteText]    = useState('')
  const [kbPasteName,    setKbPasteName]    = useState('')
  const [kbPasteTags,    setKbPasteTags]    = useState('')
  const kbFileRef = useRef(null)

  const [ragQuery,   setRagQuery]   = useState('')
  const [ragTopK,    setRagTopK]    = useState(4)
  const [ragLoading, setRagLoading] = useState(false)
  const [ragResult,  setRagResult]  = useState(null)

  const activeTimer = useRef(null)

  /* ── Custom hooks ────────────────────────────────────── */
  const { stats } = useStats()

  // Models polling — refresh every 15 s while the model panel is open
  useEffect(() => {
    if (!showModelPanel) return
    fetchModels()
    const id = setInterval(fetchModels, 15_000)
    return () => clearInterval(id)
  }, [showModelPanel])

  /* ── Init ────────────────────────────────────────────── */
  useEffect(() => {
    fetchModels(); fetchUploads(); fetchAgents(); fetchSpawnSettings()
    fetchFsConfig(); fetchTools(); fetchToolSpawns(); fetchTelegramConfig()
    fetchSiConfig(); fetchWsConfig(); fetchKbEntries(); fetchKbConfig()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  /* ── WebSocket ───────────────────────────────────────── */
  const handleMessage = useCallback((msg) => {
    if (msg.type === 'agent_working') {
      setCurrentWorker(msg)
    }
    if (msg.type === 'agent_activity') {
      const { agent, label, message, ts, phase, task_result } = msg
      if (phase) setCurrentPhase(agent)
      setActiveAgent(agent)
      addLog(agent, label, message, !!phase, ts, !!task_result)
      setLastMessages(p => ({ ...p, [agent]: message }))
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
        addLog('system', '⚙️ System', `▶ Job started — model: ${msg.model||''}, mode: ${msg.mode||''}`, true)
    }
    if (msg.type === 'job_done') {
      setRunning(false); setResult(msg.result); setReportFile(msg.filename)
      setReportFormat(msg.format || 'md')
      setActiveAgent(null); setCurrentPhase(null); setCurrentWorker(null)
      addLog('system', '⚙️ System', `✅ Report complete — ${msg.filename} (${(msg.format||'md').toUpperCase()})`)
    }
    if (msg.type === 'job_failed') {
      setRunning(false); setActiveAgent(null); setCurrentPhase(null); setCurrentWorker(null)
      addLog('system', '⚙️ System', `❌ ${msg.reason || 'Job failed — try a larger model'}`)
    }
    if (msg.type === 'spawn_request') {
      setSpawnRequests(p => [...p, msg])
      addLog('system', '⚙️ System', msg.message, false)
    }
    if (msg.type === 'agents_updated' || msg.type === 'agent_created' || msg.type === 'agent_deleted') {
      fetchAgents()
    }
    if (msg.type === 'fs_config_updated') {
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
      addLog('system', '⚙️ System', `🔧 Agent requests new tool: '${msg.suggestion?.name||'?'}' — awaiting approval`)
    }
    if (['tool_created','tool_updated','tool_deleted','tools_updated'].includes(msg.type)) {
      fetchTools()
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const { connected: wsConnected } = useWebSocket({
    onOpen:    () => { fetchAgents(); fetchTools() },
    onMessage: handleMessage,
  })

  useEffect(() => { setConnected(wsConnected) }, [wsConnected])

  /* ── Helpers ─────────────────────────────────────────── */
  const addLog = useCallback((agent, label, message, phase = false, ts = null, taskResult = false) =>
    setLogs(prev => {
      const last = prev[prev.length - 1]
      if (last && last.agent === agent && last.message === message) return prev
      return [...prev.slice(-150), { agent, label, message, phase, taskResult, ts: ts || Date.now() / 1000 }]
    }), [])

  /* ── Fetch functions ─────────────────────────────────── */
  const fetchModels = async () => {
    try {
      const d = await fetch(`${API_URL}/models`).then(r => r.json())
      const raw = d.models || d.installed || []
      const installed = raw
        .filter(m => typeof m === 'string' || m.pulled === true)
        .map(m => typeof m === 'string' ? m : (m.name || m.id || String(m)))
      const active = typeof d.active_model === 'string'
        ? d.active_model
        : (d.active_model?.name || d.active || '')
      setAvailableModels(installed)
      if (active) setCurrentModel(active)
    } catch {}
  }

  const fetchUploads = async () => {
    try { setUploads(await fetch(`${API_URL}/uploads`).then(r => r.json())) } catch {}
  }

  const fetchAgents = async () => {
    try {
      const d = await fetch(`${API_URL}/agents`).then(r => r.json())
      setAgents(Array.isArray(d) ? d : (d.agents || []))
    } catch {}
  }

  const fetchSpawnSettings = async () => {
    try {
      const d = await fetch(`${API_URL}/spawn-settings`).then(r => r.json())
      if (typeof d.spawn_enabled === 'boolean') setSpawnEnabled(d.spawn_enabled)
    } catch {}
  }

  const fetchFsConfig = async () => {
    try {
      const d = await fetch(`${API_URL}/fs-config`).then(r => r.json())
      setFsConfig({ output_dir: null, ...d, access_list: Array.isArray(d.access_list) ? d.access_list : [] })
      setOutputDirInput(d.output_dir || '')
    } catch {
      setFsConfig(prev => ({ ...prev, access_list: Array.isArray(prev.access_list) ? prev.access_list : [] }))
    }
  }

  const fetchFsAudit = async () => {
    try {
      const d = await fetch(`${API_URL}/fs-config/audit`).then(r => r.json())
      setFsAudit(d.audit || [])
    } catch {}
  }

  const fetchTools = async () => {
    try {
      const d = await fetch(`${API_URL}/tools`).then(r => r.json())
      setTools(Array.isArray(d) ? d : (d.tools || []))
    } catch {}
  }

  const fetchToolSpawns = async () => {
    try {
      const d = await fetch(`${API_URL}/tool-spawns`).then(r => r.json())
      if (d.pending) setToolSpawnReqs(d.pending)
    } catch {}
  }

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

  const fetchSiConfig = async () => {
    try {
      const d = await fetch(`${API_URL}/self-improver/config`).then(r => r.json())
      if (!d.error) setSiConfig(d)
    } catch {}
  }

  const fetchBestPractices = async () => {
    try {
      const d = await fetch(`${API_URL}/self-improver/best-practices`).then(r => r.json())
      setBestPractices(d.content || '')
    } catch {}
  }

  const fetchProposals = async () => {
    try {
      const [dp, dl] = await Promise.all([
        fetch(`${API_URL}/self-improver/proposals`).then(r => r.json()),
        fetch(`${API_URL}/self-improver/log`).then(r => r.json()),
      ])
      setProposals(dp.content || '')
      setImprovLog(dl.content || '')
    } catch {}
  }

  const fetchWsConfig = async () => {
    try {
      const d = await fetch(`${API_URL}/web-search/config`).then(r => r.json())
      if (!d.error) setWsConfig(d)
    } catch {}
  }

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

  /* ── Handlers ────────────────────────────────────────── */
  const handleRun = async () => {
    if (!topic.trim() || running) return
    setResult(null); setReportFile(null); setReportFormat('md'); setLogs([]); setRunning(true); setCurrentPhase(null)
    const res  = await fetch(`${API_URL}/run`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ topic, mode, uploaded_files: selectedFiles }),
    })
    const data = await res.json()
    setJobId(data.job_id)
  }

  const handleDownload = () => {
    if (!reportFile) return
    const a = document.createElement('a')
    a.href = `${API_URL}/reports/${reportFile}`; a.download = reportFile; a.click()
  }

  const handleModelChange = async () => {
    const currentStr = typeof currentModel === 'string' ? currentModel : ''
    if (selectedModel === currentStr) return
    setModelSaving(true); setModelError(null)
    try {
      const d = await fetch(`${API_URL}/models/select`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: selectedModel }),
      }).then(r => r.json())
      if (d.error) setModelError(d.error)
      else {
        const mRaw = d.active_model || d.model
        const m = typeof mRaw === 'string' ? mRaw : (mRaw?.name || mRaw?.id || selectedModel)
        setCurrentModel(m); setSelectedModel(m)
        addLog('system', '⚙️ System', `✅ Model switched to: ${m}`)
        setShowModelPanel(false)
      }
    } catch { setModelError('Failed') } finally { setModelSaving(false) }
  }

  const handleFileUpload = async (e) => {
    const files = Array.from(e.target.files)
    if (!files.length) return
    setUploading(true)
    for (const f of files) {
      const fd = new FormData(); fd.append('file', f)
      try { await fetch(`${API_URL}/upload`, { method: 'POST', body: fd }) } catch {}
    }
    await fetchUploads()
    setUploading(false)
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  const handleDeleteUpload = async (filename) => {
    await fetch(`${API_URL}/uploads/${encodeURIComponent(filename)}`, { method: 'DELETE' })
    await fetchUploads()
    setSelectedFiles(p => p.filter(f => f !== filename))
  }

  const handleAddFsAccess = async () => {
    if (!newFsPath.trim()) return
    setFsError(null)
    try {
      const d = await fetch(`${API_URL}/fs-config/access`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: newFsPath.trim(), read: newFsRead, write: newFsWrite, edit: newFsEdit, label: newFsLabel.trim() }),
      }).then(r => r.json())
      if (d.error) { setFsError(d.error); return }
      setNewFsPath(''); setNewFsLabel('')
      await fetchFsConfig()
    } catch { setFsError('Failed to add access entry') }
  }

  const handleRemoveFsAccess = async (path) => {
    await fetch(`${API_URL}/fs-config/access?path=${encodeURIComponent(path)}`, { method: 'DELETE', headers: { 'Accept': 'application/json' } })
    await fetchFsConfig()
  }

  const handleToggleFsFlag = async (path, flag, current) => {
    await fetch(`${API_URL}/fs-config/access`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ path, [flag]: !current }),
    })
    await fetchFsConfig()
  }

  const handleSetOutputDir = async () => {
    setFsError(null)
    try {
      const d = await fetch(`${API_URL}/fs-config/output-dir`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: outputDirInput.trim() }),
      }).then(r => r.json())
      if (d.error) { setFsError(d.error); return }
      await fetchFsConfig()
      addLog('system', '⚙️ System', outputDirInput.trim() ? `📂 Output directory set: ${outputDirInput.trim()}` : '📂 Output directory cleared')
    } catch { setFsError('Failed to set output directory') }
  }

  const handleToggleSpawn = async () => {
    setSpawnToggling(true)
    try {
      const d = await fetch(`${API_URL}/spawn-settings`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled: !spawnEnabled }),
      }).then(r => r.json())
      if (typeof d.spawn_enabled === 'boolean') setSpawnEnabled(d.spawn_enabled)
    } catch {} finally { setSpawnToggling(false) }
  }

  const handleCreateAgent = async () => {
    if (!newAgentForm.role.trim()) return
    const res  = await fetch(`${API_URL}/agents`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(newAgentForm),
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
      method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(editingAgent)
    })
    await fetchAgents()
    setEditingAgent(null); setAgentTab('list')
  }

  const handleDeleteAgent = async (id) => {
    await fetch(`${API_URL}/agents/${id}`, { method: 'DELETE' })
    await fetchAgents()
  }

  const handleToggleActive = async (agent) => {
    const ep = agent.active === false ? 'activate' : 'deactivate'
    await fetch(`${API_URL}/agents/${agent.id}/${ep}`, { method: 'POST' })
    await fetchAgents()
  }

  const handleOpenSkills = async (agent) => {
    setSkillsAgentId(agent.id); setSkillsText(''); setAgentTab('skills'); setShowAgentEditor(true)
    try {
      const d = await fetch(`${API_URL}/agents/${agent.id}/skills`).then(r => r.json())
      setSkillsText(d.content || '')
    } catch { setSkillsText('# Failed to load SKILLS.md') }
  }

  const handleSaveSkills = async () => {
    if (!skillsAgentId) return
    setSkillsSaving(true)
    try {
      await fetch(`${API_URL}/agents/${skillsAgentId}/skills`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: skillsText }),
      })
      addLog('system', '⚙️ System', `📄 SKILLS.md saved for ${skillsAgentId}`)
      await fetchAgents()
    } catch {
      addLog('system', '⚙️ System', `❌ Failed to save SKILLS.md for ${skillsAgentId}`)
    } finally { setSkillsSaving(false) }
  }

  const handleSpawnDecision = async (request_id, approved) => {
    await fetch(`${API_URL}/spawns/decide`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ request_id, approved })
    })
    setSpawnRequests(p => p.filter(r => r.request_id !== request_id))
    await fetchAgents()
  }

  const handleCreateTool = async () => {
    if (!newToolForm.name.trim()) return
    const payload = { ...newToolForm, tags: newToolForm.tags ? newToolForm.tags.split(',').map(t => t.trim()).filter(Boolean) : [] }
    const d = await fetch(`${API_URL}/tools`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload),
    }).then(r => r.json())
    if (d.duplicate) addLog('system', '⚙️ System', `⚠️ Tool '${newToolForm.name}' already exists.`)
    else { setNewToolForm({ name:'', display_name:'', description:'', tags:'', code:'    return str(input_data)' }); setToolTab('list') }
    await fetchTools()
  }

  const handleUpdateTool = async () => {
    if (!editingTool) return
    await fetch(`${API_URL}/tools/${editingTool.id}`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(editingTool),
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
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: toolMdText }),
      })
      addLog('system', '⚙️ System', `📄 TOOL.md saved for ${toolMdId}`)
      await fetchTools()
    } catch {} finally { setToolMdSaving(false) }
  }

  const handleToolSpawnDecision = async (request_id, approved) => {
    await fetch(`${API_URL}/tool-spawns/decide`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ request_id, approved }),
    })
    setToolSpawnReqs(p => p.filter(r => r.request_id !== request_id))
    await fetchTools()
  }

  const handleSaveTelegram = async () => {
    setTgSaving(true); setTgTestResult(null)
    try {
      const payload = {
        bot_token:        tgConfig.bot_token || undefined,
        allowed_chat_ids: tgConfig.allowed_chat_ids ? tgConfig.allowed_chat_ids.split(',').map(s => s.trim()).filter(Boolean) : [],
        notify_chat_id:   tgConfig.notify_chat_id,
        enabled:          tgConfig.enabled,
      }
      const d = await fetch(`${API_URL}/telegram/config`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload)
      }).then(r => r.json())
      if (d.error) setTgTestResult(`❌ ${d.error}`)
      else { setTgTestResult('✅ Configuration saved'); setTgBotSet(true); await fetchTelegramConfig() }
    } catch (e) { setTgTestResult(`❌ ${e}`) } finally { setTgSaving(false) }
  }

  const handleTestTelegram = async () => {
    setTgTesting(true); setTgTestResult(null)
    try {
      const d = await fetch(`${API_URL}/telegram/test`, { method: 'POST' }).then(r => r.json())
      setTgTestResult(d.error ? `❌ ${d.error}` : '✅ Test message sent! Check your Telegram.')
    } catch (e) { setTgTestResult(`❌ ${e}`) } finally { setTgTesting(false) }
  }

  const handleSaveSiConfig = async () => {
    setSiSaving(true)
    try {
      await fetch(`${API_URL}/self-improver/config`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(siConfig)
      })
      addLog('system', '⚙️ System', '✅ Self-improver config saved')
    } catch {} finally { setSiSaving(false) }
  }

  const handleRunImprover = async () => {
    setSiRunning(true)
    try {
      await fetch(`${API_URL}/self-improver/run-now`, { method: 'POST' })
      addLog('system', '⚙️ System', '🔄 Self-improvement cycle triggered…')
    } catch {} finally { setTimeout(() => setSiRunning(false), 3000) }
  }

  const handleSaveWsConfig = async () => {
    setWsSaving(true); setWsTestResult(null)
    try {
      const d = await fetch(`${API_URL}/web-search/config`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(wsConfig),
      }).then(r => r.json())
      setWsTestResult(d.error ? `❌ ${d.error}` : '✅ Configuration saved')
    } catch (e) { setWsTestResult(`❌ ${e}`) } finally { setWsSaving(false) }
  }

  const handleTestWsProviders = async () => {
    setWsTesting(true); setWsTestResult(null)
    try {
      const d = await fetch(`${API_URL}/web-search/test`, { method: 'POST' }).then(r => r.json())
      if (d.error) { setWsTestResult(`❌ ${d.error}`); return }
      const lines = Object.entries(d.providers || {}).map(([k, v]) => `${v === 'ok' ? '✅' : '⚠️'} ${k}: ${v}`)
      setWsTestResult(lines.join('\n'))
    } catch (e) { setWsTestResult(`❌ ${e}`) } finally { setWsTesting(false) }
  }

  const handleRunWsQuery = async () => {
    if (!wsTestQuery.trim()) return
    setWsTesting(true); setWsTestResult(null)
    try {
      const d = await fetch(`${API_URL}/web-search/query?q=${encodeURIComponent(wsTestQuery)}`).then(r => r.json())
      setWsTestResult(d.error ? `❌ ${d.error}` : `Query: "${d.query}"\n\n${d.result}`)
    } catch (e) { setWsTestResult(`❌ ${e}`) } finally { setWsTesting(false) }
  }

  const handleSaveKbConfig = async () => {
    setKbConfigSaving(true)
    try {
      await fetch(`${API_URL}/kb/config`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(kbConfig),
      })
      addLog('system', '📚 KB', '✅ Knowledge base config saved')
    } catch {} finally { setKbConfigSaving(false) }
  }

  const handleKbFileUpload = async (e) => {
    const files = Array.from(e.target.files)
    if (!files.length) return
    setKbUploading(true)
    for (const f of files) {
      const fd = new FormData(); fd.append('file', f); fd.append('tags', kbPasteTags || '')
      try {
        const d = await fetch(`${API_URL}/kb/ingest-file`, { method: 'POST', body: fd }).then(r => r.json())
        addLog('system', '📚 KB', d.message || `Ingested ${f.name}`)
      } catch { addLog('system', '📚 KB', `❌ Failed: ${f.name}`) }
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
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: kbPasteText, source_name: kbPasteName, tags: kbPasteTags ? kbPasteTags.split(',').map(t => t.trim()).filter(Boolean) : [] }),
      }).then(r => r.json())
      addLog('system', '📚 KB', d.message || 'Ingested text')
      setKbPasteText(''); setKbPasteName(''); setKbPasteTags('')
      await fetchKbEntries()
    } catch {} finally { setKbUploading(false) }
  }

  const handleDeleteKbSource = async (source) => {
    if (!window.confirm(`Remove all chunks from "${source}"?`)) return
    await fetch(`${API_URL}/kb/sources/${encodeURIComponent(source)}`, { method: 'DELETE' })
    await fetchKbEntries()
  }

  const handleClearKb = async () => {
    if (!window.confirm('Clear the entire knowledge base? This cannot be undone.')) return
    await fetch(`${API_URL}/kb/clear`, { method: 'POST' })
    await fetchKbEntries()
  }

  const handleKbSearch = async () => {
    if (!kbSearchQ.trim()) return
    setKbSearching(true); setKbSearchResult(null)
    try {
      const d = await fetch(`${API_URL}/kb/search?q=${encodeURIComponent(kbSearchQ)}`).then(r => r.json())
      setKbSearchResult(d.result || d.error)
    } catch (e) { setKbSearchResult(`Error: ${e}`) } finally { setKbSearching(false) }
  }

  const handleRagQuery = async () => {
    if (!ragQuery.trim()) return
    setRagLoading(true); setRagResult(null)
    try {
      const d = await fetch(`${API_URL}/kb/query`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: ragQuery, top_k: ragTopK }),
      }).then(r => r.json())
      setRagResult(d)
    } catch (e) { console.error('RAG query failed', e) } finally { setRagLoading(false) }
  }

  /* ── Derived ─────────────────────────────────────────── */
  const modelBadgeColor = () => {
    const m = typeof currentModel === 'string' ? currentModel : ''
    if (m.includes('llama3') || m.includes('mistral') || m.includes('qwen')) return '#22c55e'
    if (m.includes('phi3')   || m.includes('gemma'))                         return '#f59e0b'
    return '#6366f1'
  }

  const pendingSpawns     = spawnRequests.filter(r => !r._resolved)
  const pendingToolSpawns = toolSpawnReqs.filter(r => !r._resolved)

  /* ── Render ──────────────────────────────────────────── */
  return (
    <div className="app-container">

      {/* ── Header ────────────────────────────────────── */}
      <AppHeader
        connected={connected} currentModel={currentModel} jobId={jobId}
        showDashboard={showDashboard}     setShowDashboard={setShowDashboard}
        showUploadPanel={showUploadPanel} setShowUploadPanel={setShowUploadPanel}
        showFsPanel={showFsPanel}         setShowFsPanel={setShowFsPanel}
        showKbPanel={showKbPanel}         setShowKbPanel={setShowKbPanel}
        showToolPanel={showToolPanel}     setShowToolPanel={setShowToolPanel}
        showAgentEditor={showAgentEditor} setShowAgentEditor={setShowAgentEditor}
        showModelPanel={showModelPanel}   setShowModelPanel={setShowModelPanel}
        showSettings={showSettings}       setShowSettings={setShowSettings}
        uploads={uploads} agents={agents} tools={tools} kbEntries={kbEntries}
        pendingSpawns={pendingSpawns} pendingToolSpawns={pendingToolSpawns}
        modelBadgeColor={modelBadgeColor}
        fetchModels={fetchModels} fetchFsConfig={fetchFsConfig}
        fetchKbEntries={fetchKbEntries} fetchKbConfig={fetchKbConfig}
        fetchTelegramConfig={fetchTelegramConfig} fetchSiConfig={fetchSiConfig}
        fetchBestPractices={fetchBestPractices} fetchProposals={fetchProposals}
      />

      {/* ── Info bar ──────────────────────────────────── */}
      <InfoBar
        connected={connected} currentModel={currentModel} currentPhase={currentPhase}
        running={running} stats={stats} jobId={jobId}
        show3DRoom={show3DRoom} setShow3DRoom={setShow3DRoom}
        modelBadgeColor={modelBadgeColor}
      />

      {/* ── Dashboard Overlay ─────────────────────────── */}
      {showDashboard && stats && (
        <>
          <div className="overlay-backdrop" onClick={() => setShowDashboard(false)} />
          <div className="overlay-panel dashboard-panel">
            <div className="overlay-header">
              <span>📊 System Dashboard</span>
              <button className="overlay-close" onClick={() => setShowDashboard(false)}>✕</button>
            </div>
            <div className="dashboard-grid">
              <StatCard label="RAM Used"   value={`${stats.ram_used_gb} GB`}  sub={`of ${stats.ram_total_gb} GB`}       pct={stats.ram_pct}  color="#6366f1"/>
              <StatCard label="CPU"        value={`${stats.cpu_pct}%`}         sub="utilisation"                          pct={stats.cpu_pct}  color="#00BFA6"/>
              <StatCard label="Disk Used"  value={`${stats.disk_used_gb} GB`} sub={`of ${stats.disk_total_gb} GB`}      pct={stats.disk_pct} color="#FF6584"/>
              <StatCard label="Model VRAM" value={`${stats.ollama?.vram_mb||0} MB`} sub={stats.ollama?.model||currentModel} pct={null}           color="#FFC107"/>
              <StatCard label="Tokens In"  value={stats.tokens_in.toLocaleString()} sub="session total"                   pct={null}           color="#a78bfa"/>
              <StatCard label="Tokens Out" value={stats.tokens_out.toLocaleString()} sub={`last job: ${stats.tokens_last}`} pct={null}          color="#34d399"/>
              <StatCard label="Active Jobs" value={stats.active_jobs} sub={`${stats.total_jobs} total`}                  pct={null}           color="#fb7185"/>
              <StatCard label="RAM Free"   value={`${stats.ram_free_gb} GB`}  sub="available"                            pct={null}           color="#38bdf8"/>
            </div>
            <div className="dashboard-model-row">
              <span>Active Model:</span>
              <span style={{ color: '#a5b4fc', fontWeight: 700 }}>{stats.ollama?.model || currentModel}</span>
              <span style={{ color: '#475569', marginLeft: 'auto' }}>Refreshes every 3s</span>
            </div>
          </div>
        </>
      )}

      {/* ── File Upload Overlay ────────────────────────── */}
      {showUploadPanel && (
        <>
          <div className="overlay-backdrop" onClick={() => setShowUploadPanel(false)} />
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
              <input ref={fileInputRef} type="file" multiple style={{ display: 'none' }}
                accept=".pdf,.docx,.txt,.csv,.xlsx,.json,.md,.log"
                onChange={handleFileUpload} />
              {uploads.length > 0 && (
                <div className="upload-list">
                  <div className="upload-list-header">
                    <span>Uploaded Files</span>
                    <span style={{ color: '#475569' }}>{uploads.length} file{uploads.length > 1 ? 's' : ''}</span>
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
                        <span className="upload-item-icon">{fname.endsWith('.pdf') ? '📄' : fname.endsWith('.csv') ? '📊' : '📎'}</span>
                        <span className="upload-item-name">{fname}</span>
                        {isSelected && <span className="upload-item-check">✓</span>}
                        <button className="upload-item-del"
                          onClick={e => { e.stopPropagation(); handleDeleteUpload(fname) }}>✕</button>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          </div>
        </>
      )}

      {/* ── Filesystem Panel ───────────────────────────── */}
      {showFsPanel && (
        <>
          <div className="overlay-backdrop" onClick={() => setShowFsPanel(false)} />
          <div className="overlay-panel fs-panel">
            <div className="overlay-header">
              <span>📁 Filesystem Access</span>
              <button className="overlay-close" onClick={() => setShowFsPanel(false)}>✕</button>
            </div>
            <div className="fs-body">
              <div className="fs-section-title">Access List</div>
              {(fsConfig.access_list || []).map((entry, i) => (
                <div key={i} className="fs-entry">
                  <span className="fs-entry-label">{entry.label || entry.path}</span>
                  <span className="fs-entry-path">{entry.path}</span>
                  <span className="fs-entry-flags">
                    {entry.read  && <span className="fs-flag read">R</span>}
                    {entry.write && <span className="fs-flag write">W</span>}
                    {entry.edit  && <span className="fs-flag edit">E</span>}
                  </span>
                  <button className="fs-entry-del" onClick={() => handleRemoveFsAccess(entry.path)}>✕</button>
                </div>
              ))}
              <div className="fs-add-row">
                <input className="fs-input" placeholder="/path/to/dir" value={newFsPath} onChange={e => setNewFsPath(e.target.value)} />
                <input className="fs-input" placeholder="Label (optional)" value={newFsLabel} onChange={e => setNewFsLabel(e.target.value)} />
                <label><input type="checkbox" checked={newFsRead}  onChange={e => setNewFsRead(e.target.checked)}  /> Read</label>
                <label><input type="checkbox" checked={newFsWrite} onChange={e => setNewFsWrite(e.target.checked)} /> Write</label>
                <label><input type="checkbox" checked={newFsEdit}  onChange={e => setNewFsEdit(e.target.checked)}  /> Edit</label>
                <button className="btn-primary" onClick={handleAddFsAccess}>Add</button>
              </div>
              {fsError && <div className="fs-error">{fsError}</div>}
              <div className="fs-section-title" style={{ marginTop: 16 }}>Output Directory</div>
              <div className="fs-add-row">
                <input className="fs-input" placeholder="/path/to/output" value={outputDirInput} onChange={e => setOutputDirInput(e.target.value)} />
                <button className="btn-primary" onClick={handleSetOutputDir}>Set</button>
              </div>
              <button className="nav-btn" style={{ marginTop: 12 }}
                onClick={() => { setFsAuditTab(v => !v); if (!fsAuditTab) fetchFsAudit() }}>
                {fsAuditTab ? 'Hide' : 'Show'} Audit Log
              </button>
              {fsAuditTab && (
                <div className="fs-audit">
                  {fsAudit.length === 0
                    ? <div className="fs-audit-empty">No audit entries yet</div>
                    : fsAudit.slice().reverse().map((e, i) => (
                        <div key={i} className="fs-audit-entry">
                          <span className="fs-audit-op">{e.operation}</span>
                          <span className="fs-audit-path">{e.path}</span>
                          <span className="fs-audit-ts">{new Date(e.ts * 1000).toLocaleTimeString()}</span>
                        </div>
                      ))}
                </div>
              )}
            </div>
          </div>
        </>
      )}

      {/* ── Agent Editor Overlay ───────────────────────── */}
      {showAgentEditor && (
        <>
          <div className="overlay-backdrop" onClick={() => setShowAgentEditor(false)} />
          <div className="overlay-panel agent-panel">
            <div className="overlay-header">
              <span>🤖 Agent Manager</span>
              <button className="overlay-close" onClick={() => setShowAgentEditor(false)}>✕</button>
            </div>
            <div className="agent-tabs">
              {['list','new',...(editingAgent?['edit']:[]),...(skillsAgentId?['skills']:[])].map(t => (
                <button key={t} className={`agent-tab ${agentTab===t?'active':''}`} onClick={() => setAgentTab(t)}>
                  {t === 'list' ? '📋 Agents' : t === 'new' ? '➕ New' : t === 'edit' ? '✏️ Edit' : '📄 Skills'}
                </button>
              ))}
            </div>
            {agentTab === 'list' && (
              <div className="agent-list">
                {pendingSpawns.length > 0 && (
                  <div className="spawn-requests">
                    <div className="spawn-title">⚡ Spawn Requests</div>
                    {pendingSpawns.map(req => (
                      <div key={req.request_id} className="spawn-req">
                        <div className="spawn-req-msg">{req.message}</div>
                        <div className="spawn-req-btns">
                          <button className="btn-approve" onClick={() => handleSpawnDecision(req.request_id, true)}>✓ Approve</button>
                          <button className="btn-deny"    onClick={() => handleSpawnDecision(req.request_id, false)}>✕ Deny</button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
                <div className="spawn-toggle-row">
                  <span>Auto-spawn</span>
                  <button className={`toggle-btn ${spawnEnabled?'on':''}`} onClick={handleToggleSpawn} disabled={spawnToggling}>
                    {spawnEnabled ? '✓ Enabled' : '✗ Disabled'}
                  </button>
                </div>
                {agents.map(agent => (
                  <div key={agent.id} className="agent-editor-item">
                    <span className="agent-editor-icon">{agent.icon || '🤖'}</span>
                    <div className="agent-editor-info">
                      <span className="agent-editor-name">{agent.label || agent.role}</span>
                      <span className="agent-editor-role">{agent.role}</span>
                    </div>
                    <div className="agent-editor-actions">
                      <button className="btn-sm" onClick={() => { setEditingAgent({...agent}); setAgentTab('edit') }}>✏️</button>
                      <button className="btn-sm" onClick={() => handleOpenSkills(agent)}>📄</button>
                      <button className="btn-sm" onClick={() => handleToggleActive(agent)}>{agent.active===false?'▶':'⏸'}</button>
                      {!BUILTIN.includes(agent.id) && (
                        <button className="btn-sm danger" onClick={() => handleDeleteAgent(agent.id)}>🗑</button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
            {agentTab === 'new' && (
              <div className="agent-form">
                {['label','role','goal','backstory'].map(field => (
                  <div key={field} className="form-row">
                    <label className="form-label">{field.charAt(0).toUpperCase()+field.slice(1)}</label>
                    <input className="form-input" value={newAgentForm[field]} onChange={e => setNewAgentForm(p => ({...p,[field]:e.target.value}))} />
                  </div>
                ))}
                <div className="form-row">
                  <label className="form-label">Icon</label>
                  <input className="form-input" value={newAgentForm.icon} onChange={e => setNewAgentForm(p => ({...p,icon:e.target.value}))} />
                </div>
                <button className="btn-primary" onClick={handleCreateAgent}>Create Agent</button>
              </div>
            )}
            {agentTab === 'edit' && editingAgent && (
              <div className="agent-form">
                {['label','role','goal','backstory'].map(field => (
                  <div key={field} className="form-row">
                    <label className="form-label">{field.charAt(0).toUpperCase()+field.slice(1)}</label>
                    <input className="form-input" value={editingAgent[field]||''} onChange={e => setEditingAgent(p => ({...p,[field]:e.target.value}))} />
                  </div>
                ))}
                <button className="btn-primary" onClick={handleUpdateAgent}>Save Changes</button>
              </div>
            )}
            {agentTab === 'skills' && (
              <div className="skills-editor">
                <div className="skills-header">SKILLS.md for {skillsAgentId}</div>
                <textarea className="skills-textarea" value={skillsText} onChange={e => setSkillsText(e.target.value)} rows={20} />
                <button className="btn-primary" onClick={handleSaveSkills} disabled={skillsSaving}>
                  {skillsSaving ? 'Saving…' : '💾 Save'}
                </button>
              </div>
            )}
          </div>
        </>
      )}

      {/* ── Tools Panel ────────────────────────────────── */}
      {showToolPanel && (
        <>
          <div className="overlay-backdrop" onClick={() => setShowToolPanel(false)} />
          <div className="overlay-panel tools-panel">
            <div className="overlay-header">
              <span>🔧 Custom Tools</span>
              <button className="overlay-close" onClick={() => setShowToolPanel(false)}>✕</button>
            </div>
            <div className="agent-tabs">
              {['list','new',...(editingTool?['edit']:[]),...(toolMdId?['toolmd']:[])].map(t => (
                <button key={t} className={`agent-tab ${toolTab===t?'active':''}`} onClick={() => setToolTab(t)}>
                  {t==='list'?'📋 Tools':t==='new'?'➕ New':t==='edit'?'✏️ Edit':'📄 TOOL.md'}
                </button>
              ))}
            </div>
            {toolTab === 'list' && (
              <div className="agent-list">
                {pendingToolSpawns.length > 0 && (
                  <div className="spawn-requests">
                    <div className="spawn-title">⚡ Tool Requests</div>
                    {pendingToolSpawns.map(req => (
                      <div key={req.request_id} className="spawn-req">
                        <div className="spawn-req-msg">{req.suggestion?.name}: {req.suggestion?.description}</div>
                        <div className="spawn-req-btns">
                          <button className="btn-approve" onClick={() => handleToolSpawnDecision(req.request_id, true)}>✓ Approve</button>
                          <button className="btn-deny"    onClick={() => handleToolSpawnDecision(req.request_id, false)}>✕ Deny</button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
                {tools.map(tool => (
                  <div key={tool.id} className="agent-editor-item">
                    <span className="agent-editor-icon">🔧</span>
                    <div className="agent-editor-info">
                      <span className="agent-editor-name">{tool.display_name || tool.name}</span>
                      <span className="agent-editor-role">{tool.description}</span>
                    </div>
                    <div className="agent-editor-actions">
                      <button className="btn-sm" onClick={() => { setEditingTool({...tool}); setToolTab('edit') }}>✏️</button>
                      <button className="btn-sm" onClick={() => handleOpenToolMd(tool)}>📄</button>
                      <button className="btn-sm" onClick={() => handleToggleToolActive(tool)}>{tool.active===false?'▶':'⏸'}</button>
                      <button className="btn-sm danger" onClick={() => handleDeleteTool(tool.id)}>🗑</button>
                    </div>
                  </div>
                ))}
              </div>
            )}
            {toolTab === 'new' && (
              <div className="agent-form">
                {['name','display_name','description','tags'].map(field => (
                  <div key={field} className="form-row">
                    <label className="form-label">{field}</label>
                    <input className="form-input" value={newToolForm[field]} onChange={e => setNewToolForm(p => ({...p,[field]:e.target.value}))} />
                  </div>
                ))}
                <div className="form-row">
                  <label className="form-label">Code</label>
                  <textarea className="form-input" style={{fontFamily:'monospace',minHeight:120}} value={newToolForm.code} onChange={e => setNewToolForm(p => ({...p,code:e.target.value}))} />
                </div>
                <button className="btn-primary" onClick={handleCreateTool}>Create Tool</button>
              </div>
            )}
            {toolTab === 'edit' && editingTool && (
              <div className="agent-form">
                {['display_name','description','tags'].map(field => (
                  <div key={field} className="form-row">
                    <label className="form-label">{field}</label>
                    <input className="form-input" value={editingTool[field]||''} onChange={e => setEditingTool(p => ({...p,[field]:e.target.value}))} />
                  </div>
                ))}
                <div className="form-row">
                  <label className="form-label">Code</label>
                  <textarea className="form-input" style={{fontFamily:'monospace',minHeight:120}} value={editingTool.code||''} onChange={e => setEditingTool(p => ({...p,code:e.target.value}))} />
                </div>
                <button className="btn-primary" onClick={handleUpdateTool}>Save Changes</button>
              </div>
            )}
            {toolTab === 'toolmd' && (
              <div className="skills-editor">
                <div className="skills-header">TOOL.md for {toolMdId}</div>
                <textarea className="skills-textarea" value={toolMdText} onChange={e => setToolMdText(e.target.value)} rows={20} />
                <button className="btn-primary" onClick={handleSaveToolMd} disabled={toolMdSaving}>
                  {toolMdSaving ? 'Saving…' : '💾 Save'}
                </button>
              </div>
            )}
          </div>
        </>
      )}

      {/* ── Settings Panel ─────────────────────────────── */}
      {showSettings && (
        <>
          <div className="overlay-backdrop" onClick={() => setShowSettings(false)} />
          <div className="overlay-panel settings-panel">
            <div className="overlay-header">
              <span>⚙️ Settings</span>
              <button className="overlay-close" onClick={() => setShowSettings(false)}>✕</button>
            </div>
            <div className="agent-tabs">
              {['telegram','improver','websearch'].map(t => (
                <button key={t} className={`agent-tab ${settingsTab===t?'active':''}`} onClick={() => setSettingsTab(t)}>
                  {t==='telegram'?'📱 Telegram':t==='improver'?'🔄 Self-Improver':'🌐 Web Search'}
                </button>
              ))}
            </div>
            {settingsTab === 'telegram' && (
              <div className="settings-form">
                <div className="form-row"><label className="form-label">Bot Token {tgBotSet && '(set ✓)'}</label>
                  <input className="form-input" type="password" placeholder={tgBotSet ? '(unchanged)' : 'Enter token'} value={tgConfig.bot_token} onChange={e => setTgConfig(p => ({...p,bot_token:e.target.value}))} /></div>
                <div className="form-row"><label className="form-label">Allowed Chat IDs (comma-separated)</label>
                  <input className="form-input" value={tgConfig.allowed_chat_ids} onChange={e => setTgConfig(p => ({...p,allowed_chat_ids:e.target.value}))} /></div>
                <div className="form-row"><label className="form-label">Notify Chat ID</label>
                  <input className="form-input" value={tgConfig.notify_chat_id} onChange={e => setTgConfig(p => ({...p,notify_chat_id:e.target.value}))} /></div>
                <div className="form-row"><label className="form-label">Enabled</label>
                  <input type="checkbox" checked={tgConfig.enabled} onChange={e => setTgConfig(p => ({...p,enabled:e.target.checked}))} /></div>
                <div className="form-btns">
                  <button className="btn-primary" onClick={handleSaveTelegram} disabled={tgSaving}>{tgSaving?'Saving…':'💾 Save'}</button>
                  <button className="btn-secondary" onClick={handleTestTelegram} disabled={tgTesting}>{tgTesting?'Testing…':'🧪 Test'}</button>
                </div>
                {tgTestResult && <pre className="settings-result">{tgTestResult}</pre>}
              </div>
            )}
            {settingsTab === 'improver' && (
              <div className="settings-form">
                <div className="form-row"><label className="form-label">Enabled</label>
                  <input type="checkbox" checked={siConfig.enabled} onChange={e => setSiConfig(p => ({...p,enabled:e.target.checked}))} /></div>
                <div className="form-row"><label className="form-label">Interval (hours)</label>
                  <input className="form-input" type="number" value={siConfig.interval_hours} onChange={e => setSiConfig(p => ({...p,interval_hours:+e.target.value}))} /></div>
                <div className="form-row"><label className="form-label">Min Confidence</label>
                  <input className="form-input" type="number" step="0.1" min="0" max="1" value={siConfig.min_confidence} onChange={e => setSiConfig(p => ({...p,min_confidence:+e.target.value}))} /></div>
                <div className="form-btns">
                  <button className="btn-primary" onClick={handleSaveSiConfig} disabled={siSaving}>{siSaving?'Saving…':'💾 Save'}</button>
                  <button className="btn-secondary" onClick={handleRunImprover} disabled={siRunning}>{siRunning?'Running…':'▶ Run Now'}</button>
                </div>
              </div>
            )}
            {settingsTab === 'websearch' && (
              <div className="settings-form">
                <div className="form-row"><label className="form-label">Enabled</label>
                  <input type="checkbox" checked={wsConfig.enabled} onChange={e => setWsConfig(p => ({...p,enabled:e.target.checked}))} /></div>
                <div className="form-row"><label className="form-label">Provider</label>
                  <select className="form-input" value={wsConfig.provider} onChange={e => setWsConfig(p => ({...p,provider:e.target.value}))}>
                    <option value="auto">Auto</option><option value="duckduckgo">DuckDuckGo</option><option value="searxng">SearXNG</option>
                  </select></div>
                <div className="form-row"><label className="form-label">Max Results</label>
                  <input className="form-input" type="number" value={wsConfig.max_results} onChange={e => setWsConfig(p => ({...p,max_results:+e.target.value}))} /></div>
                <div className="form-row"><label className="form-label">Test Query</label>
                  <input className="form-input" value={wsTestQuery} onChange={e => setWsTestQuery(e.target.value)} /></div>
                <div className="form-btns">
                  <button className="btn-primary" onClick={handleSaveWsConfig} disabled={wsSaving}>{wsSaving?'Saving…':'💾 Save'}</button>
                  <button className="btn-secondary" onClick={handleTestWsProviders} disabled={wsTesting}>{wsTesting?'Testing…':'🔍 Test Providers'}</button>
                  <button className="btn-secondary" onClick={handleRunWsQuery} disabled={wsTesting}>{wsTesting?'…':'▶ Run Query'}</button>
                </div>
                {wsTestResult && <pre className="settings-result">{wsTestResult}</pre>}
              </div>
            )}
          </div>
        </>
      )}

      {/* ── Knowledge Base Panel ───────────────────────── */}
      {showKbPanel && (
        <>
          <div className="overlay-backdrop" onClick={() => setShowKbPanel(false)} />
          <div className="overlay-panel kb-panel">
            <div className="overlay-header">
              <span>📚 Knowledge Base</span>
              <button className="overlay-close" onClick={() => setShowKbPanel(false)}>✕</button>
            </div>
            <div className="agent-tabs">
              {['browse','add','search','config'].map(t => (
                <button key={t} className={`agent-tab ${kbTab===t?'active':''}`} onClick={() => setKbTab(t)}>
                  {t==='browse'?'📖 Browse':t==='add'?'➕ Add':t==='search'?'🔍 Search':'⚙️ Config'}
                </button>
              ))}
            </div>
            {kbTab === 'browse' && (
              <div className="kb-browse">
                <div className="kb-stats">Total chunks: {kbEntries.count}</div>
                {(kbEntries.sources||[]).map(src => (
                  <div key={src} className="kb-source">
                    <span className="kb-source-name">{src}</span>
                    <button className="btn-sm danger" onClick={() => handleDeleteKbSource(src)}>✕</button>
                  </div>
                ))}
                {kbEntries.count > 0 && (
                  <button className="btn-danger" style={{marginTop:12}} onClick={handleClearKb}>🗑 Clear All</button>
                )}
              </div>
            )}
            {kbTab === 'add' && (
              <div className="kb-add">
                <div className="kb-add-section">
                  <div className="form-label">Upload File</div>
                  <input ref={kbFileRef} type="file" multiple accept=".pdf,.docx,.txt,.md,.csv" onChange={handleKbFileUpload} disabled={kbUploading} />
                  {kbUploading && <span className="upload-hint">Ingesting…</span>}
                </div>
                <div className="kb-add-section">
                  <div className="form-label">Paste Text</div>
                  <input className="form-input" placeholder="Source name" value={kbPasteName} onChange={e => setKbPasteName(e.target.value)} />
                  <textarea className="form-input" style={{marginTop:8,minHeight:80}} placeholder="Paste text here…" value={kbPasteText} onChange={e => setKbPasteText(e.target.value)} />
                  <input className="form-input" style={{marginTop:8}} placeholder="Tags (comma-separated)" value={kbPasteTags} onChange={e => setKbPasteTags(e.target.value)} />
                  <button className="btn-primary" style={{marginTop:8}} onClick={handleKbPasteIngest} disabled={kbUploading}>Ingest</button>
                </div>
              </div>
            )}
            {kbTab === 'search' && (
              <div className="kb-search">
                <div className="kb-search-row">
                  <input className="form-input" placeholder="Search knowledge base…" value={kbSearchQ} onChange={e => setKbSearchQ(e.target.value)} onKeyDown={e => e.key==='Enter'&&handleKbSearch()} />
                  <button className="btn-primary" onClick={handleKbSearch} disabled={kbSearching}>{kbSearching?'…':'Search'}</button>
                </div>
                {kbSearchResult && <pre className="settings-result" style={{marginTop:12}}>{kbSearchResult}</pre>}
                <div style={{marginTop:16}}>
                  <div className="form-label">RAG Query (with LLM answer)</div>
                  <div className="kb-search-row">
                    <input className="form-input" placeholder="Ask a question…" value={ragQuery} onChange={e => setRagQuery(e.target.value)} onKeyDown={e => e.key==='Enter'&&handleRagQuery()} />
                    <input className="form-input" style={{width:60}} type="number" min={1} max={20} value={ragTopK} onChange={e => setRagTopK(+e.target.value)} />
                    <button className="btn-primary" onClick={handleRagQuery} disabled={ragLoading}>{ragLoading?'…':'Ask'}</button>
                  </div>
                  {ragResult && (
                    <div className="rag-result">
                      {ragResult.answer && <pre className="settings-result">{ragResult.answer}</pre>}
                      {ragResult.sources?.length > 0 && (
                        <div className="rag-sources">Sources: {ragResult.sources.join(', ')}</div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            )}
            {kbTab === 'config' && (
              <div className="settings-form">
                <div className="form-row"><label className="form-label">Enabled</label>
                  <input type="checkbox" checked={kbConfig.enabled} onChange={e => setKbConfig(p => ({...p,enabled:e.target.checked}))} /></div>
                <div className="form-row"><label className="form-label">Embed Model</label>
                  <input className="form-input" value={kbConfig.embed_model} onChange={e => setKbConfig(p => ({...p,embed_model:e.target.value}))} /></div>
                <div className="form-row"><label className="form-label">Chunk Size</label>
                  <input className="form-input" type="number" value={kbConfig.chunk_size} onChange={e => setKbConfig(p => ({...p,chunk_size:+e.target.value}))} /></div>
                <div className="form-row"><label className="form-label">Chunk Overlap</label>
                  <input className="form-input" type="number" value={kbConfig.chunk_overlap} onChange={e => setKbConfig(p => ({...p,chunk_overlap:+e.target.value}))} /></div>
                <div className="form-row"><label className="form-label">Top-K</label>
                  <input className="form-input" type="number" value={kbConfig.top_k} onChange={e => setKbConfig(p => ({...p,top_k:+e.target.value}))} /></div>
                <button className="btn-primary" onClick={handleSaveKbConfig} disabled={kbConfigSaving}>{kbConfigSaving?'Saving…':'💾 Save'}</button>
              </div>
            )}
          </div>
        </>
      )}

      {/* ── Model picker ───────────────────────────────── */}
      {showModelPanel && (
        <>
          <div className="overlay-backdrop" onClick={() => setShowModelPanel(false)} />
          <div className="overlay-panel model-panel">
            <div className="overlay-header">
              <span>🧠 Select Model</span>
              <button className="overlay-close" onClick={() => setShowModelPanel(false)}>✕</button>
            </div>
            <div className="model-list">
              {availableModels.length === 0
                ? <div className="model-empty">No pulled models found. Pull a model in Ollama first.</div>
                : availableModels.map(m => (
                    <div key={m}
                      className={`model-item ${selectedModel === m ? 'selected' : ''}`}
                      onClick={() => setSelectedModel(m)}>
                      <span className="model-item-name">{m}</span>
                      {currentModel === m && <span className="model-item-active">active</span>}
                    </div>
                  ))
              }
            </div>
            {modelError && <div className="model-error">{modelError}</div>}
            <button className="btn-primary" style={{margin:12}}
              onClick={handleModelChange}
              disabled={modelSaving || selectedModel === (typeof currentModel==='string'?currentModel:'')}>
              {modelSaving ? 'Switching…' : '✓ Use Selected Model'}
            </button>
          </div>
        </>
      )}

      {/* ── 3-D Board Room ─────────────────────────────── */}
      {show3DRoom && (
        <div className="canvas-area">
          <div className="canvas-header">
            <span className="canvas-label">🏛️ Agent Office · Drag to orbit · Scroll to zoom</span>
            <button className="canvas-close-btn" onClick={() => setShow3DRoom(false)}>✕ Close</button>
          </div>
          <div className="canvas-3d-wrapper">
            <AgentScene3D
              activeAgent={activeAgent} agents={agents}
              lastMessages={lastMessages} currentPhase={currentPhase}
              currentWorker={currentWorker}
            />
          </div>
        </div>
      )}

      {/* ── Main Side Panel ────────────────────────────── */}
      <SidePanel
        mode={mode} setMode={setMode}
        topic={topic} setTopic={setTopic}
        running={running}
        selectedFiles={selectedFiles}
        setShowUploadPanel={setShowUploadPanel}
        handleRun={handleRun}
        agents={agents} activeAgent={activeAgent} lastMessages={lastMessages}
        logs={logs} setLogs={setLogs}
        result={result} reportFile={reportFile} reportFormat={reportFormat}
        handleDownload={handleDownload}
      />

    </div>
  )
}
