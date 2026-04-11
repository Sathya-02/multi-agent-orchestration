export const WS_URL  = 'ws://localhost:8000/ws'
export const API_URL = 'http://localhost:8000'
export const BUILTIN = ['coordinator','researcher','analyst','writer']
export const PHASE_ORDER = ['coordinator','researcher','analyst','writer']
export const PHASE_META = {
  coordinator: { icon: '🎯', name: 'Coordinator' },
  researcher:  { icon: '🔍', name: 'Researcher'  },
  analyst:     { icon: '📊', name: 'Analyst'     },
  writer:      { icon: '✍️',  name: 'Writer'      },
}
export const MODES = [
  { id: 'research', label: '🔬 Research',      desc: 'Full 4-agent pipeline' },
  { id: 'query',    label: '💬 Quick Query',   desc: 'Single-agent Q&A / maths' },
  { id: 'file',     label: '📎 File Analysis', desc: 'Analyse uploaded files' },
]