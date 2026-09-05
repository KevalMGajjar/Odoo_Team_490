'use client'

import { useEffect, useRef, useState } from 'react'
import { Search as SearchIcon, X } from 'lucide-react'
import clsx from 'clsx'

/**
 * Search input with Odoo-style column suggestions.
 *
 * Typing offers "Search Name for: kishan", "Search City for: kishan" and so
 * on. Picking one pins a facet so the query runs against that column only,
 * which is what makes search usable once a list is long enough that a term
 * matches several columns at once.
 *
 * With nothing pinned the search spans every configured column, so the plain
 * case still works without touching the dropdown.
 */
export function SearchBox({ value, onChange, columns = [], field, onFieldChange, placeholder = 'Search…' }) {
  const [open, setOpen] = useState(false)
  const boxRef = useRef(null)

  useEffect(() => {
    const away = (e) => { if (boxRef.current && !boxRef.current.contains(e.target)) setOpen(false) }
    document.addEventListener('mousedown', away)
    return () => document.removeEventListener('mousedown', away)
  }, [])

  const activeColumn = columns.find((c) => c.key === field)
  const showSuggestions = open && value.trim().length > 0 && columns.length > 0 && !field

  const pick = (key) => {
    onFieldChange?.(key)
    setOpen(false)
  }

  return (
    <div ref={boxRef} className="relative w-full max-w-xs">
      <div className="relative">
        <SearchIcon size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-ink-faint" />
        <input
          value={value}
          onChange={(e) => { onChange(e.target.value); setOpen(true) }}
          onFocus={() => setOpen(true)}
          onKeyDown={(e) => {
            if (e.key === 'Escape') setOpen(false)
            // Backspace on an empty box clears the pinned column, the way a
            // chip-based filter is normally dismissed.
            if (e.key === 'Backspace' && !value && field) onFieldChange?.(null)
          }}
          placeholder={activeColumn ? `Search ${activeColumn.label}…` : placeholder}
          className={clsx('field-input pl-7', activeColumn && 'pr-24')}
        />
        {activeColumn && (
          <button
            type="button"
            onClick={() => onFieldChange?.(null)}
            className="absolute right-1.5 top-1/2 flex -translate-y-1/2 items-center gap-1 rounded-sm bg-brand-light px-1.5 py-0.5 text-[11px] font-medium text-brand"
            title="Search all columns instead"
          >
            {activeColumn.label} <X size={10} />
          </button>
        )}
      </div>

      {showSuggestions && (
        <div className="absolute left-0 right-0 z-30 mt-1 rounded border border-line bg-surface-sheet py-1 shadow-pop">
          <p className="px-3 py-1 text-[10px] font-semibold uppercase tracking-wide text-ink-faint">Search in</p>
          {columns.map((c) => (
            <button
              key={c.key}
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => pick(c.key)}
              className="flex w-full items-center gap-1 px-3 py-1.5 text-left text-sm text-ink hover:bg-surface-hover"
            >
              <span className="text-ink-muted">{c.label}</span>
              <span className="text-ink-faint">for</span>
              <span className="truncate font-medium">{value}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
