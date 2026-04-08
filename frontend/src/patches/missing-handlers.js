/**
 * missing-handlers.js
 *
 * Documents the two handlers that were missing from App.jsx
 * and caused runtime crashes (blank page on submit, 0 badge counts).
 *
 * Root cause analysis:
 * 1. handleToggleActive(agent)  — called in AgentCard list but never defined
 * 2. handleOpenSkills(agent)    — called in agent skills btn but never defined
 * 3. handleSaveSkills()         — called in SKILLS.md editor but never defined
 *
 * These missing functions cause React to throw on first render of
 * the overlay, which in turn causes the error boundary to kick in
 * and show a blank page. The fetch chain (fetchTools, fetchAgents)
 * still runs but the component tree is broken so badge state never
 * propagates to the DOM.
 *
 * Fix: add the three handlers to App.jsx (see App.jsx patch commit).
 */
