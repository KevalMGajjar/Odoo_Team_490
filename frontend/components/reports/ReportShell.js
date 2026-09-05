'use client'

import { Download, Printer } from 'lucide-react'
import { ControlPanel } from '@/components/layout/ControlPanel'
import { Button } from '@/components/ui/Button'
import { Skeleton } from '@/components/ui/Skeleton'

/**
 * Filter bar pinned at top, then the report table (UI.md §5.8). Every report
 * screen is this shell plus its own table — Print/CSV live in the control
 * panel, consistently, everywhere.
 */
export function ReportShell({ title, breadcrumb = 'Reports', filters, onExportCsv, loading, children }) {
  return (
    <div className="flex h-full flex-col">
      <ControlPanel
        breadcrumb={breadcrumb}
        title={title}
        actions={
          <>
            {onExportCsv && (
              <Button variant="secondary" size="sm" icon={Download} onClick={onExportCsv}>CSV</Button>
            )}
            <Button variant="secondary" size="sm" icon={Printer} onClick={() => window.print()}>Print</Button>
          </>
        }
      />
      {filters && <div className="flex flex-wrap items-end gap-3 border-b border-line bg-surface-sheet px-4 py-3">{filters}</div>}
      <div className="flex-1 overflow-y-auto p-4 sm:p-6">
        {loading ? <Skeleton className="h-96 w-full" /> : children}
      </div>
    </div>
  )
}

export function ReportFilterField({ label, children }) {
  return (
    <div>
      <label className="field-label">{label}</label>
      {children}
    </div>
  )
}

/** Simple report table — dense, right-aligned money, optional footer totals row. */
export function ReportTable({ columns, rows, footer, emptyText = 'No data for this period.' }) {
  if (rows.length === 0) return <p className="p-4 text-sm text-ink-muted">{emptyText}</p>
  return (
    <div className="overflow-x-auto rounded border border-line bg-surface-sheet">
      <table className="w-full min-w-[560px] border-collapse text-sm">
        <thead className="bg-surface-subtle">
          <tr>
            {columns.map((col) => (
              <th
                key={col.key}
                className={
                  'whitespace-nowrap px-3 py-2 text-left text-xs font-semibold uppercase text-ink-muted ' +
                  (col.align === 'right' ? 'text-right' : '')
                }
                style={{ letterSpacing: '0.03em' }}
              >
                {col.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={row.id ?? row.accountId ?? row.productId ?? row.budgetId ?? i} className="border-b border-line last:border-b-0 hover:bg-surface-hover">
              {columns.map((col) => (
                <td key={col.key} className={'px-3 py-1.5 text-ink ' + (col.align === 'right' ? 'text-right tabular' : '')}>
                  {col.render ? col.render(row) : row[col.key]}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
        {footer && (
          <tfoot className="border-t-2 border-line bg-surface-subtle font-semibold">
            <tr>{footer}</tr>
          </tfoot>
        )}
      </table>
    </div>
  )
}
