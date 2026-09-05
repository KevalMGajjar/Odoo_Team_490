'use client'

import { Plus, Trash2 } from 'lucide-react'
import { SearchSelect } from '@/components/ui/SearchSelect'
import { formatMoney } from '@/lib/format'

const TYPE_LABEL = { income: 'Income', expense: 'Expense' }

/**
 * Editable Budget line table — an Analytic Account (m2o) + its Committed
 * Amount per row. Type is never entered directly: it's always read off the
 * chosen Analytic Account, shown here read-only.
 */
export function BudgetLineEditor({ lines, onChange, disabled }) {
  const update = (idx, patch) => onChange(lines.map((l, i) => (i === idx ? { ...l, ...patch } : l)))
  const addLine = () => onChange([...lines, blankBudgetLine()])
  const removeLine = (idx) => onChange(lines.filter((_, i) => i !== idx))

  const total = lines.reduce((s, l) => s + (Number(l.committedAmount) || 0), 0)

  return (
    <div className="rounded border border-line">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[560px] border-collapse text-sm">
          <thead className="bg-surface-subtle">
            <tr>
              <th className="w-10 px-2 py-2 text-left text-xs font-semibold uppercase text-ink-muted">Sr</th>
              <th className="px-2 py-2 text-left text-xs font-semibold uppercase text-ink-muted">Analytic Account</th>
              <th className="w-24 px-2 py-2 text-left text-xs font-semibold uppercase text-ink-muted">Type</th>
              <th className="w-40 px-2 py-2 text-right text-xs font-semibold uppercase text-ink-muted">Committed Amount</th>
              {!disabled && <th className="w-8" />}
            </tr>
          </thead>
          <tbody>
            {lines.map((line, idx) => (
              <tr key={line._key ?? line.id ?? idx} className="border-b border-line last:border-b-0">
                <td className="px-2 py-1.5 text-ink-faint tabular">{idx + 1}</td>
                <td className="px-2 py-1.5">
                  <SearchSelect
                    path="/analytic-accounts"
                    value={line.analyticAccountId}
                    resolvedOption={line.analyticAccount}
                    onChange={(opt) => update(idx, { analyticAccountId: opt?.id ?? '', analyticAccount: opt })}
                    placeholder="Select analytic account"
                    disabled={disabled}
                  />
                </td>
                <td className="px-2 py-1.5 text-ink-muted">
                  {line.analyticAccount ? TYPE_LABEL[line.analyticAccount.type] ?? line.analyticAccount.type : '—'}
                </td>
                <td className="px-2 py-1.5">
                  <input
                    type="number" step="1" min="0"
                    className="field-input text-right tabular"
                    value={line.committedAmount}
                    onChange={(e) => update(idx, { committedAmount: e.target.value })}
                    disabled={disabled}
                  />
                </td>
                {!disabled && (
                  <td className="px-2 py-1.5">
                    <button type="button" onClick={() => removeLine(idx)} className="p-1 text-ink-faint hover:text-state-overdue">
                      <Trash2 size={13} />
                    </button>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {!disabled && (
        <button
          type="button"
          onClick={addLine}
          className="flex w-full items-center gap-1.5 border-t border-dashed border-line px-3 py-2 text-xs text-ink-faint hover:bg-surface-hover hover:text-secondary"
        >
          <Plus size={12} /> Add a line
        </button>
      )}

      <div className="flex justify-end border-t border-line px-4 py-3">
        <div className="flex w-56 justify-between text-md font-semibold text-ink">
          <span>Total Committed</span><span className="tabular">{formatMoney(total)}</span>
        </div>
      </div>
    </div>
  )
}

export function blankBudgetLine() {
  return { _key: Math.random().toString(36).slice(2), analyticAccountId: '', analyticAccount: null, committedAmount: '0' }
}
