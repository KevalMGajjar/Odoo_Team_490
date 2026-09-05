'use client'

import { useEffect, useState } from 'react'

/**
 * True only after the client has hydrated.
 *
 * Never branch a portal (or anything else) on `typeof document !== 'undefined'`
 * inline — the server always sees `undefined` and the client never does, so
 * React's hydration pass diffs a tree the server never rendered and discards
 * it (a visible flash, and exactly the mismatch React's own error message
 * calls out as a common cause). Gating on a `useEffect`-driven flag instead
 * makes the FIRST client render agree with the server; the portal only
 * appears a tick later, after hydration is already reconciled.
 */
export function useMounted() {
  const [mounted, setMounted] = useState(false)
  useEffect(() => setMounted(true), [])
  return mounted
}
