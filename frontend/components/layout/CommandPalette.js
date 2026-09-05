'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createPortal } from 'react-dom'
import { Search } from 'lucide-react'
import { NAV } from '@/lib/nav'
import { useMounted } from '@/lib/useMounted'

/**
 * ⌘K jump-to-anything (UI.md §6). Flattens the nav tree into a searchable
 * list plus a handful of verbs. A record-number search (e.g. "INV/2026/0004")
 * is a natural extension point once a global search endpoint exists.
 */
const VERBS = [
  { label: 'New Vendor Bill', href: '/bills/new' },
  { label: 'New Customer Invoice', href: '/invoices/new' },
  { label: 'New Journal Entry', href: '/journal-entries/new' },
  { label: 'Trial Balance', href: '/reports/trial-balance' },
  { label: 'Balance Sheet', href: '/reports/balance-sheet' },
]

function flattenNav() {
  const rows = []
  for (const section of NAV) {
    if (section.flat) {
      for (const item of section.items) rows.push({ label: item.label, href: item.href, group: section.section })
    } else {
      for (const group of section.groups || []) {
        for (const item of group.items) rows.push({ label: item.label, href: item.href, group: group.label })
      }
    }
  }
  return rows
}

export function CommandPalette({ open, onClose }) {
  const router = useRouter()
  const [query, setQuery] = useState('')
  const [index, setIndex] = useState(0)
  const inputRef = useRef(null)
  const navItems = useMemo(flattenNav, [])
  const mounted = useMounted()

  const results = useMemo(() => {
    const all = [...VERBS.map((v) => ({ ...v, group: 'Action' })), ...navItems]
    if (!query.trim()) return all.slice(0, 8)
    const q = query.toLowerCase()
    return all.filter((r) => r.label.toLowerCase().includes(q)).slice(0, 12)
  }, [query, navItems])

  useEffect(() => {
    if (open) {
      setQuery('')
      setIndex(0)
      setTimeout(() => inputRef.current?.focus(), 0)
    }
  }, [open])

  const go = (href) => {
    router.push(href)
    onClose()
  }

  const onKeyDown = (e) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setIndex((i) => Math.min(i + 1, results.length - 1)) }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setIndex((i) => Math.max(i - 1, 0)) }
    else if (e.key === 'Enter' && results[index]) go(results[index].href)
    else if (e.key === 'Escape') onClose()
  }

  if (!open || !mounted) return null

  return createPortal(
    <div className="fixed inset-0 z-[70] flex items-start justify-center bg-black/30 p-4 pt-[12vh]" onClick={onClose}>
      <div
        className="w-full max-w-lg rounded border border-line bg-surface-sheet shadow-pop"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-2 border-b border-line px-3 py-2.5">
          <Search size={15} className="text-ink-faint" />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => { setQuery(e.target.value); setIndex(0) }}
            onKeyDown={onKeyDown}
            placeholder="Search or jump to… (try 'new invoice')"
            className="flex-1 bg-transparent text-sm text-ink outline-none placeholder:text-ink-faint"
          />
          <kbd className="rounded border border-line px-1 text-[10px] text-ink-faint">Esc</kbd>
        </div>
        <div className="max-h-80 overflow-y-auto py-1">
          {results.length === 0 && <p className="px-3 py-4 text-sm text-ink-faint">No matches</p>}
          {results.map((r, i) => (
            <button
              key={`${r.group}-${r.href}`}
              onClick={() => go(r.href)}
              onMouseEnter={() => setIndex(i)}
              className={
                'flex w-full items-center justify-between px-3 py-2 text-left text-sm ' +
                (i === index ? 'bg-brand-light text-brand' : 'text-ink hover:bg-surface-hover')
              }
            >
              <span>{r.label}</span>
              <span className="text-xs text-ink-faint">{r.group}</span>
            </button>
          ))}
        </div>
      </div>
    </div>,
    document.body,
  )
}
