'use client'

import { useState } from 'react'
import { TrendingUp, TrendingDown } from 'lucide-react'
import { ReportShell, ReportFilterField, ReportTable } from '@/components/reports/ReportShell'
import { DrillDownLink } from '@/components/ui/DrillDownLink'
import { useApiGet } from '@/lib/useApi'
import { formatMoney, formatPercent, toDateInput } from '@/lib/format'
import { downloadCsv } from '@/lib/downloadCsv'

function defaultRange() {
  const now = new Date()
  const fyStart = now.getUTCMonth() >= 3 ? now.getUTCFullYear() : now.getUTCFullYear() - 1
  return { from: toDateInput(new Date(Date.UTC(fyStart, 3, 1))), to: toDateInput(now) }
}

const cols = [
  { key: 'name', header: 'Account', render: (r) => <DrillDownLink href={`/reports/general-ledger?accountId=${r.accountId}`}>{r.name}</DrillDownLink> },
  { key: 'balance', header: 'Amount', align: 'right', render: (r) => formatMoney(r.balance) },
]

export default function ProfitLossPage() {
  const [range, setRange] = useState(defaultRange)
  const { data, loading } = useApiGet('/reports/profit-loss', range)

  return (
    <ReportShell
      title="Profit & Loss"
      loading={loading}
      onExportCsv={() => downloadCsv('/reports/profit-loss', range, `profit-loss-${range.from}_${range.to}.csv`)}
      filters={
        <>
          <ReportFilterField label="From">
            <input type="date" className="field-input" value={range.from} onChange={(e) => setRange((r) => ({ ...r, from: e.target.value }))} />
          </ReportFilterField>
          <ReportFilterField label="To">
            <input type="date" className="field-input" value={range.to} onChange={(e) => setRange((r) => ({ ...r, to: e.target.value }))} />
          </ReportFilterField>
        </>
      }
    >
      {data && (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <SummaryTile label="Revenue" value={data.totals.income} />
            <SummaryTile label="Cost of Sales" value={data.totals.cogs} />
            <SummaryTile label="Gross Profit" value={data.totals.grossProfit} sub={formatPercent(data.totals.grossMarginPct)} tone="text-state-paid" />
            <SummaryTile
              label="Net Profit"
              value={data.totals.netProfit}
              tone={Number(data.totals.netProfit) >= 0 ? 'text-state-paid' : 'text-state-overdue'}
              icon={Number(data.totals.netProfit) >= 0 ? TrendingUp : TrendingDown}
            />
          </div>

          <div>
            <p className="text-md font-semibold text-ink mb-2">Income</p>
            <ReportTable
              columns={cols} rows={data.income} emptyText="No income posted for this period."
              footer={<><td className="px-3 py-2">Total Income</td><td className="px-3 py-2 text-right tabular">{formatMoney(data.totals.income)}</td></>}
            />
          </div>
          <div>
            <p className="text-md font-semibold text-ink mb-2">Expense</p>
            <ReportTable
              columns={cols} rows={data.expense} emptyText="No expense posted for this period."
              footer={<><td className="px-3 py-2">Total Expense</td><td className="px-3 py-2 text-right tabular">{formatMoney(data.totals.expense)}</td></>}
            />
          </div>
        </div>
      )}
    </ReportShell>
  )
}

function SummaryTile({ label, value, sub, tone, icon: Icon }) {
  return (
    <div className="rounded border border-line bg-surface-sheet p-3">
      <p className="field-label mb-0">{label}</p>
      <p className={'mt-1 flex items-center gap-1 text-lg font-semibold tabular ' + (tone ?? 'text-ink')}>
        {Icon && <Icon size={14} />}
        {formatMoney(value)}
      </p>
      {sub && <p className="text-xs text-ink-faint">{sub} margin</p>}
    </div>
  )
}
