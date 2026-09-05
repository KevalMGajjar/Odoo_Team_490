'use client'

import { Suspense, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { ReportShell, ReportFilterField, ReportTable } from '@/components/reports/ReportShell'
import { BalancedBanner } from '@/components/ui/BalancedBanner'
import { useApiGet } from '@/lib/useApi'
import { formatMoney, formatNumber, toDateInput } from '@/lib/format'
import { downloadCsv } from '@/lib/downloadCsv'

const cols = [
  { key: 'name', header: 'Product' },
  { key: 'category', header: 'Category', render: (r) => r.category ?? '—' },
  { key: 'quantity', header: 'Quantity', align: 'right', render: (r) => formatNumber(r.quantity, 3) },
  { key: 'unitCost', header: 'Avg Unit Cost', align: 'right', render: (r) => formatMoney(r.unitCost) },
  { key: 'value', header: 'Value', align: 'right', render: (r) => formatMoney(r.value) },
]

/**
 * useSearchParams() needs a Suspense boundary in the App Router — the voice
 * assistant navigates here with ?asOf=, so the filter must come from the URL.
 */
export default function InventoryValuationPage() {
  return (
    <Suspense fallback={<ReportShell title="Inventory Valuation" loading />}>
      <InventoryValuationPageContent />
    </Suspense>
  )
}

function InventoryValuationPageContent() {
  const params = useSearchParams()
  const [asOf, setAsOf] = useState(params.get('asOf') || toDateInput(new Date()))
  const { data, loading } = useApiGet('/reports/inventory-valuation', { asOf })

  return (
    <ReportShell
      title="Inventory Valuation"
      loading={loading}
      onExportCsv={() => downloadCsv('/reports/inventory-valuation', { asOf }, `inventory-valuation-${asOf}.csv`)}
      filters={
        <ReportFilterField label="As of">
          <input type="date" className="field-input" value={asOf} onChange={(e) => setAsOf(e.target.value)} />
        </ReportFilterField>
      }
    >
      {data && (
        <>
          <ReportTable
            columns={cols}
            rows={data.rows}
            emptyText="No stock-tracked inventory on hand."
            footer={<><td className="px-3 py-2" colSpan={4}>Total Value</td><td className="px-3 py-2 text-right tabular">{formatMoney(data.totals.value)}</td></>}
          />
          <div className="mt-4">
            <BalancedBanner
              balanced={data.tiesOut}
              parts={[
                { label: 'Valuation (rebuilt from stock layers)', value: data.totals.value },
                { label: 'Inventory account balance', value: data.totals.ledgerBalance, op: '=' },
              ]}
            />
          </div>
        </>
      )}
    </ReportShell>
  )
}
