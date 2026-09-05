'use client'

import { useEffect, useState } from 'react'

/**
 * Returns `value` only after it has stopped changing for `delay` ms.
 *
 * Search inputs previously issued one request per keystroke: typing
 * "Kishan" fired six overlapping requests, and because responses can land out
 * of order the list could settle on the results for a prefix rather than what
 * was actually typed. Debouncing collapses that to a single request.
 */
export function useDebouncedValue(value, delay = 300) {
  const [debounced, setDebounced] = useState(value)

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay)
    return () => clearTimeout(timer)
  }, [value, delay])

  return debounced
}
