'use client'

import { useEffect, useRef, useState } from 'react'
import { ChevronDown, X } from 'lucide-react'
import clsx from 'clsx'
import { api } from '@/lib/api'

/**
 * Async-search combobox for pickers with more options than a plain <select>
 * should hold (contacts, products, accounts across a growing chart). Fetches
 * `{path}?q=` and expects `{ rows: [...] }`, matching every masters endpoint.
 */
export function SearchSelect({
  path,
  value,
  onChange,
  getLabel = (o) => o.name,
  getSubLabel,
  placeholder = 'Search…',
  extraParams,
  disabled,
  error,
  resolvedOption, // pass the already-known object to avoid a lookup round-trip
}) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [options, setOptions] = useState([])
  const [loading, setLoading] = useState(false)
  const [selected, setSelected] = useState(resolvedOption ?? null)
  const boxRef = useRef(null)

  useEffect(() => {
    if (resolvedOption) setSelected(resolvedOption)
  }, [resolvedOption])

  useEffect(() => {
    if (!open) return undefined
    const onClickAway = (e) => { if (boxRef.current && !boxRef.current.contains(e.target)) setOpen(false) }
    document.addEventListener('mousedown', onClickAway)
    return () => document.removeEventListener('mousedown', onClickAway)
  }, [open])

  useEffect(() => {
    if (!open) return
    let cancelled = false
    setLoading(true)
    const t = setTimeout(async () => {
      try {
        const res = await api.get(path, { q: query, pageSize: 20, ...extraParams })
        if (!cancelled) setOptions(res.rows ?? [])
      } finally {
        if (!cancelled) setLoading(false)
      }
    }, 180)
    return () => { cancelled = true; clearTimeout(t) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query, open, path, JSON.stringify(extraParams)])

  const pick = (opt) => {
    setSelected(opt)
    onChange(opt)
    setOpen(false)
    setQuery('')
  }

  const clear = (e) => {
    e.stopPropagation()
    setSelected(null)
    onChange(null)
  }

  return (
    <div ref={boxRef} className="relative">
      <button
        type="button"
        disabled={disabled}
        onClick={() => setOpen((v) => !v)}
        className={clsx('field-input flex items-center justify-between gap-2 text-left', disabled && 'cursor-not-allowed')}
        aria-invalid={Boolean(error)}
      >
        <span className={clsx('truncate', !selected && 'text-ink-faint')}>
          {selected ? getLabel(selected) : placeholder}
        </span>
        <span className="flex items-center gap-1 shrink-0">
          {selected && !disabled && (
            <X size={12} className="text-ink-faint hover:text-ink" onClick={clear} />
          )}
          <ChevronDown size={13} className="text-ink-faint" />
        </span>
      </button>

      {open && (
        <div className="absolute z-30 mt-1 w-full rounded border border-line bg-surface-sheet shadow-pop">
          <input
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Type to search…"
            className="w-full border-b border-line px-3 py-2 text-sm outline-none"
          />
          <div className="max-h-56 overflow-y-auto py-1">
            {loading ? (
              <p className="px-3 py-2 text-xs text-ink-faint">Searching…</p>
            ) : options.length === 0 ? (
              <p className="px-3 py-2 text-xs text-ink-faint">No matches</p>
            ) : (
              options.map((opt) => (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => pick(opt)}
                  className="flex w-full items-center justify-between px-3 py-1.5 text-left text-sm text-ink hover:bg-surface-hover"
                >
                  <span className="truncate">{getLabel(opt)}</span>
                  {getSubLabel && <span className="shrink-0 text-xs text-ink-faint">{getSubLabel(opt)}</span>}
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  )
}
