'use client'

import { useParams } from 'next/navigation'
import { ControlPanel } from '@/components/layout/ControlPanel'
import { FormSheet, FormGrid, FormSection } from '@/components/layout/FormSheet'
import { FormField, TextInput } from '@/components/ui/FormField'
import { DebitCreditGrid } from '@/components/documents/DebitCreditGrid'
import { StatusBadge } from '@/components/ui/StatusBadge'
import { Skeleton } from '@/components/ui/Skeleton'
import { useApiGet } from '@/lib/useApi'
import { formatDate, formatNumber, formatMoney } from '@/lib/format'

export default function StockAdjustmentDetailPage() {
  const { id } = useParams()
  const { data: adj, loading, error } = useApiGet(`/stock-adjustments/${id}`)

  if (loading) {
    return (
      <div className="flex h-full flex-col">
        <ControlPanel breadcrumb="Account" title="Loading…" />
        <div className="p-6"><div className="form-sheet"><Skeleton className="h-56" /></div></div>
      </div>
    )
  }
  if (error || !adj) {
    return (
      <div className="flex h-full flex-col">
        <ControlPanel breadcrumb="Account" title="Not found" />
        <div className="p-6"><p className="text-sm text-state-overdue">Stock adjustment not found.</p></div>
      </div>
    )
  }

  return (
    <div className="flex h-full flex-col">
      <ControlPanel breadcrumb="Account" title={adj.number} />
      <div className="flex-1 overflow-y-auto p-4 sm:p-6">
        <FormSheet className="max-w-[900px]">
          <div className="mb-4 flex items-center justify-between">
            <p className="text-xl font-semibold text-ink">{adj.number}</p>
            <StatusBadge status={adj.state} />
          </div>

          <FormSection>
            <FormGrid>
              <FormField label="Date"><TextInput value={formatDate(adj.date)} disabled /></FormField>
              <FormField label="Reason"><TextInput value={adj.reason || '—'} disabled /></FormField>
            </FormGrid>
          </FormSection>

          <FormSection title="Count">
            <div className="overflow-x-auto rounded border border-line">
              <table className="w-full border-collapse text-sm">
                <thead className="bg-surface-subtle">
                  <tr>
                    <th className="px-3 py-2 text-left text-xs font-semibold uppercase text-ink-muted">Product</th>
                    <th className="px-3 py-2 text-right text-xs font-semibold uppercase text-ink-muted">System</th>
                    <th className="px-3 py-2 text-right text-xs font-semibold uppercase text-ink-muted">Counted</th>
                    <th className="px-3 py-2 text-right text-xs font-semibold uppercase text-ink-muted">Delta</th>
                    <th className="px-3 py-2 text-right text-xs font-semibold uppercase text-ink-muted">Unit Cost</th>
                  </tr>
                </thead>
                <tbody>
                  {adj.lines.map((l) => (
                    <tr key={l.id} className="border-b border-line last:border-b-0">
                      <td className="px-3 py-1.5">{l.product?.name}</td>
                      <td className="px-3 py-1.5 text-right tabular">{formatNumber(l.systemQty, 3)}</td>
                      <td className="px-3 py-1.5 text-right tabular">{formatNumber(l.countedQty, 3)}</td>
                      <td className={'px-3 py-1.5 text-right tabular font-medium ' + (Number(l.delta) > 0 ? 'text-state-paid' : Number(l.delta) < 0 ? 'text-state-overdue' : '')}>
                        {Number(l.delta) > 0 ? '+' : ''}{formatNumber(l.delta, 3)}
                      </td>
                      <td className="px-3 py-1.5 text-right tabular">{formatMoney(l.unitCost)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </FormSection>

          {adj.journalEntry && (
            <FormSection title="Journal Entry">
              <DebitCreditGrid items={adj.journalEntry.items.map((i) => ({ ...i, account: i.account }))} onChange={() => {}} disabled />
            </FormSection>
          )}
        </FormSheet>
      </div>
    </div>
  )
}
