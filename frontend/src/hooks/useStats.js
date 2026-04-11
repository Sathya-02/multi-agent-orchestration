import { useEffect, useRef, useState } from 'react'
import { API_URL } from '../utils/constants'

/**
 * Polls /stats every 3 s and returns the latest stats object.
 */
export function useStats() {
  const [stats, setStats] = useState(null)
  const timerRef = useRef(null)

  useEffect(() => {
    const poll = () =>
      fetch(`${API_URL}/stats`)
        .then(r => r.json())
        .then(setStats)
        .catch(() => {})

    poll()
    timerRef.current = setInterval(poll, 3_000)
    return () => clearInterval(timerRef.current)
  }, [])

  return { stats }
}
