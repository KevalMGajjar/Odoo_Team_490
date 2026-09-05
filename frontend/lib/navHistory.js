'use client'

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import { usePathname } from 'next/navigation'

/**
 * A trail of the pages you've actually visited, so you can step back several
 * hops without hammering the browser's back button.
 *
 * Labels come from each page's own ControlPanel title rather than being
 * guessed from the URL. That is what makes the trail readable: the URL only
 * knows `/bills/2f9c…`, while the page knows it is "BILL/2026/0013".
 *
 * Session-scoped on purpose — a trail that outlived the tab would send you
 * back to records from a previous sitting.
 */

const MAX_ENTRIES = 6
const STORAGE_KEY = 'uf_nav_trail'

const NavHistoryContext = createContext(null)

export function NavHistoryProvider({ children }) {
  const [trail, setTrail] = useState([])

  // Restore after mount, never during render — reading sessionStorage while
  // rendering would differ between server and client and break hydration.
  useEffect(() => {
    try {
      const saved = sessionStorage.getItem(STORAGE_KEY)
      if (!saved) return
      const restored = JSON.parse(saved)
      // Merge rather than replace. React runs child effects before the
      // parent's, so on a full page load the current page has already
      // registered itself by now — assigning the saved trail straight over the
      // top would drop the page you are actually looking at.
      setTrail((prev) => {
        const merged = [...restored]
        for (const entry of prev) {
          if (!merged.some((e) => e.path === entry.path)) merged.push(entry)
        }
        return merged.slice(-MAX_ENTRIES)
      })
    } catch { /* private mode, or storage disabled */ }
  }, [])

  const record = useCallback((path, label) => {
    if (!path || !label) return
    setTrail((prev) => {
      const last = prev[prev.length - 1]
      // Re-rendering the same page (a reload, a filter change) must not stack
      // duplicate entries.
      if (last && last.path === path) {
        if (last.label === label) return prev
        const updated = [...prev.slice(0, -1), { path, label }]
        persist(updated)
        return updated
      }
      // Revisiting an earlier page rewinds the trail to that point instead of
      // growing it, so going back and forth doesn't produce a long chain of
      // the same two pages.
      const seen = prev.findIndex((e) => e.path === path)
      const base = seen >= 0 ? prev.slice(0, seen) : prev
      const updated = [...base, { path, label }].slice(-MAX_ENTRIES)
      persist(updated)
      return updated
    })
  }, [])

  const clear = useCallback(() => {
    setTrail([])
    try { sessionStorage.removeItem(STORAGE_KEY) } catch { /* no-op */ }
  }, [])

  const value = useMemo(() => ({ trail, record, clear }), [trail, record, clear])
  return <NavHistoryContext.Provider value={value}>{children}</NavHistoryContext.Provider>
}

function persist(trail) {
  try { sessionStorage.setItem(STORAGE_KEY, JSON.stringify(trail)) } catch { /* no-op */ }
}

export function useNavHistory() {
  return useContext(NavHistoryContext) ?? { trail: [], record: () => {}, clear: () => {} }
}

/** Called by ControlPanel so each page contributes its own real title. */
export function useRegisterPage(label) {
  const pathname = usePathname()
  const { record } = useNavHistory()

  useEffect(() => {
    // Skip the loading placeholder — recording "Loading…" then replacing it
    // makes the trail flicker on every navigation.
    if (!label || label === 'Loading…') return
    record(pathname, label)
  }, [pathname, label, record])
}
