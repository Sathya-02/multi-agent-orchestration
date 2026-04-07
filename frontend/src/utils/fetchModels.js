/**
 * fetchModels — resolves the list of available Ollama models.
 *
 * Strategy (in order):
 *  1. Ask the backend  GET /models  — returns { active, presets:[{id,label},…] }
 *  2. If presets is empty, fall back to Ollama directly: GET http://localhost:11434/api/tags
 *
 * Embed-only models (nomic-embed-text, mxbai-embed-large) are excluded from
 * the chat model selector because they cannot generate text responses.
 */

const EMBED_ONLY = ['nomic-embed-text', 'mxbai-embed-large']
const isEmbedOnly = (name) => EMBED_ONLY.some(e => name.startsWith(e))

export async function fetchModels(apiUrl) {
  let active = ''
  let modelList = []

  // ── Step 1: ask the backend ──────────────────────────────────────────────
  try {
    const d = await fetch(`${apiUrl}/models`).then(r => r.json())
    active = d.active || ''
    const presets = Array.isArray(d.presets) ? d.presets : []
    modelList = presets
      .map(p => (typeof p === 'string' ? p : p.id || p.label || p))
      .filter(Boolean)
      .filter(m => !isEmbedOnly(m))
  } catch { /* backend unreachable — fall through */ }

  // ── Step 2: fall back to Ollama directly if still empty ──────────────────
  if (modelList.length === 0) {
    try {
      const d = await fetch('http://localhost:11434/api/tags').then(r => r.json())
      modelList = (d.models || [])
        .map(m => m.name)
        .filter(Boolean)
        .filter(m => !isEmbedOnly(m))
    } catch { /* Ollama also unreachable */ }
  }

  return { active, modelList }
}
