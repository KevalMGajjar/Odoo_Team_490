'use client'

import { ControlPanel } from '@/components/layout/ControlPanel'
import { DataTable } from '@/components/ui/DataTable'
import { useApiList } from '@/lib/useApi'
import { formatNumber, formatMoney, formatDate } from '@/lib/format'

const TYPE_TONE = { in: 'text-state-paid', out: 'text-state-overdue', adjustment: 'text-secondary' }
const TYPE_LABEL = { in: 'In', out: 'Out', adjustment: 'Adjustment' }

export default function StockMovesPage() {
  const { rows, loading, search, setSearch, page, pageSize, total, setPage } = useApiList('/stock-moves')

  const columns = [
    { key: 'date', header: 'Date', render: (r) => formatDate(r.date) },
    { key: 'product', header: 'Product', render: (r) => r.product?.name },
    { key: 'moveType', header: 'Type', render: (r) => <span className={TYPE_TONE[r.moveType]}>{TYPE_LABEL[r.moveType]}</span> },
    { key: 'quantity', header: 'Quantity', align: 'right', render: (r) => formatNumber(r.quantity, 3) },
    { key: 'unitCost', header: 'Unit Cost', align: 'right', hideOnMobile: true, render: (r) => formatMoney(r.unitCost) },
    {
      key: 'source', header: 'Source', hideOnMobile: true,
      render: (r) => r.vendorBill?.number ?? r.customerInvoice?.number ?? r.adjustment?.number ?? r.reference ?? '—',
    },
  ]

  return (
    <div className="flex h-full flex-col">
      <ControlPanel breadcrumb="Account" title="Stock Moves" />
      <div className="flex-1 overflow-hidden">
        <DataTable
          columns={columns} rows={rows} loading={loading}
          search={search} onSearchChange={setSearch}
          page={page} pageSize={pageSize} total={total} onPageChange={setPage}
          emptyTitle="No stock movement recorded yet."
        />
      </div>
    </div>
  )
}
