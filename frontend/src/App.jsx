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
