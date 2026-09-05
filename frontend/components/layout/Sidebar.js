'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { ChevronRight, Folder, PanelLeftClose, PanelLeftOpen } from 'lucide-react'
import clsx from 'clsx'
import { NAV, PORTAL_NAV } from '@/lib/nav'
import { useAuth } from '@/lib/auth'

const STORAGE_KEY = 'uf.sidebar.expanded'
const COLLAPSE_KEY = 'uf.sidebar.collapsed'

/**
 * Grouped collapsible nav — UI.md §4, built from the reference screenshot:
 * small-caps section headers, a folder+chevron group row, children behind a
 * left guide rail. Role-filtered; the active route's group auto-expands.
 */
export function Sidebar({ mobileOpen, onCloseMobile }) {
  const pathname = usePathname()
  const { user } = useAuth()
  const [expanded, setExpanded] = useState({})
  const [railOnly, setRailOnly] = useState(false)
  const [hydrated, setHydrated] = useState(false)

  const nav = user?.role === 'user' ? PORTAL_NAV : NAV
  const sections = user?.role === 'admin' ? nav : nav.filter((s) => !s.adminOnly)

  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}')
      const collapsed = localStorage.getItem(COLLAPSE_KEY) === '1'
      setRailOnly(collapsed)

      // auto-expand whichever group contains the active route
      const auto = { ...saved }
      for (const section of sections) {
        for (const group of section.groups || []) {
          if (group.items.some((i) => pathname?.startsWith(i.href))) {
            auto[group.label] = true
          }
        }
      }
      setExpanded(auto)
    } catch {
      /* ignore malformed storage */
    } finally {
      setHydrated(true)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const toggleGroup = (label) => {
    setExpanded((prev) => {
      const next = { ...prev, [label]: !prev[label] }
      try { localStorage.setItem(STORAGE_KEY, JSON.stringify(next)) } catch { /* ignore */ }
      return next
    })
  }

  const toggleRail = () => {
    setRailOnly((prev) => {
      try { localStorage.setItem(COLLAPSE_KEY, prev ? '0' : '1') } catch { /* ignore */ }
      return !prev
    })
  }

  if (!hydrated) return <aside className="hidden lg:block w-sidebar shrink-0 border-r border-line bg-surface-sidebar" />

  return (
    <>
      {/* mobile overlay */}
      {mobileOpen && (
        <div className="fixed inset-0 z-40 bg-black/30 md:hidden" onClick={onCloseMobile} />
      )}

      <aside
        className={clsx(
          'shrink-0 border-r border-line bg-surface-sidebar transition-[width] duration-150 print:hidden',
          'flex flex-col overflow-hidden',
          // desktop: full width ≥1280, icon rail 1024-1279, hidden <1024 unless drawer open
          railOnly ? 'lg:w-sidebar-rail' : 'lg:w-sidebar',
          'hidden md:flex',
          mobileOpen && 'fixed inset-y-0 left-0 z-50 !flex w-[260px] shadow-pop',
        )}
      >
        <nav className="flex-1 overflow-y-auto py-2">
          {sections.map((section) => (
            <div key={section.section} className="px-2">
              {!railOnly && (
                <div className="mt-4 mb-1 px-2 text-[10px] font-semibold uppercase text-ink-faint" style={{ letterSpacing: '0.08em' }}>
                  {section.section}
                </div>
              )}

              {section.flat
                ? section.items.map((item) => (
                    <NavLeaf key={item.href} item={item} pathname={pathname} railOnly={railOnly} onNavigate={onCloseMobile} />
                  ))
                : section.groups.map((group) => (
                    <div key={group.label}>
                      <button
                        onClick={() => (railOnly ? toggleRail() : toggleGroup(group.label))}
                        className={clsx(
                          'flex w-full items-center gap-2 rounded px-2 text-sm text-ink hover:bg-surface-hover',
                          'h-8',
                        )}
                        title={railOnly ? group.label : undefined}
                      >
                        <Folder size={15} className="shrink-0 text-ink-faint" />
                        {!railOnly && (
                          <>
                            <span className="flex-1 truncate text-left font-medium">{group.label}</span>
                            <ChevronRight
                              size={13}
                              className={clsx('shrink-0 text-ink-faint transition-transform duration-150', expanded[group.label] && 'rotate-90')}
                            />
                          </>
                        )}
                      </button>

                      {!railOnly && expanded[group.label] && (
                        <div className="nav-rail ml-[15px] pl-4">
                          {group.items.map((item) => (
                            <NavLeaf key={item.href} item={item} pathname={pathname} onNavigate={onCloseMobile} />
                          ))}
                        </div>
                      )}
                    </div>
                  ))}
            </div>
          ))}
        </nav>

        <button
          onClick={toggleRail}
          className="hidden lg:flex items-center justify-center gap-2 border-t border-line py-2 text-ink-faint hover:bg-surface-hover hover:text-ink"
        >
          {railOnly ? <PanelLeftOpen size={16} /> : <PanelLeftClose size={16} />}
        </button>
      </aside>
    </>
  )
}

function NavLeaf({ item, pathname, railOnly, onNavigate }) {
  const active = pathname === item.href || pathname?.startsWith(item.href + '/')
  return (
    <Link
      href={item.href}
      onClick={onNavigate}
      className={clsx(
        'relative flex h-[30px] items-center rounded px-2 text-sm transition-colors duration-150',
        active ? 'bg-brand-light font-medium text-brand' : 'text-ink-muted hover:bg-surface-hover hover:text-ink',
        railOnly && 'justify-center px-0',
      )}
      title={railOnly ? item.label : undefined}
    >
      {active && <span className="absolute left-0 top-1 bottom-1 w-[2px] rounded-full bg-brand" />}
      {railOnly ? item.label.slice(0, 1) : item.label}
    </Link>
  )
}
