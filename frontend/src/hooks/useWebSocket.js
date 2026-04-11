import { useEffect, useRef, useState } from 'react'

const WS_URL = 'ws://localhost:8000/ws'

/**
 * Manages a persistent WebSocket connection with auto-reconnect
 * and a keepalive ping every 20 seconds.
 *
 * @param {object} opts
 * @param {function} opts.onMessage  - called with the parsed JSON payload
 * @param {function} [opts.onOpen]  - called when the socket first opens
 */
export function useWebSocket({ onMessage, onOpen } = {}) {
  const [connected, setConnected] = useState(false)
  const wsRef       = useRef(null)
  const onMessageRef = useRef(onMessage)
  const onOpenRef    = useRef(onOpen)

  // Keep refs fresh without re-running the effect
  useEffect(() => { onMessageRef.current = onMessage }, [onMessage])
  useEffect(() => { onOpenRef.current    = onOpen    }, [onOpen])

  useEffect(() => {
    let cancelled = false

    const connect = () => {
      if (cancelled) return
      const ws = new WebSocket(WS_URL)
      wsRef.current = ws

      ws.onopen = () => {
        if (cancelled) return
        setConnected(true)
        onOpenRef.current?.()
      }

      ws.onmessage = (e) => {
        try {
          onMessageRef.current?.(JSON.parse(e.data))
        } catch {}
      }

      ws.onclose = () => {
        if (cancelled) return
        setConnected(false)
        setTimeout(connect, 1500)
      }

      ws.onerror = () => ws.close()
    }

    connect()

    return () => {
      cancelled = true
      wsRef.current?.close()
    }
  }, []) // intentionally empty — stable via refs

  // Keepalive ping
  useEffect(() => {
    const id = setInterval(() => {
      if (wsRef.current?.readyState === WebSocket.OPEN) {
        wsRef.current.send(JSON.stringify({ type: 'ping' }))
      }
    }, 20_000)
    return () => clearInterval(id)
  }, [])

  return { connected, wsRef }
}
