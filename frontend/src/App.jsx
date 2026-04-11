import { useState, useEffect, useRef, useCallback } from 'react'
import { API_URL, PHASE_ORDER } from './utils/constants'
import { useStats }             from './hooks/useStats'

import AgentScene3D         from './components/AgentScene3D'
import AppHeader            from './components/AppHeader'
import InfoBar              from './components/InfoBar'
import SidePanel            from './components/SidePanel'
import DashboardPanel       from './components/panels/DashboardPanel'
import FileUploadPanel      from './components/panels/FileUploadPanel'
import FilesystemPanel      from './components/panels/FilesystemPanel'
import AgentEditorPanel     from './components/panels/AgentEditorPanel'
import ToolsPanel           from './components/panels/ToolsPanel'
import SettingsPanel        from './components/panels/SettingsPanel'
import KnowledgeBasePanel   from './components/panels/KnowledgeBasePanel'
import ModelPickerPanel     from './components/panels/ModelPickerPanel'

import './styles/App.css'

const WS_URL = 'ws://localhost:8000/ws'

export default function App() {
  // ── Core state ─────────────────────────────────────────
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

  // ── Panel visibility ────────────────────────────────────
  const [showDashboard,   setShowDashboard]   = useState(false)
  const [showUploadPanel, setShowUploadPanel] = useState(false)
  const [showFsPanel,     setShowFsPanel]     = useState(false)
  const [showKbPanel,     setShowKbPanel]     = useState(false)
  const [showToolPanel,   setShowToolPanel]   = useState(false)
  const [showAgentEditor, setShowAgentEditor] = useState(false)
  const [showModelPanel,  setShowModelPanel]  = useState(false)
  const [showSettings,    setShowSettings]    = useState(false)
  const [show3DRoom,      setShow3DRoom]      = useState(false)

  // ── Model state ─────────────────────────────────────────
  const [availableModels, setAvailableModels] = useState([])
  const [selectedModel,   setSelectedModel]   = useState('phi3:mini')
  const [currentModel,    setCurrentModel]    = useState('phi3:mini')
  const [modelSaving,     setModelSaving]     = useState(false)
  const [modelError,      setModelError]      = useState(null)

  // ── File upload state ────────────────────────────────────
  const [uploads,       setUploads]       = useState([])
  const [selectedFiles, setSelectedFiles] = useState([])
  const [uploading,     setUploading]     = useState(false)
  const fileInputRef = useRef(null)

  // ── Agent editor state ───────────────────────────────────
  const [agents,          setAgents]          = useState([])
  const [spawnRequests,   setSpawnRequests]   = useState([])
  const [spawnEnabled,    setSpawnEnabled]    = useState(true)
  const [spawnToggling,   setSpawnToggling]   = useState(false)
  const [editingAgent,    setEditingAgent]    = useState(null)
  const [newAgentForm,    setNewAgentForm]    = useState({ label:'', role:'', goal:'', backstory:'', icon:'🤖', color:'#a78bfa' })
  const [agentTab,        setAgentTab]        = useState('list')
  const [skillsText,      setSkillsText]      = useState('')
  const [skillsSaving,    setSkillsSaving]    = useState(false)
  const [skillsAgentId,   setSkillsAgentId]   = useState(null)

  // ── Filesystem config state ──────────────────────────────
  const [fsConfig,       setFsConfig]       = useState({ access_list:[], output_dir:null })
  const [fsAudit,        setFsAudit]        = useState([])
  const [fsAuditTab,     setFsAuditTab]     = useState(false)
  const [newFsPath,      setNewFsPath]      = useState('')
  const [newFsRead,      setNewFsRead]      = useState(true)
  const [newFsWrite,     setNewFsWrite]     = useState(false)
  const [newFsEdit,      setNewFsEdit]      = useState(false)
  const [newFsLabel,     setNewFsLabel]     = useState('')
  const [outputDirInput, setOutputDirInput] = useState('')
  const [fsError,        setFsError]        = useState(null)

  // ── Tool state ───────────────────────────────────────────
  const [tools,         setTools]         = useState([])
  const [toolTab,       setToolTab]       = useState('list')
  const [editingTool,   setEditingTool]   = useState(null)
  const [toolMdText,    setToolMdText]    = useState('')
  const [toolMdId,      setToolMdId]      = useState(null)
  const [toolMdSaving,  setToolMdSaving]  = useState(false)
  const [toolSpawnReqs, setToolSpawnReqs] = useState([])
  const [newToolForm,   setNewToolForm]   = useState({
    name:'', display_name:'', description:'', tags:'', code:'    return str(input_data)'
  })

  // ── Settings / Telegram / Self-Improver state ────────────
  const [showSettingsTab, setShowSettingsTab] = useState('telegram')
  const [tgConfig,    setTgConfig]    = useState({ bot_token:'', allowed_chat_ids:'', notify_chat_id:'', enabled:false })
  const [tgSaving,    setTgSaving]    = useState(false)
  const [tgTesting,   setTgTesting]   = useState(false)
  const [tgTestResult,setTgTestResult]= useState(null)
  const [tgBotSet,    setTgBotSet]    = useState(false)
  const [siConfig,    setSiConfig]    = useState({ enabled:true, interval_hours:6, auto_apply_safe:true, notify_telegram:true, min_confidence:0.7, model_override:'' })
  const [siSaving,    setSiSaving]    = useState(false)
  const [siRunning,   setSiRunning]   = useState(false)
  const [bestPractices,setBestPractices]=useState('')
  const [proposals,   setProposals]   = useState('')
  const [improvLog,   setImprovLog]   = useState('')

  // ── Web Search state ─────────────────────────────────────
  const [wsConfig,     setWsConfig]     = useState({ enabled:false, provider:'auto', max_results:5, timeout_seconds:10, safe_search:true, region:'wt-wt', fallback_to_mock:true })
  const [wsSaving,     setWsSaving]     = useState(false)
  const [wsTesting,    setWsTesting]    = useState(false)
  const [wsTestResult, setWsTestResult] = useState(null)
  const [wsTestQuery,  setWsTestQuery]  = useState('weather in Tokyo')

  // ── Knowledge Base / RAG state ───────────────────────────
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
  const [kbTab,          setKbTab]          = useState('browse')
  const kbFileRef = useRef(null)

  const [ragQuery,   setRagQuery]   = useState('')
  const [ragTopK,    setRagTopK]    = useState(4)
  const [ragLoading, setRagLoading] = useState(false)
  const [ragResult,  setRagResult]  = useState(null)

  const wsRef       = useRef(null)
  const activeTimer = useRef(null)

  // ── Custom hooks ─────────────────────────────────────────
  const { stats } = useStats()

  const pendingSpawns     = spawnRequests.filter(r => !r._resolved)
  const pendingToolSpawns = toolSpawnReqs.filter(r => !r._resolved)

  // ── Init ─────────────────────────────────────────────────
  useEffect(() => {
    fetchModels(); fetchUploads(); fetchAgents(); fetchSpawnSettings()
    fetchFsConfig(); fetchTools(); fetchToolSpawns(); fetchTelegramConfig()
    fetchSiConfig(); fetchWsConfig(); fetchKbEntries(); fetchKbConfig()
  }, [])

  // Models polling when panel open
  useEffect(() => {
    if (!showModelPanel) return
    fetchModels()
    const id = setInterval(fetchModels, 15000)
    return () => clearInterval(id)
  }, [showModelPanel])

  const handleMessageRef = useRef(null)

  useEffect(() => {
    const connect = () => {
      const ws = new WebSocket(WS_URL)
      wsRef.current = ws
      ws.onopen    = () => { setConnected(true); fetchAgents(); fetchTools() }
      ws.onmessage = (e) => handleMessageRef.current?.(JSON.parse(e.data))
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

  // ── Helpers ───────────────────────────────────────────────
  const addLog = useCallback((agent, label, message, phase = false, ts = null, taskResult = false) =>
    setLogs(prev => {
      const last = prev[prev.length - 1]
      if (last && last.agent === agent && last.message === message) return prev
      return [...prev.slice(-150), { agent, label, message, phase, taskResult, ts: ts || Date.now() / 1000 }]
    }), [])

  // ── Fetch functions ───────────────────────────────────────
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
      if (d._note || d.error) return
      setTgBotSet(!!d.bot_token_set)
      setTgConfig(c => ({
        ...c,
        allowed_chat_ids: (d.allowed_chat_ids || []).join(', '),
        notify_chat_id: d.notify_chat_id || '',
        enabled: !!d.enabled,
      }))
    } catch {}
  }

  const fetchSiConfig = async () => {
    try {
      const d = await fetch(`${API_URL}/self-improver/config`).then(r => r.json())
      if (!d.error) setSiConfig(d)
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

  // ── Message handler ───────────────────────────────────────
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
        addLog('system', '⚙️ System', `▶ Job started — model: ${msg.model || ''}, mode: ${msg.mode || ''}`, true)
    }
    if (msg.type === 'job_done') {
      setRunning(false); setResult(msg.result); setReportFile(msg.filename)
      setReportFormat(msg.format || 'md')
      setActiveAgent(null); setCurrentPhase(null); setCurrentWorker(null)
      addLog('system', '⚙️ System', `✅ Report complete — ${msg.filename} (${(msg.format || 'md').toUpperCase()})`)
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
      addLog('system', '⚙️ System', `🔧 Agent requests new tool: '${msg.suggestion?.name || '?'}' — awaiting approval`)
    }
    if (msg.type === 'tool_created' || msg.type === 'tool_updated' ||
        msg.type === 'tool_deleted' || msg.type === 'tools_updated') {
      fetchTools()
    }
  }, [addLog])

  useEffect(() => { handleMessageRef.current = handleMessage }, [handleMessage])

  // ── Model actions ─────────────────────────────────────────
  const handleModelChange = async () => {
    const currentStr = typeof currentModel === 'string' ? currentModel : ''
    if (selectedModel === currentStr) return
    setModelSaving(true); setModelError(null)
    try {
      const d = await fetch(`${API_URL}/models/select`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: selectedModel })
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

  // ── File actions ──────────────────────────────────────────
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

  // ── Job actions ───────────────────────────────────────────
  const handleRun = async () => {
    if (!topic.trim() || running) return
    setResult(null); setReportFile(null); setReportFormat('md'); setLogs([]); setRunning(true); setCurrentPhase(null)
    const res = await fetch(`${API_URL}/run`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ topic, mode, uploaded_files: selectedFiles }),
    })
    const data = await res.json()
    setJobId(data.job_id)
  }

  const handleDownload = () => {
    if (!reportFile) return
    const a = document.createElement('a'); a.href = `${API_URL}/reports/${reportFile}`; a.download = reportFile; a.click()
  }

  // ── Agent editor actions ──────────────────────────────────
  const handleCreateAgent = async () => {
    if (!newAgentForm.role.trim()) return
    const res = await fetch(`${API_URL}/agents`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(newAgentForm),
    })
    const data = await res.json()
    await fetchAgents()
    if (data.duplicate) {
      addLog('system', '⚙️ System', `⚠️ Role "${newAgentForm.role}" already exists (${data.agent?.label}). No duplicate created.`)
      return
    }
    setNewAgentForm({ label: '', role: '', goal: '', backstory: '', icon: '🤖', color: '#a78bfa' })
    setAgentTab('list')
  }

  const handleUpdateAgent = async () => {
    if (!editingAgent) return
    await fetch(`${API_URL}/agents/${editingAgent.id}`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(editingAgent)
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
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ request_id, approved })
    })
    setSpawnRequests(p => p.filter(r => r.request_id !== request_id))
    await fetchAgents()
  }

  const handleToggleSpawn = async () => {
    setSpawnToggling(true)
    try {
      const d = await fetch(`${API_URL}/spawn-settings`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled: !spawnEnabled }),
      }).then(r => r.json())
      if (typeof d.spawn_enabled === 'boolean') setSpawnEnabled(d.spawn_enabled)
    } catch {}
    setSpawnToggling(false)
  }

  // ── Filesystem actions ────────────────────────────────────
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
      addLog('system', '⚙️ System', outputDirInput.trim()
        ? `📂 Output directory set: ${outputDirInput.trim()}`
        : '📂 Output directory cleared')
    } catch { setFsError('Failed to set output directory') }
  }

  // ── Tool actions ──────────────────────────────────────────
  const handleCreateTool = async () => {
    if (!newToolForm.name.trim()) return
    const payload = {
      ...newToolForm,
      tags: newToolForm.tags ? newToolForm.tags.split(',').map(t => t.trim()).filter(Boolean) : [],
    }
    const d = await fetch(`${API_URL}/tools`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    }).then(r => r.json())
    if (d.duplicate) {
      addLog('system', '⚙️ System', `⚠️ Tool '${newToolForm.name}' already exists.`)
    } else {
      setNewToolForm({ name: '', display_name: '', description: '', tags: '', code: '    return str(input_data)' })
      setToolTab('list')
    }
    await fetchTools()
  }

  const handleUpdateTool = async () => {
    if (!editingTool) return
    await fetch(`${API_URL}/tools/${editingTool.id}`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
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
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: toolMdText }),
      })
      addLog('system', '⚙️ System', `📄 TOOL.md saved for ${toolMdId}`)
      await fetchTools()
    } catch {} finally { setToolMdSaving(false) }
  }

  const handleToolSpawnDecision = async (request_id, approved) => {
    await fetch(`${API_URL}/tool-spawns/decide`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ request_id, approved }),
    })
    setToolSpawnReqs(p => p.filter(r => r.request_id !== request_id))
    await fetchTools()
  }

  // ── Telegram / Self-Improver actions ─────────────────────
  const handleSaveTelegram = async () => {
    setTgSaving(true); setTgTestResult(null)
    try {
      const payload = {
        bot_token: tgConfig.bot_token || undefined,
        allowed_chat_ids: tgConfig.allowed_chat_ids
          ? tgConfig.allowed_chat_ids.split(',').map(s => s.trim()).filter(Boolean) : [],
        notify_chat_id: tgConfig.notify_chat_id,
        enabled: tgConfig.enabled,
      }
      const d = await fetch(`${API_URL}/telegram/config`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload)
      }).then(r => r.json())
      if (d.error) { setTgTestResult(`❌ ${d.error}`) }
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

  // ── Web Search actions ────────────────────────────────────
  const handleSaveWsConfig = async () => {
    setWsSaving(true); setWsTestResult(null)
    try {
      const d = await fetch(`${API_URL}/web-search/config`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(wsConfig),
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

  // ── Knowledge Base actions ────────────────────────────────
  const handleSaveKbConfig = async () => {
    setKbConfigSaving(true)
    try {
      await fetch(`${API_URL}/kb/config`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(kbConfig),
      })
      addLog('system', '📚 KB', '✅ Knowledge base config saved')
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
        body: JSON.stringify({
          text: kbPasteText,
          source_name: kbPasteName,
          tags: kbPasteTags ? kbPasteTags.split(',').map(t => t.trim()).filter(Boolean) : []
        }),
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
      const res = await fetch(`${API_URL}/kb/query`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: ragQuery, top_k: ragTopK }),
      })
      setRagResult(await res.json())
    } catch (e) { console.error('RAG query failed', e) } finally { setRagLoading(false) }
  }

  // ── Badge color ───────────────────────────────────────────
  const modelBadgeColor = () => {
    const m = typeof currentModel === 'string' ? currentModel : ''
    if (m.includes('llama3') || m.includes('mistral') || m.includes('qwen')) return '#22c55e'
    if (m.includes('phi3')   || m.includes('gemma'))                         return '#f59e0b'
    return '#6366f1'
  }

  // ── Render ────────────────────────────────────────────────
  return (
    <div className="app-container">
      {/* Fixed top bars */}
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

      <InfoBar
        connected={connected} currentModel={currentModel} currentPhase={currentPhase}
        running={running} stats={stats} jobId={jobId}
        show3DRoom={show3DRoom} setShow3DRoom={setShow3DRoom}
        modelBadgeColor={modelBadgeColor}
      />

      {/* Overlay panels */}
      {showDashboard   && <DashboardPanel stats={stats} currentModel={currentModel} onClose={() => setShowDashboard(false)} />}
      {showUploadPanel && <FileUploadPanel uploads={uploads} uploading={uploading} selectedFiles={selectedFiles} setSelectedFiles={setSelectedFiles} handleFileUpload={handleFileUpload} handleDeleteUpload={handleDeleteUpload} fileInputRef={fileInputRef} onClose={() => setShowUploadPanel(false)} />}
      {showFsPanel     && <FilesystemPanel fsConfig={fsConfig} fsAudit={fsAudit} fsAuditTab={fsAuditTab} setFsAuditTab={setFsAuditTab} fetchFsAudit={fetchFsAudit} newFsPath={newFsPath} setNewFsPath={setNewFsPath} newFsLabel={newFsLabel} setNewFsLabel={setNewFsLabel} newFsRead={newFsRead} setNewFsRead={setNewFsRead} newFsWrite={newFsWrite} setNewFsWrite={setNewFsWrite} newFsEdit={newFsEdit} setNewFsEdit={setNewFsEdit} fsError={fsError} outputDirInput={outputDirInput} setOutputDirInput={setOutputDirInput} handleAddFsAccess={handleAddFsAccess} handleRemoveFsAccess={handleRemoveFsAccess} handleToggleFsFlag={handleToggleFsFlag} handleSetOutputDir={handleSetOutputDir} onClose={() => setShowFsPanel(false)} />}
      {showAgentEditor && <AgentEditorPanel agents={agents} agentTab={agentTab} setAgentTab={setAgentTab} editingAgent={editingAgent} setEditingAgent={setEditingAgent} newAgentForm={newAgentForm} setNewAgentForm={setNewAgentForm} skillsText={skillsText} setSkillsText={setSkillsText} skillsSaving={skillsSaving} skillsAgentId={skillsAgentId} setSkillsAgentId={setSkillsAgentId} pendingSpawns={pendingSpawns} spawnEnabled={spawnEnabled} spawnToggling={spawnToggling} handleCreateAgent={handleCreateAgent} handleUpdateAgent={handleUpdateAgent} handleDeleteAgent={handleDeleteAgent} handleToggleActive={handleToggleActive} handleSaveSkills={handleSaveSkills} handleSpawnDecision={handleSpawnDecision} handleToggleSpawn={handleToggleSpawn} onClose={() => setShowAgentEditor(false)} />}
      {showToolPanel   && <ToolsPanel tools={tools} toolTab={toolTab} setToolTab={setToolTab} editingTool={editingTool} setEditingTool={setEditingTool} newToolForm={newToolForm} setNewToolForm={setNewToolForm} toolMdText={toolMdText} setToolMdText={setToolMdText} toolMdSaving={toolMdSaving} pendingToolSpawns={pendingToolSpawns} handleCreateTool={handleCreateTool} handleUpdateTool={handleUpdateTool} handleDeleteTool={handleDeleteTool} handleToggleToolActive={handleToggleToolActive} handleOpenToolMd={handleOpenToolMd} handleSaveToolMd={handleSaveToolMd} handleToolSpawnDecision={handleToolSpawnDecision} onClose={() => setShowToolPanel(false)} />}
      {showSettings    && <SettingsPanel settingsTab={showSettingsTab} setSettingsTab={setShowSettingsTab} tgConfig={tgConfig} setTgConfig={setTgConfig} tgSaving={tgSaving} tgTesting={tgTesting} tgTestResult={tgTestResult} tgBotSet={tgBotSet} siConfig={siConfig} setSiConfig={setSiConfig} siSaving={siSaving} siRunning={siRunning} bestPractices={bestPractices} proposals={proposals} improvLog={improvLog} wsConfig={wsConfig} setWsConfig={setWsConfig} wsSaving={wsSaving} wsTesting={wsTesting} wsTestResult={wsTestResult} wsTestQuery={wsTestQuery} setWsTestQuery={setWsTestQuery} handleSaveTelegram={handleSaveTelegram} handleTestTelegram={handleTestTelegram} handleSaveSiConfig={handleSaveSiConfig} handleRunImprover={handleRunImprover} handleSaveWsConfig={handleSaveWsConfig} handleTestWsProviders={handleTestWsProviders} handleRunWsQuery={handleRunWsQuery} onClose={() => setShowSettings(false)} />}
      {showKbPanel     && <KnowledgeBasePanel kbTab={kbTab} setKbTab={setKbTab} kbEntries={kbEntries} kbConfig={kbConfig} setKbConfig={setKbConfig} kbConfigSaving={kbConfigSaving} kbUploading={kbUploading} kbSearchQ={kbSearchQ} setKbSearchQ={setKbSearchQ} kbSearchResult={kbSearchResult} kbSearching={kbSearching} kbPasteText={kbPasteText} setKbPasteText={setKbPasteText} kbPasteName={kbPasteName} setKbPasteName={setKbPasteName} kbPasteTags={kbPasteTags} setKbPasteTags={setKbPasteTags} kbFileRef={kbFileRef} ragQuery={ragQuery} setRagQuery={setRagQuery} ragTopK={ragTopK} setRagTopK={setRagTopK} ragLoading={ragLoading} ragResult={ragResult} handleSaveKbConfig={handleSaveKbConfig} handleKbFileUpload={handleKbFileUpload} handleKbPasteIngest={handleKbPasteIngest} handleDeleteKbSource={handleDeleteKbSource} handleClearKb={handleClearKb} handleKbSearch={handleKbSearch} handleRagQuery={handleRagQuery} onClose={() => setShowKbPanel(false)} />}
      {showModelPanel  && <ModelPickerPanel availableModels={availableModels} selectedModel={selectedModel} setSelectedModel={setSelectedModel} currentModel={currentModel} modelSaving={modelSaving} modelError={modelError} handleModelChange={handleModelChange} onClose={() => setShowModelPanel(false)} />}

      {/* Main content area — fills remaining height */}
      <div className={`main-content${show3DRoom ? ' canvas-open' : ''}`}>
        <SidePanel
          mode={mode} setMode={setMode}
          topic={topic} setTopic={setTopic}
          running={running}
          selectedFiles={selectedFiles} setShowUploadPanel={setShowUploadPanel}
          handleRun={handleRun}
          agents={agents} activeAgent={activeAgent} lastMessages={lastMessages}
          logs={logs} setLogs={setLogs}
          result={result} reportFile={reportFile} reportFormat={reportFormat}
          handleDownload={handleDownload}
        />
      </div>

      {/* 3-D Board Room — right-side split pane */}
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
    </div>
  )
}
