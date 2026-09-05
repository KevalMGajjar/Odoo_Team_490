'use client'

import { useRouter } from 'next/navigation'
import { ControlPanel } from '@/components/layout/ControlPanel'
import { DataTable } from '@/components/ui/DataTable'
import { StatusBadge } from '@/components/ui/StatusBadge'
import { useApiGet } from '@/lib/useApi'
import { formatMoney, formatDate, relativeDue } from '@/lib/format'

export default function PortalDocumentsPage() {
  const router = useRouter()
  const { data, loading } = useApiGet('/portal/documents')

  const columns = [
    { key: 'number', header: 'Document', render: (r) => <span className="font-medium tabular">{r.number}</span> },
    { key: 'kind', header: 'Type', render: (r) => (r.kind === 'invoice' ? 'Invoice' : 'Bill') },
    { key: 'date', header: 'Date', hideOnMobile: true, render: (r) => formatDate(r.date) },
    {
      key: 'dueDate', header: 'Due', hideOnMobile: true,
      render: (r) => {
        const due = relativeDue(r.dueDate, r.settleState)
        return <span className={due?.includes('overdue') ? 'text-state-overdue' : 'text-ink-muted'}>{due ?? '—'}</span>
      },
    },
    { key: 'total', header: 'Total', align: 'right', render: (r) => formatMoney(r.total) },
    { key: 'amountResidual', header: 'Outstanding', align: 'right', render: (r) => formatMoney(r.amountResidual) },
    { key: 'settleState', header: 'Status', render: (r) => <StatusBadge status={r.settleState} /> },
  ]

  return (
    <div className="flex h-full flex-col">
      <ControlPanel title="My Documents" breadcrumb="Portal" />
      <div className="flex-1 overflow-hidden">
        <DataTable
          columns={columns}
          rows={data?.rows ?? []}
          loading={loading}
          onRowClick={(r) => router.push(`/portal/${r.kind}/${r.id}`)}
          emptyTitle="No invoices or bills on record yet."
        />
      </div>
    </div>
  )
}
