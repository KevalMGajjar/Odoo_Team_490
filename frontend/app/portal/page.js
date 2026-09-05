'use client'

import { useRouter } from 'next/navigation'
import { ControlPanel } from '@/components/layout/ControlPanel'
import { DataTable } from '@/components/ui/DataTable'
import { StatusBadge } from '@/components/ui/StatusBadge'
import { useApiGet } from '@/lib/useApi'
import { formatMoney, formatDate, relativeDue } from '@/lib/format'

export default function PortalDocumentsPage() {
  const router = useRouter()
  const { data, loading, error } = useApiGet('/portal/documents')

  // A self-signed-up account starts with no contact linked, so this endpoint
  // refuses it. Falling through to the normal empty state would tell them they
  // have no documents, which isn't true — their account just isn't linked yet.
  const awaitingLink = error?.status === 403

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
      {awaitingLink ? (
        <div className="p-6">
          <div className="mx-auto max-w-md rounded border border-line bg-surface-sheet p-6 text-center">
            <p className="text-md font-semibold text-ink">Your account isn&rsquo;t linked yet</p>
            <p className="mt-2 text-sm text-ink-muted">
              New accounts start with no access to any records. An administrator needs to link your
              login to a customer or vendor before your invoices appear here.
            </p>
          </div>
        </div>
      ) : (
      <div className="flex-1 overflow-hidden">
        <DataTable
          columns={columns}
          rows={data?.rows ?? []}
          loading={loading}
          onRowClick={(r) => router.push(`/portal/${r.kind}/${r.id}`)}
          emptyTitle="No invoices or bills on record yet."
        />
      </div>
      )}
    </div>
  )
}
