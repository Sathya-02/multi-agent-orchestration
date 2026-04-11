import { useEffect, useRef, useState } from 'react'
import { API_URL } from '../utils/constants'

/**
 * Polls /stats every 3 seconds and returns the latest stats object.
 * Safe to mount multiple times — each instance polls independently.
 */
export function useStats(intervalMs = 3000) {
  const [stats, setStats]   = useState(null)
  const [error, setError]   = useState(null)
  const timerRef = useRef(null)

  useEffect(() => {
    let cancelled = false

    const poll = async () => {
      try {
        const data = await fetch(`${API_URL}/stats`).then(r => r.json())
        if (!cancelled) { setStats(data); setError(null) }
      } catch (e) {
        if (!cancelled) setError(e)
      }
    }

    poll()
    timerRef.current = setInterval(poll, intervalMs)

    return () => {
      cancelled = true
      clearInterval(timerRef.current)
    }
  }, [intervalMs])

  return { stats, error }
}
