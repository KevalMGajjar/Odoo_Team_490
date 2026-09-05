'use client'

import { Plus, Trash2 } from 'lucide-react'
import { SearchSelect } from '@/components/ui/SearchSelect'
import { formatMoney } from '@/lib/format'

/**
 * The "party side" of a receipt/payment voucher — one or more account lines
 * with an amount and an optional partner tag. The bank/cash counter-line is
 * derived server-side from the sum of these, exactly per spec: "always
 * credit [or debit], debit should match" — by construction, not by typing
 * a second amount that could drift.
 */
export function VoucherLines({ lines, onChange }) {
  const total = lines.reduce((s, l) => s + (Number(l.amount) || 0), 0)

  const update = (idx, patch) => onChange(lines.map((l, i) => (i === idx ? { ...l, ...patch } : l)))
  const addLine = () => onChange([...lines, blankLine()])
  const removeLine = (idx) => onChange(lines.length > 1 ? lines.filter((_, i) => i !== idx) : lines)

  return (
    <div className="rounded border border-line">
      <table className="w-full border-collapse text-sm">
        <thead className="bg-surface-subtle">
          <tr>
            <th className="px-2 py-2 text-left text-xs font-semibold uppercase text-ink-muted">Account</th>
            <th className="px-2 py-2 text-left text-xs font-semibold uppercase text-ink-muted">Partner</th>
            <th className="px-2 py-2 text-right text-xs font-semibold uppercase text-ink-muted">Amount</th>
            <th className="w-8" />
          </tr>
        </thead>
        <tbody>
          {lines.map((line, idx) => (
            <tr key={line._key} className="border-b border-line last:border-b-0">
              <td className="px-2 py-1.5">
                <SearchSelect
                  path="/accounts"
                  resolvedOption={line.account}
                  onChange={(opt) => update(idx, { accountId: opt?.id ?? '', account: opt })}
                  getLabel={(o) => `${o.code} ${o.name}`}
                  placeholder="Select account"
                />
              </td>
              <td className="px-2 py-1.5">
                <SearchSelect
                  path="/contacts"
                  resolvedOption={line.partner}
                  onChange={(opt) => update(idx, { partnerId: opt?.id ?? '', partner: opt })}
                  placeholder="Optional"
                />
              </td>
              <td className="px-2 py-1.5">
                <input
                  type="number"
                  step="0.01"
                  className="field-input text-right tabular"
                  value={line.amount}
                  onChange={(e) => update(idx, { amount: e.target.value })}
                  placeholder="0.00"
                />
              </td>
              <td className="px-2 py-1.5">
                <button type="button" onClick={() => removeLine(idx)} className="p-1 text-ink-faint hover:text-state-overdue">
                  <Trash2 size={13} />
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <button
        type="button"
        onClick={addLine}
        className="flex w-full items-center gap-1.5 border-t border-dashed border-line px-3 py-2 text-xs text-ink-faint hover:bg-surface-hover hover:text-secondary"
      >
        <Plus size={12} /> Add a line
      </button>
      <div className="flex justify-end border-t border-line bg-surface-subtle px-4 py-2 text-sm">
        <span className="text-ink-muted">Total <span className="tabular font-semibold text-ink">{formatMoney(total)}</span></span>
      </div>
    </div>
  )
}

export function blankLine() {
  return { _key: Math.random().toString(36).slice(2), accountId: '', partnerId: '', amount: '' }
}
