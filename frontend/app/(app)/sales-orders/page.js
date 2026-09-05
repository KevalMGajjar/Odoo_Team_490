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
import { formatMoney, formatDate } from '@/lib/format'

/**
 * Wrapped in Suspense because useSearchParams() requires it in the App
 * Router. The voice assistant navigates here with filters in the URL.
 */
export default function SalesOrdersListPage() {
  return (
    <Suspense fallback={null}>
      <SalesOrdersListPageContent />
    </Suspense>
  )
}

function SalesOrdersListPageContent() {
  const router = useRouter()
  const params = useSearchParams()
  const { user } = useAuth()
  const { rows, loading, search, setSearch, page, pageSize, total, setPage } = useApiList('/sales-orders', {
    extraParams: {
      state: params.get('state') || undefined,
      partnerId: params.get('partnerId') || undefined,
    },
  })

  const columns = [
    { key: 'number', header: 'SO #', render: (r) => <span className="font-medium tabular">{r.number}</span> },
    { key: 'customer', header: 'Customer', render: (r) => r.customer?.name },
    { key: 'orderDate', header: 'Date', hideOnMobile: true, render: (r) => formatDate(r.orderDate) },
    { key: 'total', header: 'Total', align: 'right', value: (r) => Number(r.total), render: (r) => formatMoney(r.total) },
    { key: 'state', header: 'Status', render: (r) => <StatusBadge status={r.state} /> },
  ]

  return (
    <div className="flex h-full flex-col">
      <ControlPanel
        breadcrumb="Sales"
        title="Sales Orders"
        actions={canWrite(user?.role) && <Button variant="primary" size="sm" icon={Plus} onClick={() => router.push('/sales-orders/new')}>New</Button>}
      />
      <ActiveFilters />
      <div className="flex-1 overflow-hidden">
        <DataTable
          columns={columns} rows={rows} loading={loading}
          search={search} onSearchChange={setSearch}
          page={page} pageSize={pageSize} total={total} onPageChange={setPage}
          onRowClick={(r) => router.push(`/sales-orders/${r.id}`)}
          emptyTitle="No sales orders yet."
          emptyAction={canWrite(user?.role) ? 'New Sales Order' : undefined}
          onEmptyAction={() => router.push('/sales-orders/new')}
        />
      </div>
    </div>
  )
}
