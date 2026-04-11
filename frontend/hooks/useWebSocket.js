import { useEffect, useRef, useState } from 'react'
import { WS_URL } from '../utils/constants'

export function useWebSocket({ onMessage, onOpen }) {
  const [connected, setConnected] = useState(false)
  const wsRef = useRef(null)

  useEffect(() => {
    const connect = () => {
      const ws = new WebSocket(WS_URL)
      wsRef.current = ws
      ws.onopen    = () => { setConnected(true); onOpen?.() }
      ws.onmessage = (e) => onMessage(JSON.parse(e.data))
      ws.onclose   = () => { setConnected(false); setTimeout(connect, 1500) }
      ws.onerror   = () => ws.close()
    }
    connect()
    return () => wsRef.current?.close()
  }, []) // eslint-disable-line

  useEffect(() => {
    const id = setInterval(() => {
      if (wsRef.current?.readyState === WebSocket.OPEN)
        wsRef.current.send(JSON.stringify({ type: 'ping' }))
    }, 20000)
    return () => clearInterval(id)
  }, [])

  return { connected, wsRef }
}