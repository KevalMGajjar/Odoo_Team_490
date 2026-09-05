'use client'

import { useState } from 'react'
import { Sidebar } from './Sidebar'
import { Topbar } from './Topbar'

/**
 * Sidebar + Topbar wrapper. Responsive per UI.md §7:
 *   ≥1280  sidebar expanded
 *   1024–1279  icon rail (handled inside Sidebar)
 *   <1024  drawer, opened from the topbar's menu button
 */
export function AppShell({ children }) {
  const [mobileOpen, setMobileOpen] = useState(false)

  return (
    // print:h-auto/overflow-visible throughout this tree — a fixed-height,
    // overflow:auto layout only ever paints what's scrolled into view, so
    // without this a printed page would come out blank past the fold.
    <div className="flex h-screen flex-col overflow-hidden bg-surface-bg print:h-auto print:overflow-visible">
      <Topbar onMenuClick={() => setMobileOpen((v) => !v)} />
      <div className="flex flex-1 overflow-hidden print:overflow-visible">
        <Sidebar mobileOpen={mobileOpen} onCloseMobile={() => setMobileOpen(false)} />
        <main className="flex-1 overflow-y-auto overflow-x-hidden print:overflow-visible">{children}</main>
      </div>
    </div>
  )
}
