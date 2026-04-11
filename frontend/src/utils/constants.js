// Empty string = relative URLs → Vite proxy handles them in dev.
// Set VITE_API_URL at build time for production deployments.
export const API_URL = typeof __API_URL__ !== 'undefined' && __API_URL__
  ? __API_URL__
  : ''

export const WS_URL =
  (typeof __API_URL__ !== 'undefined' && __API_URL__)
    ? __API_URL__.replace(/^http/, 'ws') + '/ws'
    : `ws://${window.location.host}/ws`

export const PHASE_ORDER = ['coordinator', 'researcher', 'analyst', 'writer']

export const PHASE_META = {
  coordinator: { icon: '\uD83C\uDFAF', name: 'Coordinator' },
  researcher:  { icon: '\uD83D\uDD0D', name: 'Researcher'  },
  analyst:     { icon: '\uD83D\uDCCA', name: 'Analyst'     },
  writer:      { icon: '\u270D\uFE0F',  name: 'Writer'      },
}

export const MODES = [
  { id: 'research', label: '\uD83D\uDD2C Research',      desc: 'Full 4-agent pipeline' },
  { id: 'query',    label: '\uD83D\uDCAC Quick Query',   desc: 'Single-agent Q&A / maths' },
  { id: 'file',     label: '\uD83D\uDCCE File Analysis', desc: 'Analyse uploaded files' },
]

export const BUILTIN_ROLES = ['coordinator', 'researcher', 'analyst', 'writer']
