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
    <div className="flex h-screen flex-col overflow-hidden bg-surface-bg">
      <Topbar onMenuClick={() => setMobileOpen((v) => !v)} />
      <div className="flex flex-1 overflow-hidden">
        <Sidebar mobileOpen={mobileOpen} onCloseMobile={() => setMobileOpen(false)} />
        <main className="flex-1 overflow-y-auto overflow-x-hidden">{children}</main>
      </div>
    </div>
  )
}
