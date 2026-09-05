'use client'

import { Suspense, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { AlertTriangle } from 'lucide-react'
import { ReportShell, ReportFilterField, ReportTable } from '@/components/reports/ReportShell'
import { useApiGet } from '@/lib/useApi'
import { formatMoney, formatPercent, toDateInput } from '@/lib/format'
import { downloadCsv } from '@/lib/downloadCsv'

/**
 * useSearchParams() needs a Suspense boundary in the App Router — the voice
 * assistant navigates here with ?from=&to=, so the range must come from the URL.
 */
export default function BudgetReportPage() {
  return (
    <Suspense fallback={<ReportShell title="Budget Report" loading />}>
      <BudgetReportPageContent />
    </Suspense>
  )
}

function BudgetReportPageContent() {
  const params = useSearchParams()
  const [range, setRange] = useState(() => ({ from: params.get('from') || '', to: params.get('to') || '' }))
  const { data, loading } = useApiGet('/reports/budget', { from: range.from || undefined, to: range.to || undefined })

  const cols = [
    { key: 'name', header: 'Budget' },
    { key: 'analyticAccount', header: 'Analytic Account' },
    { key: 'planned', header: 'Planned', align: 'right', render: (r) => formatMoney(r.planned) },
    { key: 'actual', header: 'Actual', align: 'right', render: (r) => formatMoney(r.actual) },
    { key: 'variance', header: 'Variance', align: 'right', render: (r) => (
      <span className={Number(r.variance) < 0 ? 'text-state-overdue' : 'text-state-paid'}>{formatMoney(r.variance)}</span>
    ) },
    {
      key: 'achievementPct', header: 'Achievement', align: 'right',
      render: (r) => (
        <span className={'inline-flex items-center gap-1 ' + (r.overBudget ? 'text-state-overdue font-medium' : 'text-ink')}>
          {r.overBudget && <AlertTriangle size={12} />}
          {formatPercent(r.achievementPct)}
        </span>
      ),
    },
  ]

  return (
    <ReportShell
      title="Budget Report"
      loading={loading}
      onExportCsv={() => downloadCsv('/reports/budget', range, 'budget-report.csv')}
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
        <ReportTable
          columns={cols}
          rows={data.rows}
          emptyText="No active budgets."
          footer={
            <>
              <td className="px-3 py-2" colSpan={2}>Total</td>
              <td className="px-3 py-2 text-right tabular">{formatMoney(data.totals.planned)}</td>
              <td className="px-3 py-2 text-right tabular">{formatMoney(data.totals.actual)}</td>
              <td className="px-3 py-2 text-right tabular">{formatMoney(data.totals.variance)}</td>
              <td />
            </>
          }
        />
      )}
    </ReportShell>
  )
}
