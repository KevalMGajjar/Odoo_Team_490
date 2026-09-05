'use client'

import { useRouter } from 'next/navigation'
import { Plus } from 'lucide-react'
import { ControlPanel } from '@/components/layout/ControlPanel'
import { DataTable } from '@/components/ui/DataTable'
import { StatusBadge } from '@/components/ui/StatusBadge'
import { Button } from '@/components/ui/Button'
import { useApiList } from '@/lib/useApi'
import { useAuth, canWrite } from '@/lib/auth'
import { formatMoney, formatDate } from '@/lib/format'

export default function PurchaseOrdersListPage() {
  const router = useRouter()
  const { user } = useAuth()
  const { rows, loading, search, setSearch, page, pageSize, total, setPage } = useApiList('/purchase-orders')

  const columns = [
    { key: 'number', header: 'PO #', render: (r) => <span className="font-medium tabular">{r.number}</span> },
    { key: 'vendor', header: 'Vendor', render: (r) => r.vendor?.name },
    { key: 'orderDate', header: 'Date', hideOnMobile: true, render: (r) => formatDate(r.orderDate) },
    { key: 'total', header: 'Total', align: 'right', value: (r) => Number(r.total), render: (r) => formatMoney(r.total) },
    { key: 'state', header: 'Status', render: (r) => <StatusBadge status={r.state} /> },
  ]

  return (
    <div className="flex h-full flex-col">
      <ControlPanel
        breadcrumb="Purchase"
        title="Purchase Orders"
        actions={canWrite(user?.role) && <Button variant="primary" size="sm" icon={Plus} onClick={() => router.push('/purchase-orders/new')}>New</Button>}
      />
      <div className="flex-1 overflow-hidden">
        <DataTable
          columns={columns} rows={rows} loading={loading}
          search={search} onSearchChange={setSearch}
          page={page} pageSize={pageSize} total={total} onPageChange={setPage}
          onRowClick={(r) => router.push(`/purchase-orders/${r.id}`)}
          emptyTitle="No purchase orders yet."
          emptyAction={canWrite(user?.role) ? 'New Purchase Order' : undefined}
          onEmptyAction={() => router.push('/purchase-orders/new')}
        />
      </div>
    </div>
  )
}
