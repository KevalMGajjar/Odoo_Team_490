'use client'

import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { ChevronDown, X } from 'lucide-react'
import clsx from 'clsx'
import { api } from '@/lib/api'
import { useMounted } from '@/lib/useMounted'

/**
 * Async-search combobox for pickers with more options than a plain <select>
 * should hold (contacts, products, accounts across a growing chart). Fetches
 * `{path}?q=` and expects `{ rows: [...] }`, matching every masters endpoint.
 *
 * The popup renders through a portal at a `fixed` position computed from the
 * trigger button's own bounding rect, rather than as an `absolute` child of
 * this component — a document form's scroll container (or a table row inside
 * one) would otherwise clip it for any field not near the top of the visible
 * area, exactly the way `components/ui/Modal.js` already portals to avoid
 * the same problem.
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
  const [coords, setCoords] = useState(null)
  const triggerRef = useRef(null)
  const dropdownRef = useRef(null)
  const mounted = useMounted()

  useEffect(() => {
    if (resolvedOption) setSelected(resolvedOption)
  }, [resolvedOption])

  useEffect(() => {
    if (!open) return undefined
    const onClickAway = (e) => {
      if (triggerRef.current?.contains(e.target)) return
      if (dropdownRef.current?.contains(e.target)) return
      setOpen(false)
    }
    document.addEventListener('mousedown', onClickAway)
    return () => document.removeEventListener('mousedown', onClickAway)
  }, [open])

  useEffect(() => {
    if (!open) return undefined

    const DROPDOWN_MAX_HEIGHT = 280 // search input row + max-h-56 results list

    const reposition = () => {
      const rect = triggerRef.current?.getBoundingClientRect()
      if (!rect) return
      const roomBelow = window.innerHeight - rect.bottom
      const openUpward = roomBelow < DROPDOWN_MAX_HEIGHT && rect.top > roomBelow
      setCoords({
        left: rect.left,
        width: rect.width,
        ...(openUpward ? { bottom: window.innerHeight - rect.top + 4 } : { top: rect.bottom + 4 }),
      })
    }
    reposition()

    window.addEventListener('scroll', reposition, true)
    window.addEventListener('resize', reposition)
    return () => {
      window.removeEventListener('scroll', reposition, true)
      window.removeEventListener('resize', reposition)
    }
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
    <div className="relative">
      <button
        ref={triggerRef}
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

      {open && mounted && coords && createPortal(
        <div
          ref={dropdownRef}
          className="fixed z-50 rounded border border-line bg-surface-sheet shadow-pop"
          style={{ left: coords.left, width: coords.width, top: coords.top, bottom: coords.bottom }}
        >
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
        </div>,
        document.body,
      )}
    </div>
  )
}
