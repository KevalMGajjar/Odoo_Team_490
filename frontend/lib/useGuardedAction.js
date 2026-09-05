'use client'

import { useCallback, useRef, useState } from 'react'

/**
 * Wraps an async handler so a second invocation while the first is still in
 * flight is dropped outright. A React state flag alone isn't enough here —
 * `disabled={loading}` on the button only takes effect once React commits the
 * re-render, and two clicks fired in quick succession (a fast double-click,
 * or a stray double dispatch) can both reach the handler before that commit
 * happens, posting the same document twice. The ref check below is
 * synchronous and closes that race regardless of render timing.
 */
export function useGuardedAction(fn) {
  const busyRef = useRef(false)
  const [busy, setBusy] = useState(false)

  const run = useCallback(async (...args) => {
    if (busyRef.current) return
    busyRef.current = true
    setBusy(true)
    try {
      return await fn(...args)
    } finally {
      busyRef.current = false
      setBusy(false)
    }
  }, [fn])

  return [run, busy]
}
