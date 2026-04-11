import { useState, useEffect, useRef, useCallback } from 'react'
import { API_URL, PHASE_ORDER } from './utils/constants'
import { useWebSocket }         from './hooks/useWebSocket'
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

  // ── Domain state (passed into panels as props) ──────────
  const [availableModels, setAvailableModels] = useState([])
  const [selectedModel,   setSelectedModel]   = useState('phi3:mini')
  const [currentModel,    setCurrentModel]    = useState('phi3:mini')
  const [modelSaving,     setModelSaving]     = useState(false)
  const [modelError,      setModelError]      = useState(null)

  const [uploads,       setUploads]       = useState([])
  const [selectedFiles, setSelectedFiles] = useState([])
  const [uploading,     setUploading]     = useState(false)
  const fileInputRef = useRef(null)

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

  const [wsConfig,     setWsConfig]     = useState({ enabled:false, provider:'auto', max_results:5, timeout_seconds:10, safe_search:true, region:'wt-wt', fallback_to_mock:true })
  const [wsSaving,     setWsSaving]     = useState(false)
  const [wsTesting,    setWsTesting]    = useState(false)
  const [wsTestResult, setWsTestResult] = useState(null)
  const [wsTestQuery,  setWsTestQuery]  = useState('weather in Tokyo')

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

  const activeTimer = useRef(null)

  // ── Custom hooks ────────────────────────────────────────
  const { stats } = useStats()

  const pendingSpawns     = spawnRequests.filter(r => !r._decided)
  const pendingToolSpawns = toolSpawnReqs.filter(r => !r._decided)

  const currentPhaseIndex = PHASE_ORDER.indexOf(currentPhase)

  // ── All fetch/handler functions remain here (unchanged) ─
  // ... (fetchModels, fetchAgents, handleRun, handleMessage, etc.)
  // These are too long to inline here — keep them exactly as-is from
  // the original App.jsx, just moved up before the return statement.

  const modelBadgeColor = () => {
    const m = typeof currentModel === 'string' ? currentModel : ''
    if (m.includes('llama') || m.includes('mistral')) return '#a78bfa'
    if (m.includes('phi'))   return '#34d399'
    if (m.includes('gemma')) return '#fb7185'
    return '#6366f1'
  }

  const { connected: wsConnected } = useWebSocket({
    onOpen: () => { setConnected(true); fetchAgents(); fetchTools() },
    onMessage: handleMessage,
  })

  useEffect(() => { setConnected(wsConnected) }, [wsConnected])

  useEffect(() => {
    fetchModels(); fetchUploads(); fetchAgents(); fetchSpawnSettings()
    fetchFsConfig(); fetchTools(); fetchToolSpawns(); fetchTelegramConfig()
    fetchSiConfig(); fetchWsConfig(); fetchKbEntries(); fetchKbConfig()
  }, [])

  // ── Render ──────────────────────────────────────────────
  return (
    <div className="app-container">
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

      {/* ── Overlays ── */}
      {showDashboard   && <DashboardPanel stats={stats} currentModel={currentModel} onClose={() => setShowDashboard(false)} />}
      {showUploadPanel && <FileUploadPanel uploads={uploads} uploading={uploading} selectedFiles={selectedFiles} setSelectedFiles={setSelectedFiles} handleFileUpload={handleFileUpload} handleDeleteUpload={handleDeleteUpload} onClose={() => setShowUploadPanel(false)} />}
      {showFsPanel     && <FilesystemPanel fsConfig={fsConfig} fsAudit={fsAudit} fsAuditTab={fsAuditTab} setFsAuditTab={setFsAuditTab} fetchFsAudit={fetchFsAudit} newFsPath={newFsPath} setNewFsPath={setNewFsPath} newFsLabel={newFsLabel} setNewFsLabel={setNewFsLabel} newFsRead={newFsRead} setNewFsRead={setNewFsRead} newFsWrite={newFsWrite} setNewFsWrite={setNewFsWrite} newFsEdit={newFsEdit} setNewFsEdit={setNewFsEdit} fsError={fsError} outputDirInput={outputDirInput} setOutputDirInput={setOutputDirInput} handleAddFsAccess={handleAddFsAccess} handleRemoveFsAccess={handleRemoveFsAccess} handleToggleFsFlag={handleToggleFsFlag} handleSetOutputDir={handleSetOutputDir} onClose={() => setShowFsPanel(false)} />}
      {showAgentEditor && <AgentEditorPanel agents={agents} agentTab={agentTab} setAgentTab={setAgentTab} editingAgent={editingAgent} setEditingAgent={setEditingAgent} newAgentForm={newAgentForm} setNewAgentForm={setNewAgentForm} skillsText={skillsText} setSkillsText={setSkillsText} skillsSaving={skillsSaving} skillsAgentId={skillsAgentId} setSkillsAgentId={setSkillsAgentId} pendingSpawns={pendingSpawns} spawnEnabled={spawnEnabled} spawnToggling={spawnToggling} handleCreateAgent={handleCreateAgent} handleUpdateAgent={handleUpdateAgent} handleDeleteAgent={handleDeleteAgent} handleToggleActive={handleToggleActive} handleSaveSkills={handleSaveSkills} handleSpawnDecision={handleSpawnDecision} handleToggleSpawn={handleToggleSpawn} onClose={() => setShowAgentEditor(false)} />}
      {showToolPanel   && <ToolsPanel tools={tools} toolTab={toolTab} setToolTab={setToolTab} editingTool={editingTool} setEditingTool={setEditingTool} newToolForm={newToolForm} setNewToolForm={setNewToolForm} toolMdText={toolMdText} setToolMdText={setToolMdText} toolMdSaving={toolMdSaving} pendingToolSpawns={pendingToolSpawns} handleCreateTool={handleCreateTool} handleUpdateTool={handleUpdateTool} handleDeleteTool={handleDeleteTool} handleToggleToolActive={handleToggleToolActive} handleOpenToolMd={handleOpenToolMd} handleSaveToolMd={handleSaveToolMd} handleToolSpawnDecision={handleToolSpawnDecision} onClose={() => setShowToolPanel(false)} />}
      {showSettings    && <SettingsPanel settingsTab={showSettingsTab} setSettingsTab={setShowSettingsTab} tgConfig={tgConfig} setTgConfig={setTgConfig} tgSaving={tgSaving} tgTesting={tgTesting} tgTestResult={tgTestResult} tgBotSet={tgBotSet} siConfig={siConfig} setSiConfig={setSiConfig} siSaving={siSaving} siRunning={siRunning} bestPractices={bestPractices} proposals={proposals} improvLog={improvLog} wsConfig={wsConfig} setWsConfig={setWsConfig} wsSaving={wsSaving} wsTesting={wsTesting} wsTestResult={wsTestResult} wsTestQuery={wsTestQuery} setWsTestQuery={setWsTestQuery} handleSaveTelegram={handleSaveTelegram} handleTestTelegram={handleTestTelegram} handleSaveSiConfig={handleSaveSiConfig} handleRunImprover={handleRunImprover} handleSaveWsConfig={handleSaveWsConfig} handleTestWsProviders={handleTestWsProviders} handleRunWsQuery={handleRunWsQuery} onClose={() => setShowSettings(false)} />}
      {showKbPanel     && <KnowledgeBasePanel kbTab={kbTab} setKbTab={setKbTab} kbEntries={kbEntries} kbConfig={kbConfig} setKbConfig={setKbConfig} kbConfigSaving={kbConfigSaving} kbUploading={kbUploading} kbSearchQ={kbSearchQ} setKbSearchQ={setKbSearchQ} kbSearchResult={kbSearchResult} kbSearching={kbSearching} kbPasteText={kbPasteText} setKbPasteText={setKbPasteText} kbPasteName={kbPasteName} setKbPasteName={setKbPasteName} kbPasteTags={kbPasteTags} setKbPasteTags={setKbPasteTags} kbFileRef={kbFileRef} ragQuery={ragQuery} setRagQuery={setRagQuery} ragTopK={ragTopK} setRagTopK={setRagTopK} ragLoading={ragLoading} ragResult={ragResult} handleSaveKbConfig={handleSaveKbConfig} handleKbFileUpload={handleKbFileUpload} handleKbPasteIngest={handleKbPasteIngest} handleDeleteKbSource={handleDeleteKbSource} handleClearKb={handleClearKb} handleKbSearch={handleKbSearch} handleRagQuery={handleRagQuery} onClose={() => setShowKbPanel(false)} />}
      {showModelPanel  && <ModelPickerPanel availableModels={availableModels} selectedModel={selectedModel} setSelectedModel={setSelectedModel} currentModel={currentModel} modelSaving={modelSaving} modelError={modelError} handleModelChange={handleModelChange} onClose={() => setShowModelPanel(false)} />}

      <InfoBar connected={connected} currentModel={currentModel} currentPhase={currentPhase} running={running} stats={stats} jobId={jobId} show3DRoom={show3DRoom} setShow3DRoom={setShow3DRoom} modelBadgeColor={modelBadgeColor} />

      {show3DRoom && (
        <div className="canvas-area">
          <div className="canvas-header">
            <span className="canvas-label">🏛️ Agent Office · Drag to orbit · Scroll to zoom</span>
            <button className="canvas-close-btn" onClick={() => setShow3DRoom(false)}>✕ Close</button>
          </div>
          <div className="canvas-3d-wrapper">
            <AgentScene3D activeAgent={activeAgent} agents={agents}
              lastMessages={lastMessages} currentPhase={currentPhase}
              currentWorker={currentWorker} />
          </div>
        </div>
      )}

      <SidePanel mode={mode} setMode={setMode} topic={topic} setTopic={setTopic} running={running} selectedFiles={selectedFiles} setShowUploadPanel={setShowUploadPanel} handleRun={handleRun} agents={agents} activeAgent={activeAgent} lastMessages={lastMessages} logs={logs} setLogs={setLogs} result={result} reportFile={reportFile} reportFormat={reportFormat} handleDownload={handleDownload} />
    </div>
  )
}