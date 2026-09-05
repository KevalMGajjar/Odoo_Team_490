'use client'

import { useRouter } from 'next/navigation'
import { ControlPanel } from '@/components/layout/ControlPanel'
import { DataTable } from '@/components/ui/DataTable'
import { StatusBadge } from '@/components/ui/StatusBadge'
import { useApiList } from '@/lib/useApi'
import { formatMoney, formatDate } from '@/lib/format'

export default function PaymentsReceivedPage() {
  const router = useRouter()
  const { rows, loading, search, setSearch, page, pageSize, total, setPage } = useApiList('/payments', {
    extraParams: { direction: 'inbound' },
  })

  const columns = [
    { key: 'number', header: 'Payment #', render: (r) => <span className="font-medium tabular">{r.number}</span> },
    { key: 'partner', header: 'Customer', render: (r) => r.partner?.name },
    { key: 'paymentDate', header: 'Date', hideOnMobile: true, render: (r) => formatDate(r.paymentDate) },
    { key: 'journal', header: 'Via', hideOnMobile: true, render: (r) => r.journal?.name },
    { key: 'amount', header: 'Amount', align: 'right', value: (r) => Number(r.amount), render: (r) => formatMoney(r.amount) },
    { key: 'state', header: 'Status', render: (r) => <StatusBadge status={r.state} /> },
  ]

  return (
    <div className="flex h-full flex-col">
      <ControlPanel breadcrumb="Sales" title="Payments Received" />
      <div className="flex-1 overflow-hidden">
        <DataTable
          columns={columns} rows={rows} loading={loading}
          search={search} onSearchChange={setSearch}
          page={page} pageSize={pageSize} total={total} onPageChange={setPage}
          onRowClick={(r) => router.push(`/payments-received/${r.id}`)}
          emptyTitle="No payments recorded yet. Register one from an open customer invoice."
        />
      </div>
    </div>
  )
}
