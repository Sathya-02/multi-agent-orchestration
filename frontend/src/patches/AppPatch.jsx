/**
 * AppPatch.jsx  — surgical patch summary
 *
 * ROOT CAUSES identified (all confirmed via code-search returning 0 results):
 *
 * 1. showModelPanel overlay block: MISSING from App.jsx JSX return()
 *    → clicking model badge toggled state but rendered nothing
 *
 * 2. handleToggleActive: MISSING function definition
 *    → agent-card deactivate/activate button threw ReferenceError at runtime
 *
 * 3. handleOpenSkills / handleSaveSkills: MISSING function definitions
 *    → 📄 SKILLS.md button on every agent card threw ReferenceError
 *
 * 4. status-dot markup: wrong structure
 *    → App.jsx used bare <div className="status-dot"> with text sibling
 *    → CSS expects <div className="status-dot connected"><div className="status-dot-circle"/>text</div>
 *
 * HOW TO APPLY:
 * Copy each export below back into App.jsx at the indicated injection points.
 * Search for the anchor comment and insert the block immediately after it.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * INJECTION 1 — after handleSpawnDecision(), before modelBadgeColor()
 * Anchor: `await fetchAgents()\n  }`  (end of handleSpawnDecision)
 */

// ── handleToggleActive ────────────────────────────────────────────────────────
export async function handleToggleActive_PATCH(API_URL, agent, fetchAgents, addLog) {
  const ep = agent.active === false ? 'activate' : 'deactivate'
  await fetch(`${API_URL}/agents/${agent.id}/${ep}`, { method: 'POST' })
  await fetchAgents()
  addLog('system', '⚙️ System', `${agent.active === false ? '▶ Activated' : '⏸ Deactivated'} agent: ${agent.role}`)
}

// ── handleOpenSkills ──────────────────────────────────────────────────────────
export async function handleOpenSkills_PATCH(API_URL, agent, setSkillsText, setSkillsAgentId, setAgentTab) {
  setSkillsAgentId(agent.id)
  setAgentTab('skills')
  setSkillsText('Loading…')
  try {
    const d = await fetch(`${API_URL}/agents/${agent.id}/skills`).then(r => r.json())
    setSkillsText(d.content || `# ${agent.role}\n\n## Goal\n${agent.goal}\n\n## Backstory\n${agent.backstory || ''}\n`)
  } catch {
    setSkillsText(`# ${agent.role}\n\n## Goal\n${agent.goal}\n`)
  }
}

// ── handleSaveSkills ──────────────────────────────────────────────────────────
export async function handleSaveSkills_PATCH(API_URL, skillsAgentId, skillsText, setSkillsSaving, addLog, fetchAgents) {
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
  } catch {}
  finally { setSkillsSaving(false) }
}

/**
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * INJECTION 2 — Model Panel JSX overlay block
 * Anchor: inside return(), after {showAgentEditor && ...} close tag
 *         paste this entire block immediately before the </div> that closes app-container
 *
 * ─────────────────────────────────────────────────────────────────────────────
 */
export const MODEL_PANEL_JSX = `
{/* ── Model Panel Overlay ─────────────────────────────────────────────── */}
{showModelPanel && (
  <div className="overlay-panel model-panel">
    <div className="overlay-header">
      <span>🤖 Select Model</span>
      <button className="overlay-close" onClick={() => setShowModelPanel(false)}>✕</button>
    </div>
    <div style={{padding:'0.55rem 0.8rem',borderBottom:'1px solid var(--border)',fontSize:'0.62rem',color:'var(--tx-muted)',fontWeight:700,textTransform:'uppercase',letterSpacing:'0.1em'}}>
      Recommended (M1 8 GB)
    </div>
    <div className="model-list" style={{flex:1,overflowY:'auto'}}>
      {availableModels.map(m => (
        <label key={m.name} className={\`model-option \${selectedModel===m.name?'selected':''}\`}
          onClick={() => setSelectedModel(m.name)}>
          <input type="radio" name="model" value={m.name}
            checked={selectedModel===m.name}
            onChange={() => setSelectedModel(m.name)} />
          <div style={{flex:1,minWidth:0}}>
            <div style={{fontWeight:700,fontSize:'0.78rem',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>
              {m.name}
            </div>
            {m.description && (
              <div style={{fontSize:'0.62rem',color:'var(--tx-muted)',marginTop:'0.1rem'}}>{m.description}</div>
            )}
            <div style={{fontSize:'0.59rem',color:'var(--tx-hint)',marginTop:'0.12rem'}}>
              {m.size_gb ? \`\${m.size_gb} GB\` : ''}
              {m.pulled === false ? <span style={{color:'var(--warning)',marginLeft:4}}>not pulled</span> :
               <span style={{color:'var(--success)',marginLeft:4}}>pulled</span>}
            </div>
          </div>
          {currentModel === m.name && <span className="badge-active">active</span>}
        </label>
      ))}
      {availableModels.length === 0 && (
        <div style={{padding:'1rem',color:'var(--tx-muted)',fontSize:'0.72rem',textAlign:'center'}}>
          No models found. Is Ollama running?
        </div>
      )}
      <div className="model-option" style={{cursor:'default',flexDirection:'column',alignItems:'stretch',gap:4}}>
        <div style={{fontSize:'0.62rem',color:'var(--tx-muted)',fontWeight:700,textTransform:'uppercase',letterSpacing:'0.08em'}}>Custom</div>
        <input
          className="topic-input"
          style={{marginBottom:0}}
          value={selectedModel}
          onChange={e => setSelectedModel(e.target.value)}
          placeholder="e.g. llama3:8b-instruct"
        />
      </div>
    </div>
    {modelError && <div className="error-msg" style={{padding:'0 0.8rem 0.4rem'}}>{modelError}</div>}
    <div style={{padding:'0.65rem 0.8rem',borderTop:'1px solid var(--border)',display:'flex',flexDirection:'column',gap:'0.4rem'}}>
      {selectedModel !== currentModel && (
        <div style={{fontSize:'0.62rem',color:'var(--warning)',padding:'0.3rem 0.5rem',background:'rgba(245,158,11,0.07)',border:'1px solid rgba(245,158,11,0.2)',borderRadius:'var(--radius)',lineHeight:1.5}}>
          ⚠️ If model is not pulled, run:<br/>
          <code style={{fontFamily:'var(--mono)',fontSize:'0.6rem'}}>ollama pull {selectedModel}</code>
        </div>
      )}
      <button className="run-btn"
        onClick={handleModelChange}
        disabled={modelSaving || selectedModel === currentModel}>
        {modelSaving ? '⟳ Applying…' : \`Apply \${selectedModel}\`}
      </button>
    </div>
  </div>
)}
`

/**
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * INJECTION 3 — Fixed status-dot markup
 * Replace the broken status indicator in the header with this:
 *
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * OLD (broken — bare div + floating text):
 *   <div className={`status-dot ${connected?'':'inactive'}`}/>
 *   {connected?'Connected':'Connecting…'}
 *
 * NEW (correct — uses status-dot-circle + text inside the flex container):
 */
export const STATUS_DOT_JSX = `
<div className={\`status-dot \${connected ? 'connected' : ''}\`}>
  <div className="status-dot-circle" />
  {connected ? 'Connected' : 'Connecting…'}
</div>
`
