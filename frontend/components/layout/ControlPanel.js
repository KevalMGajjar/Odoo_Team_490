'use client'

import { ChevronLeft, ChevronRight } from 'lucide-react'
import clsx from 'clsx'
import { useRegisterPage } from '@/lib/navHistory'

/**
 * The most Odoo thing you can build (UI.md §3): breadcrumb + record pager on
 * the left, actions beside it, search/view-switcher on the right. Appears on
 * every screen — that repetition is what makes the app feel like one system.
 */
export function ControlPanel({ breadcrumb, title, pager, actions, search, viewSwitcher, children }) {
  // Each page contributes its own real title to the visited-page trail — the
  // URL alone can't tell you a record is "BILL/2026/0013".
  useRegisterPage(typeof title === 'string' ? title : null)

  return (
    <div className="sticky top-0 z-10 flex min-h-panel flex-wrap items-center gap-2 border-b border-line bg-surface-header px-4 py-2 print:hidden">
      <div className="flex min-w-0 items-center gap-1.5">
        {breadcrumb && <span className="truncate text-xs text-ink-faint">{breadcrumb}</span>}
        {breadcrumb && title && <span className="text-ink-faint">/</span>}
        {title && <h1 className="truncate text-md font-semibold text-ink">{title}</h1>}
      </div>

      {pager && (
        <div className="flex items-center gap-1 text-xs text-ink-muted">
          <button
            onClick={pager.onPrev}
            disabled={!pager.hasPrev}
            className="rounded p-1 hover:bg-surface-hover disabled:opacity-30"
          >
            <ChevronLeft size={14} />
          </button>
          <span className="tabular">{pager.current} / {pager.total}</span>
          <button
            onClick={pager.onNext}
            disabled={!pager.hasNext}
            className="rounded p-1 hover:bg-surface-hover disabled:opacity-30"
          >
            <ChevronRight size={14} />
          </button>
        </div>
      )}

      {actions && <div className="flex items-center gap-2">{actions}</div>}

      <div className="ml-auto flex items-center gap-2">
        {search}
        {viewSwitcher}
      </div>

      {children}
    </div>
  )
}

export function ViewSwitcher({ value, onChange, options }) {
  return (
    <div className="flex rounded-sm border border-line overflow-hidden">
      {options.map((opt) => (
        <button
          key={opt.value}
          onClick={() => onChange(opt.value)}
          className={clsx(
            'flex h-7 w-7 items-center justify-center border-r border-line last:border-r-0 transition-colors duration-150',
            value === opt.value ? 'bg-brand-light text-brand' : 'bg-surface-sheet text-ink-faint hover:bg-surface-hover',
          )}
          title={opt.label}
        >
          <opt.icon size={14} />
        </button>
      ))}
    </div>
  )
}
