'use client'

import { useState } from 'react'
import { ReportShell, ReportFilterField, ReportTable } from '@/components/reports/ReportShell'
import { BalancedBanner } from '@/components/ui/BalancedBanner'
import { DrillDownLink } from '@/components/ui/DrillDownLink'
import { useApiGet } from '@/lib/useApi'
import { formatMoney, toDateInput } from '@/lib/format'
import { downloadCsv } from '@/lib/downloadCsv'

const cols = [
  { key: 'name', header: 'Account', render: (r) => <DrillDownLink href={`/reports/general-ledger?accountId=${r.accountId}`}>{r.name}</DrillDownLink> },
  { key: 'balance', header: 'Balance', align: 'right', render: (r) => formatMoney(r.balance) },
]

const sumBalances = (rows) => (rows ?? []).reduce((a, r) => a + Number(r.balance), 0)

export default function BalanceSheetPage() {
  const [asOf, setAsOf] = useState(toDateInput(new Date()))
  const { data, loading } = useApiGet('/reports/balance-sheet', { asOf })

  return (
    <ReportShell
      title="Balance Sheet"
      loading={loading}
      onExportCsv={() => downloadCsv('/reports/balance-sheet', { asOf }, `balance-sheet-${asOf}.csv`)}
      filters={
        <ReportFilterField label="As of">
          <input type="date" className="field-input" value={asOf} onChange={(e) => setAsOf(e.target.value)} />
        </ReportFilterField>
      }
    >
      {data && (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <div className="space-y-4">
            <div>
              <p className="text-md font-semibold text-ink mb-2">Assets</p>
              <ReportTable
                columns={cols}
                rows={data.assets}
                emptyText="No asset balances."
                footer={<><td className="px-3 py-2">Subtotal</td><td className="px-3 py-2 text-right tabular">{formatMoney(sumBalances(data.assets))}</td></>}
              />
            </div>
            <div>
              <p className="text-md font-semibold text-ink mb-2">Bank</p>
              <ReportTable
                columns={cols}
                rows={data.bank}
                emptyText="No bank balances."
                footer={<><td className="px-3 py-2">Subtotal</td><td className="px-3 py-2 text-right tabular">{formatMoney(sumBalances(data.bank))}</td></>}
              />
            </div>
            <div>
              <p className="text-md font-semibold text-ink mb-2">Cash</p>
              <ReportTable
                columns={cols}
                rows={data.cash}
                emptyText="No cash balances."
                footer={<><td className="px-3 py-2">Subtotal</td><td className="px-3 py-2 text-right tabular">{formatMoney(sumBalances(data.cash))}</td></>}
              />
            </div>
            <div className="flex justify-between rounded border border-line bg-surface-subtle px-3 py-2 text-sm font-semibold text-ink">
              <span>Total Assets</span>
              <span className="tabular">{formatMoney(data.totals.assets)}</span>
            </div>
          </div>

          <div className="space-y-4">
            <div>
              <p className="text-md font-semibold text-ink mb-2">Liabilities</p>
              <ReportTable
                columns={cols}
                rows={data.liabilities}
                emptyText="No liability balances."
                footer={<><td className="px-3 py-2">Total Liabilities</td><td className="px-3 py-2 text-right tabular">{formatMoney(data.totals.liabilities)}</td></>}
              />
            </div>
            <div>
              <p className="text-md font-semibold text-ink mb-2">Capital</p>
              <ReportTable
                columns={cols}
                rows={[...data.capital, { name: 'Current Period Earnings', balance: data.currentEarnings, accountId: null }]}
                emptyText="No capital balances."
                footer={<><td className="px-3 py-2">Total Capital + Earnings</td><td className="px-3 py-2 text-right tabular">{formatMoney(data.totals.equity)}</td></>}
              />
            </div>
          </div>

          <div className="lg:col-span-2">
            <BalancedBanner
              balanced={data.balanced}
              parts={[
                { label: 'Assets', value: data.totals.assets },
                { label: 'Liabilities', value: data.totals.liabilities, op: '=' },
                { label: 'Capital', value: data.totals.capital },
                { label: 'Current Earnings', value: data.currentEarnings },
              ]}
            />
          </div>
        </div>
      )}
    </ReportShell>
  )
}
