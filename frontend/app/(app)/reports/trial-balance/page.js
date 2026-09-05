'use client'

import { useState } from 'react'
import { ReportShell, ReportFilterField, ReportTable } from '@/components/reports/ReportShell'
import { BalancedBanner } from '@/components/ui/BalancedBanner'
import { DrillDownLink } from '@/components/ui/DrillDownLink'
import { useApiGet } from '@/lib/useApi'
import { formatMoney, toDateInput } from '@/lib/format'
import { downloadCsv } from '@/lib/downloadCsv'

const TYPE_LABEL = { asset: 'Asset', liability: 'Liability', income: 'Income', expense: 'Expense', capital: 'Capital' };

export default function TrialBalancePage() {
  const [asOf, setAsOf] = useState(toDateInput(new Date()))
  const { data, loading } = useApiGet('/reports/trial-balance', { asOf })

  const columns = [
    { key: 'code', header: 'Code', render: (r) => <span className="tabular font-medium">{r.code}</span> },
    { key: 'name', header: 'Account', render: (r) => <DrillDownLink href={`/reports/general-ledger?accountId=${r.accountId}`}>{r.name}</DrillDownLink> },
    { key: 'type', header: 'Type', render: (r) => TYPE_LABEL[r.type] },
    { key: 'debit', header: 'Debit', align: 'right', render: (r) => formatMoney(r.debit) },
    { key: 'credit', header: 'Credit', align: 'right', render: (r) => formatMoney(r.credit) },
  ]

  return (
    <ReportShell
      title="Trial Balance"
      loading={loading}
      onExportCsv={() => downloadCsv('/reports/trial-balance', { asOf }, `trial-balance-${asOf}.csv`)}
      filters={
        <ReportFilterField label="As of">
          <input type="date" className="field-input" value={asOf} onChange={(e) => setAsOf(e.target.value)} />
        </ReportFilterField>
      }
    >
      {data && (
        <>
          <ReportTable
            columns={columns}
            rows={data.rows}
            footer={
              <>
                <td className="px-3 py-2" colSpan={3}>Total</td>
                <td className="px-3 py-2 text-right tabular">{formatMoney(data.totals.debit)}</td>
                <td className="px-3 py-2 text-right tabular">{formatMoney(data.totals.credit)}</td>
              </>
            }
          />
          <div className="mt-4">
            <BalancedBanner
              balanced={data.balanced}
              parts={[
                { label: 'Σ Debit', value: data.totals.debit },
                { label: 'Σ Credit', value: data.totals.credit, op: '=' },
              ]}
            />
          </div>
        </>
      )}
    </ReportShell>
  )
}
