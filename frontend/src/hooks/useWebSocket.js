import { useEffect, useRef, useState, useCallback } from 'react'
import { WS_URL } from '../utils/constants'

/**
 * Manages a WebSocket connection with auto-reconnect and keepalive pings.
 *
 * @param {object}   options
 * @param {function} options.onMessage  - Called with parsed JSON payload on every incoming message
 * @param {function} [options.onOpen]   - Called once the socket successfully opens
 */
export function useWebSocket({ onMessage, onOpen }) {
  const [connected, setConnected] = useState(false)
  const wsRef      = useRef(null)
  // Keep a stable ref to the latest callbacks so the effect closure never goes stale
  const onMessageRef = useRef(onMessage)
  const onOpenRef    = useRef(onOpen)
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
        if (cancelled) return
        try { onMessageRef.current(JSON.parse(e.data)) } catch {}
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
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // Keepalive — send a ping every 20 s while the socket is open
  useEffect(() => {
    const id = setInterval(() => {
      if (wsRef.current?.readyState === WebSocket.OPEN)
        wsRef.current.send(JSON.stringify({ type: 'ping' }))
    }, 20_000)
    return () => clearInterval(id)
  }, [])

  const send = useCallback((payload) => {
    if (wsRef.current?.readyState === WebSocket.OPEN)
      wsRef.current.send(JSON.stringify(payload))
  }, [])

  return { connected, wsRef, send }
}
