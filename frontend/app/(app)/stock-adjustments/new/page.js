'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Plus, Trash2 } from 'lucide-react'
import { ControlPanel } from '@/components/layout/ControlPanel'
import { FormSheet, FormGrid, FormSection } from '@/components/layout/FormSheet'
import { FormField, TextInput } from '@/components/ui/FormField'
import { SearchSelect } from '@/components/ui/SearchSelect'
import { Button } from '@/components/ui/Button'
import { api, ApiError } from '@/lib/api'
import { useToast } from '@/components/ui/Toast'
import { toDateInput, formatNumber } from '@/lib/format'
import { useGuardedAction } from '@/lib/useGuardedAction'

const blankLine = () => ({ _key: Math.random().toString(36).slice(2), productId: '', product: null, countedQty: '' })

export default function NewStockAdjustmentPage() {
  const router = useRouter()
  const { push } = useToast()

  const [date, setDate] = useState(toDateInput(new Date()))
  const [reason, setReason] = useState('')
  const [lines, setLines] = useState([blankLine()])
  const [error, setError] = useState('')

  const update = (idx, patch) => setLines((ls) => ls.map((l, i) => (i === idx ? { ...l, ...patch } : l)))
  const addLine = () => setLines((ls) => [...ls, blankLine()])
  const removeLine = (idx) => setLines((ls) => (ls.length > 1 ? ls.filter((_, i) => i !== idx) : ls))

  const canSubmit = lines.every((l) => l.productId && l.countedQty !== '') && lines.length > 0

  const [submit, saving] = useGuardedAction(async (e) => {
    e.preventDefault()
    setError('')
    if (!canSubmit) return
    try {
      const adj = await api.post('/stock-adjustments', {
        date, reason: reason || undefined,
        lines: lines.map((l) => ({ productId: l.productId, countedQty: Number(l.countedQty) })),
      })
      push(`${adj.number} posted`, { type: 'success' })
      router.replace(`/stock-adjustments/${adj.id}`)
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not post stock adjustment')
    }
  })

  return (
    <div className="flex h-full flex-col">
      <ControlPanel breadcrumb="Accounting" title="New Stock Count" />
      <form onSubmit={submit} className="flex-1 overflow-y-auto p-4 sm:p-6">
        <FormSheet className="max-w-[900px]">
          <FormSection>
            <FormGrid>
              <FormField label="Date" required>
                <TextInput type="date" value={date} onChange={(e) => setDate(e.target.value)} required />
              </FormField>
              <FormField label="Reason">
                <TextInput value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Monthly cycle count" />
              </FormField>
            </FormGrid>
          </FormSection>

          <FormSection title="Count">
            <div className="rounded border border-line">
              <table className="w-full border-collapse text-sm">
                <thead className="bg-surface-subtle">
                  <tr>
                    <th className="px-2 py-2 text-left text-xs font-semibold uppercase text-ink-muted">Product</th>
                    <th className="w-28 px-2 py-2 text-right text-xs font-semibold uppercase text-ink-muted">System Qty</th>
                    <th className="w-28 px-2 py-2 text-right text-xs font-semibold uppercase text-ink-muted">Counted Qty</th>
                    <th className="w-24 px-2 py-2 text-right text-xs font-semibold uppercase text-ink-muted">Delta</th>
                    <th className="w-8" />
                  </tr>
                </thead>
                <tbody>
                  {lines.map((line, idx) => {
                    const system = Number(line.product?.onHandQty ?? 0)
                    const counted = Number(line.countedQty)
                    const delta = line.countedQty !== '' ? counted - system : null
                    return (
                      <tr key={line._key} className="border-b border-line last:border-b-0">
                        <td className="px-2 py-1.5">
                          <SearchSelect
                            path="/products"
                            resolvedOption={line.product}
                            onChange={(p) => update(idx, { productId: p?.id ?? '', product: p })}
                            placeholder="Select product"
                            extraParams={{}}
                          />
                        </td>
                        <td className="px-3 py-1.5 text-right tabular text-ink-muted">
                          {line.product ? formatNumber(line.product.onHandQty, 3) : '—'}
                        </td>
                        <td className="px-2 py-1.5">
                          <input
                            type="number" step="0.001" min="0"
                            className="field-input text-right tabular"
                            value={line.countedQty}
                            onChange={(e) => update(idx, { countedQty: e.target.value })}
                          />
                        </td>
                        <td className={'px-3 py-1.5 text-right tabular font-medium ' + (delta > 0 ? 'text-state-paid' : delta < 0 ? 'text-state-overdue' : 'text-ink-faint')}>
                          {delta === null ? '—' : (delta > 0 ? '+' : '') + delta.toFixed(3)}
                        </td>
                        <td className="px-2 py-1.5">
                          <button type="button" onClick={() => removeLine(idx)} className="p-1 text-ink-faint hover:text-state-overdue">
                            <Trash2 size={13} />
                          </button>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
              <button
                type="button"
                onClick={addLine}
                className="flex w-full items-center gap-1.5 border-t border-dashed border-line px-3 py-2 text-xs text-ink-faint hover:bg-surface-hover hover:text-secondary"
              >
                <Plus size={12} /> Add a product
              </button>
            </div>
          </FormSection>

          {error && <p className="mt-3 rounded-sm bg-state-overdue/10 px-2 py-1.5 text-xs text-state-overdue">{error}</p>}

          <div className="mt-5 flex items-center justify-end gap-2 border-t border-line pt-4">
            <Button type="button" variant="ghost" onClick={() => router.back()}>Cancel</Button>
            <Button type="submit" variant="primary" loading={saving} disabled={!canSubmit}>Post Adjustment</Button>
          </div>
        </FormSheet>
      </form>
    </div>
  )
}
