'use client'

import { useMemo, useState } from 'react'
import { ChevronUp, ChevronDown, Download, Search as SearchIcon } from 'lucide-react'
import clsx from 'clsx'
import { TableSkeleton } from './Skeleton'
import { EmptyState } from './EmptyState'

/**
 * Dense, sortable, paginated list view (UI.md §5.6): 32px rows, muted
 * uppercase header, right-aligned tabular money columns, hover highlight.
 *
 * Under 768px this becomes stacked cards (label:value rows) rather than a
 * horizontally-scrolling table — UI.md §7's responsive requirement.
 */
export function DataTable({
  columns,
  rows,
  loading,
  emptyTitle = 'Nothing here yet',
  emptyAction,
  onEmptyAction,
  onRowClick,
  getRowKey = (row) => row.id,
  search,
  onSearchChange,
  toolbar,
  page,
  pageSize,
  total,
  onPageChange,
  exportCsv,
  view = 'list',
  renderCard,
}) {
  const [sort, setSort] = useState(null) // { key, dir }

  const sortedRows = useMemo(() => {
    if (!sort) return rows
    const col = columns.find((c) => c.key === sort.key)
    const accessor = col?.sortValue ?? col?.value ?? ((r) => r[sort.key])
    return [...rows].sort((a, b) => {
      const av = accessor(a), bv = accessor(b)
      if (av === bv) return 0
      const cmp = av > bv ? 1 : -1
      return sort.dir === 'asc' ? cmp : -cmp
    })
  }, [rows, sort, columns])

  const toggleSort = (key) => {
    setSort((prev) => {
      if (prev?.key !== key) return { key, dir: 'asc' }
      if (prev.dir === 'asc') return { key, dir: 'desc' }
      return null
    })
  }

  const totalPages = total && pageSize ? Math.max(1, Math.ceil(total / pageSize)) : 1

  return (
    <div className="flex h-full flex-col">
      {(onSearchChange || toolbar || exportCsv) && (
        <div className="flex flex-wrap items-center gap-2 border-b border-line px-4 py-2">
          {onSearchChange && (
            <div className="relative w-full max-w-xs">
              <SearchIcon size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-ink-faint" />
              <input
                value={search}
                onChange={(e) => onSearchChange(e.target.value)}
                placeholder="Search…"
                className="field-input pl-7"
              />
            </div>
          )}
          {toolbar}
          {exportCsv && (
            <button onClick={exportCsv} className="btn-secondary btn-sm ml-auto">
              <Download size={13} /> Export CSV
            </button>
          )}
        </div>
      )}

      {loading ? (
        <TableSkeleton rows={8} cols={columns.length} />
      ) : sortedRows.length === 0 ? (
        <div className="p-4">
          <EmptyState title={emptyTitle} action={emptyAction} onAction={onEmptyAction} />
        </div>
      ) : view === 'kanban' && renderCard ? (
        <div className="flex-1 overflow-auto p-4">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {sortedRows.map((row) => (
              <div
                key={getRowKey(row)}
                onClick={() => onRowClick?.(row)}
                role={onRowClick ? 'button' : undefined}
                tabIndex={onRowClick ? 0 : undefined}
                onKeyDown={onRowClick ? (e) => (e.key === 'Enter' || e.key === ' ') && onRowClick(row) : undefined}
                className={clsx(
                  'rounded border border-line bg-surface-sheet p-3 transition-colors duration-150',
                  onRowClick && 'cursor-pointer hover:border-secondary hover:bg-surface-hover',
                )}
              >
                {renderCard(row)}
              </div>
            ))}
          </div>
        </div>
      ) : (
        <>
          {/* ≥768px: real table */}
          <div className="hidden flex-1 overflow-auto sm:block">
            <table className="w-full border-collapse text-sm">
              <thead className="sticky top-0 z-[1] bg-surface-subtle">
                <tr>
                  {columns.map((col) => (
                    <th
                      key={col.key}
                      onClick={() => col.sortable !== false && toggleSort(col.key)}
                      className={clsx(
                        'select-none whitespace-nowrap px-3 py-2 text-left text-xs font-semibold uppercase text-ink-muted',
                        col.align === 'right' && 'text-right',
                        col.sortable !== false && 'cursor-pointer hover:text-ink',
                      )}
                      style={{ letterSpacing: '0.03em', width: col.width }}
                    >
                      <span className="inline-flex items-center gap-1">
                        {col.header}
                        {sort?.key === col.key && (sort.dir === 'asc' ? <ChevronUp size={11} /> : <ChevronDown size={11} />)}
                      </span>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {sortedRows.map((row) => (
                  <tr
                    key={getRowKey(row)}
                    onClick={() => onRowClick?.(row)}
                    className={clsx(
                      'border-b border-line transition-colors duration-150',
                      onRowClick && 'cursor-pointer hover:bg-surface-hover',
                    )}
                    style={{ height: 32 }}
                  >
                    {columns.map((col) => (
                      <td
                        key={col.key}
                        className={clsx(
                          'whitespace-nowrap px-3 py-1.5 text-ink',
                          col.align === 'right' && 'text-right tabular',
                          col.mono && 'tabular',
                        )}
                      >
                        {col.render ? col.render(row) : row[col.key]}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* <768px: stacked cards, per UI.md §7.
              A <div> here, not a <button> — a cell can render its own real
              button or link (e.g. "View diff"), and <button> cannot contain
              another <button> without breaking HTML nesting rules and
              causing a hydration mismatch. role="button" + tabIndex keeps it
              keyboard-reachable when onRowClick is actually provided. */}
          <div className="flex-1 overflow-auto sm:hidden">
            {sortedRows.map((row) => (
              <div
                key={getRowKey(row)}
                onClick={() => onRowClick?.(row)}
                role={onRowClick ? 'button' : undefined}
                tabIndex={onRowClick ? 0 : undefined}
                onKeyDown={onRowClick ? (e) => (e.key === 'Enter' || e.key === ' ') && onRowClick(row) : undefined}
                className={clsx(
                  'block w-full border-b border-line px-4 py-3 text-left',
                  onRowClick && 'cursor-pointer hover:bg-surface-hover',
                )}
              >
                {columns.filter((c) => !c.hideOnMobile).map((col) => (
                  <div key={col.key} className="flex items-center justify-between gap-2 py-0.5">
                    <span className="text-xs text-ink-faint">{col.header}</span>
                    <span className={clsx('text-sm text-ink', col.align === 'right' && 'tabular')}>
                      {col.render ? col.render(row) : row[col.key]}
                    </span>
                  </div>
                ))}
              </div>
            ))}
          </div>
        </>
      )}

      {onPageChange && total > pageSize && (
        <div className="flex items-center justify-between border-t border-line px-4 py-2 text-xs text-ink-muted">
          <span>{total} total</span>
          <div className="flex items-center gap-2">
            <button
              className="btn-ghost btn-sm"
              disabled={page <= 1}
              onClick={() => onPageChange(page - 1)}
            >
              Prev
            </button>
            <span className="tabular">{page} / {totalPages}</span>
            <button
              className="btn-ghost btn-sm"
              disabled={page >= totalPages}
              onClick={() => onPageChange(page + 1)}
            >
              Next
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
