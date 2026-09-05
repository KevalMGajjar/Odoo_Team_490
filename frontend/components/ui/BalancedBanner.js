import { CheckCircle2, AlertTriangle } from 'lucide-react'
import { formatMoney } from '@/lib/format'

/**
 * The self-verifying proof banner (UI.md §5.8): Assets = Liabilities +
 * Capital + Earnings, or the inventory valuation ties to the control
 * account. This is the single most important visual moment in the app.
 */
export function BalancedBanner({ balanced, parts }) {
  return (
    <div
      className={
        'flex flex-wrap items-center gap-x-2 gap-y-1 rounded border px-4 py-3 text-sm ' +
        (balanced
          ? 'border-state-paid/30 bg-state-paid/5 text-state-paid'
          : 'border-state-overdue/30 bg-state-overdue/5 text-state-overdue')
      }
    >
      {balanced ? <CheckCircle2 size={16} className="shrink-0" /> : <AlertTriangle size={16} className="shrink-0" />}
      <span className="font-semibold">{balanced ? 'Balanced' : 'Out of balance'}</span>
      <span className="text-ink">
        {parts.map((p, i) => (
          <span key={p.label}>
            {i > 0 && <span className="mx-1.5 text-ink-faint">{p.op ?? '+'}</span>}
            {p.label} <span className="tabular font-medium">{formatMoney(p.value)}</span>
          </span>
        ))}
      </span>
    </div>
  )
}
