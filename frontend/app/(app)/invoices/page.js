'use client'

import { Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { Plus } from 'lucide-react'
import { ControlPanel } from '@/components/layout/ControlPanel'
import { ActiveFilters } from '@/components/layout/ActiveFilters'
import { DataTable } from '@/components/ui/DataTable'
import { StatusBadge } from '@/components/ui/StatusBadge'
import { Button } from '@/components/ui/Button'
import { useApiList } from '@/lib/useApi'
import { useAuth, canWrite } from '@/lib/auth'
import { formatMoney, formatDate, relativeDue } from '@/lib/format'

/**
 * Wrapped in Suspense because useSearchParams() requires it in the App
 * Router. The voice assistant navigates here with filters in the URL.
 */
export default function InvoicesListPage() {
  return (
    <Suspense fallback={null}>
      <InvoicesListPageContent />
    </Suspense>
  )
}

function InvoicesListPageContent() {
  const router = useRouter()
  const params = useSearchParams()
  const { user } = useAuth()
  const { rows, loading, search, setSearch, page, pageSize, total, setPage } = useApiList('/invoices', {
    extraParams: {
    settleState: params.get('settleState') || undefined,
      state: params.get('state') || undefined,
      partnerId: params.get('partnerId') || undefined,
    },
  })

  const columns = [
    { key: 'number', header: 'Invoice #', render: (r) => <span className="font-medium tabular">{r.number}</span> },
    { key: 'customer', header: 'Customer', render: (r) => r.customer?.name },
    { key: 'invoiceDate', header: 'Date', hideOnMobile: true, render: (r) => formatDate(r.invoiceDate) },
    {
      key: 'dueDate', header: 'Due', hideOnMobile: true,
      render: (r) => {
        const due = relativeDue(r.dueDate, r.settleState)
        return <span className={due?.includes('overdue') ? 'text-state-overdue' : 'text-ink-muted'}>{due ?? '—'}</span>
      },
    },
    { key: 'total', header: 'Total', align: 'right', value: (r) => Number(r.total), render: (r) => formatMoney(r.total) },
    { key: 'state', header: 'Status', render: (r) => <StatusBadge status={r.state} /> },
    { key: 'settleState', header: 'Payment', render: (r) => <StatusBadge status={r.settleState} /> },
  ]

  return (
    <div className="flex h-full flex-col">
      <ControlPanel
        breadcrumb="Sales"
        title="Customer Invoices"
        actions={canWrite(user?.role) && <Button variant="primary" size="sm" icon={Plus} onClick={() => router.push('/invoices/new')}>New</Button>}
      />
      <ActiveFilters />
      <div className="flex-1 overflow-hidden">
        <DataTable
          columns={columns} rows={rows} loading={loading}
          search={search} onSearchChange={setSearch}
          page={page} pageSize={pageSize} total={total} onPageChange={setPage}
          onRowClick={(r) => router.push(`/invoices/${r.id}`)}
          emptyTitle="No customer invoices yet."
          emptyAction={canWrite(user?.role) ? 'New Invoice' : undefined}
          onEmptyAction={() => router.push('/invoices/new')}
        />
      </div>
    </div>
  )
}
