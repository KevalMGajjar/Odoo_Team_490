'use client'

import { useEffect, useState } from 'react'

/**
 * Connectivity indicator for the topbar (PLAN.md §12b). `navigator.onLine`
 * plus the browser's own online/offline events — cheap and accurate enough
 * for "can I reach the network at all", which is what the chip communicates.
 */
export function useOnlineStatus() {
  const [online, setOnline] = useState(true)

  useEffect(() => {
    setOnline(typeof navigator !== 'undefined' ? navigator.onLine : true)
    const goOnline = () => setOnline(true)
    const goOffline = () => setOnline(false)
    window.addEventListener('online', goOnline)
    window.addEventListener('offline', goOffline)
    return () => {
      window.removeEventListener('online', goOnline)
      window.removeEventListener('offline', goOffline)
    }
  }, [])

  return online
}
