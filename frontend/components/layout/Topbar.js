'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Menu, Search, Moon, Sun, ChevronDown, LogOut, Wifi, WifiOff } from 'lucide-react'
import { useAuth } from '@/lib/auth'
import { useOnlineStatus } from '@/lib/useOnlineStatus'
import { useTheme } from '@/lib/useTheme'
import { CommandPalette } from './CommandPalette'

const ROLE_LABEL = { admin: 'Admin', invoicing_user: 'Invoicing User', viewer: 'Viewer', contact: 'Portal' }

/** 44px, per UI.md §3 — search, connectivity, dark toggle, user menu. */
export function Topbar({ onMenuClick }) {
  const { user, logout } = useAuth()
  const router = useRouter()
  const online = useOnlineStatus()
  const { toggle } = useTheme()
  const [menuOpen, setMenuOpen] = useState(false)
  const [paletteOpen, setPaletteOpen] = useState(false)

  // global ⌘K / Ctrl+K — owned here since Topbar holds the open state
  useEffect(() => {
    const onKey = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault()
        setPaletteOpen(true)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const initials = (user?.name || '?')
    .split(' ')
    .map((p) => p[0])
    .slice(0, 2)
    .join('')
    .toUpperCase()

  return (
    <header className="flex h-topbar shrink-0 items-center gap-3 border-b border-line bg-surface-header px-3">
      <button onClick={onMenuClick} className="rounded p-1.5 text-ink-muted hover:bg-surface-hover md:hidden" aria-label="Menu">
        <Menu size={18} />
      </button>

      <Link href="/dashboard" className="flex items-center gap-2 shrink-0">
        <span className="h-6 w-6 rounded-sm bg-brand" aria-hidden />
        <span className="hidden sm:inline text-sm font-semibold text-ink">Urban Furniture</span>
      </Link>

      <button
        onClick={() => setPaletteOpen(true)}
        className="flex flex-1 max-w-md items-center gap-2 rounded-sm border border-line bg-surface-sheet px-3 py-1.5 text-xs text-ink-faint hover:border-line-strong"
      >
        <Search size={13} />
        <span className="flex-1 text-left">Search or jump to…</span>
        <kbd className="hidden sm:inline rounded border border-line bg-surface-subtle px-1 text-[10px]">⌘K</kbd>
      </button>

      <div className="ml-auto flex items-center gap-2 shrink-0">
        <span
          className={
            'hidden sm:flex items-center gap-1 rounded-sm px-2 py-1 text-xs font-medium ' +
            (online ? 'text-state-paid' : 'text-state-overdue')
          }
          title={online ? 'Connected' : 'Offline — read-only until reconnected'}
        >
          {online ? <Wifi size={13} /> : <WifiOff size={13} />}
          {online ? 'Online' : 'Offline'}
        </span>

        <button onClick={toggle} className="rounded p-1.5 text-ink-muted hover:bg-surface-hover" aria-label="Toggle theme">
          <Sun size={16} className="dark:hidden" />
          <Moon size={16} className="hidden dark:block" />
        </button>

        <div className="relative">
          <button
            onClick={() => setMenuOpen((v) => !v)}
            className="flex items-center gap-1.5 rounded-sm py-1 pl-1 pr-2 hover:bg-surface-hover"
          >
            <span className="flex h-6 w-6 items-center justify-center rounded-full bg-brand text-[11px] font-semibold text-ink-invert">
              {initials}
            </span>
            <ChevronDown size={13} className="text-ink-faint" />
          </button>

          {menuOpen && (
            <>
              <div className="fixed inset-0 z-10" onClick={() => setMenuOpen(false)} />
              <div className="absolute right-0 z-20 mt-1 w-52 rounded border border-line bg-surface-sheet py-1 shadow-pop">
                <div className="border-b border-line px-3 py-2">
                  <p className="truncate text-sm font-medium text-ink">{user?.name}</p>
                  <p className="text-xs text-ink-muted">{ROLE_LABEL[user?.role] ?? user?.role}</p>
                </div>
                <button
                  onClick={async () => { await logout(); router.push('/login') }}
                  className="flex w-full items-center gap-2 px-3 py-2 text-sm text-ink hover:bg-surface-hover"
                >
                  <LogOut size={14} /> Sign out
                </button>
              </div>
            </>
          )}
        </div>
      </div>

      <CommandPalette open={paletteOpen} onClose={() => setPaletteOpen(false)} />
    </header>
  )
}
