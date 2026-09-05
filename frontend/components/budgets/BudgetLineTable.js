'use client'

import { useState } from 'react'
import { HelpCircle } from 'lucide-react'
import { formatMoney, formatPercent } from '@/lib/format'
import { AmountToAchieveHelpModal } from './AmountToAchieveHelpModal'

const TYPE_LABEL = { income: 'Income', expense: 'Expense' }

/** Read-only Budget line table for the detail view — Committed plus the
 * computed Achieved/Achieved%/Amount-to-Achieve columns. */
export function BudgetLineTable({ lines, committedTotal, achievedTotal }) {
  const [helpOpen, setHelpOpen] = useState(false)

  return (
    <div className="rounded border border-line">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[760px] border-collapse text-sm">
          <thead className="bg-surface-subtle">
            <tr>
              <th className="w-10 px-2 py-2 text-left text-xs font-semibold uppercase text-ink-muted">Sr</th>
              <th className="px-2 py-2 text-left text-xs font-semibold uppercase text-ink-muted">Analytic Account</th>
              <th className="w-24 px-2 py-2 text-left text-xs font-semibold uppercase text-ink-muted">Type</th>
              <th className="w-32 px-2 py-2 text-right text-xs font-semibold uppercase text-ink-muted">Committed</th>
              <th className="w-32 px-2 py-2 text-right text-xs font-semibold uppercase text-ink-muted">Achieved</th>
              <th className="w-24 px-2 py-2 text-right text-xs font-semibold uppercase text-ink-muted">Achieved %</th>
              <th className="w-36 px-2 py-2 text-right text-xs font-semibold uppercase text-ink-muted">
                <button
                  type="button"
                  onClick={() => setHelpOpen(true)}
                  className="inline-flex items-center gap-1 hover:text-secondary"
                  title="What is Amount to Achieve?"
                >
                  Amt. to Achieve <HelpCircle size={11} />
                </button>
              </th>
            </tr>
          </thead>
          <tbody>
            {lines.map((line, idx) => (
              <tr key={line.id} className="border-b border-line last:border-b-0">
                <td className="px-2 py-1.5 text-ink-faint tabular">{idx + 1}</td>
                <td className="px-2 py-1.5 text-ink">{line.analyticAccount?.name}</td>
                <td className="px-2 py-1.5 text-ink-muted">{TYPE_LABEL[line.analyticAccount?.type] ?? line.analyticAccount?.type}</td>
                <td className="px-3 py-1.5 text-right tabular text-ink">{formatMoney(line.committedAmount)}</td>
                <td className="px-3 py-1.5 text-right tabular text-ink">{formatMoney(line.achieved)}</td>
                <td className="px-3 py-1.5 text-right tabular text-ink">{formatPercent(line.achievedPct)}</td>
                <td
                  className={
                    'px-3 py-1.5 text-right tabular font-medium ' +
                    (Number(line.toAchieve) < 0 ? 'text-state-overdue' : 'text-ink')
                  }
                >
                  {formatMoney(line.toAchieve)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="flex justify-end border-t border-line px-4 py-3">
        <div className="w-64 space-y-1 text-sm">
          <div className="flex justify-between text-ink-muted">
            <span>Total Committed</span><span className="tabular">{formatMoney(committedTotal)}</span>
          </div>
          <div className="flex justify-between border-t border-line pt-1 text-md font-semibold text-ink">
            <span>Total Achieved</span><span className="tabular">{formatMoney(achievedTotal)}</span>
          </div>
        </div>
      </div>

      <AmountToAchieveHelpModal open={helpOpen} onClose={() => setHelpOpen(false)} />
    </div>
  )
}
