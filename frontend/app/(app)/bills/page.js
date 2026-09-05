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
export default function BillsListPage() {
  return (
    <Suspense fallback={null}>
      <BillsListPageContent />
    </Suspense>
  )
}

function BillsListPageContent() {
  const router = useRouter()
  const params = useSearchParams()
  const { user } = useAuth()
  const { rows, loading, search, setSearch, page, pageSize, total, setPage } = useApiList('/bills', {
    extraParams: {
    settleState: params.get('settleState') || undefined,
      state: params.get('state') || undefined,
      partnerId: params.get('partnerId') || undefined,
    },
  })

  const columns = [
    { key: 'number', header: 'Bill #', render: (r) => <span className="font-medium tabular">{r.number}</span> },
    { key: 'vendor', header: 'Vendor', render: (r) => r.vendor?.name },
    { key: 'billDate', header: 'Date', hideOnMobile: true, render: (r) => formatDate(r.billDate) },
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
        breadcrumb="Purchase"
        title="Vendor Bills"
        actions={canWrite(user?.role) && <Button variant="primary" size="sm" icon={Plus} onClick={() => router.push('/bills/new')}>New</Button>}
      />
      <ActiveFilters />
      <div className="flex-1 overflow-hidden">
        <DataTable
          columns={columns} rows={rows} loading={loading}
          search={search} onSearchChange={setSearch}
          page={page} pageSize={pageSize} total={total} onPageChange={setPage}
          onRowClick={(r) => router.push(`/bills/${r.id}`)}
          emptyTitle="No vendor bills yet."
          emptyAction={canWrite(user?.role) ? 'New Bill' : undefined}
          onEmptyAction={() => router.push('/bills/new')}
        />
      </div>
    </div>
  )
}
