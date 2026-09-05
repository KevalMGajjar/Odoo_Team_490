'use client'

import { useRouter } from 'next/navigation'
import { Plus, Package, Wrench } from 'lucide-react'
import { ControlPanel } from '@/components/layout/ControlPanel'
import { DataTable } from '@/components/ui/DataTable'
import { StatusBadge } from '@/components/ui/StatusBadge'
import { Button } from '@/components/ui/Button'
import { useApiList } from '@/lib/useApi'
import { useAuth, canWrite } from '@/lib/auth'
import { formatMoney, formatNumber } from '@/lib/format'

export default function ProductsListPage() {
  const router = useRouter()
  const { user } = useAuth()
  const { rows, loading, search, setSearch, page, pageSize, total, setPage } = useApiList('/products')

  const columns = [
    {
      key: 'name', header: 'Product',
      render: (r) => (
        <span className="flex items-center gap-2 font-medium">
          {r.type === 'service' ? <Wrench size={13} className="text-ink-faint" /> : <Package size={13} className="text-ink-faint" />}
          {r.name}
        </span>
      ),
    },
    { key: 'category', header: 'Category', hideOnMobile: true, render: (r) => r.category?.name || '—' },
    { key: 'salesPrice', header: 'Sales Price', align: 'right', value: (r) => Number(r.salesPrice), render: (r) => formatMoney(r.salesPrice) },
    { key: 'gstRate', header: 'GST %', align: 'right', hideOnMobile: true, render: (r) => `${Number(r.gstRate)}%` },
    {
      key: 'onHandQty', header: 'On Hand', align: 'right',
      render: (r) => (r.trackInventory ? formatNumber(r.onHandQty, 0) : '—'),
    },
    { key: 'status', header: 'Status', render: (r) => <StatusBadge status={r.status} /> },
  ]

  return (
    <div className="flex h-full flex-col">
      <ControlPanel
        breadcrumb="Business Masters"
        title="Products"
        actions={
          canWrite(user?.role) && (
            <Button variant="primary" size="sm" icon={Plus} onClick={() => router.push('/products/new')}>New</Button>
          )
        }
      />
      <div className="flex-1 overflow-hidden">
        <DataTable
          columns={columns}
          rows={rows}
          loading={loading}
          search={search}
          onSearchChange={setSearch}
          page={page}
          pageSize={pageSize}
          total={total}
          onPageChange={setPage}
          onRowClick={(r) => router.push(`/products/${r.id}`)}
          emptyTitle="No products yet."
          emptyAction={canWrite(user?.role) ? 'New Product' : undefined}
          onEmptyAction={() => router.push('/products/new')}
        />
      </div>
    </div>
  )
}
