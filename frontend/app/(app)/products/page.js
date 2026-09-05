'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Plus, Package, Wrench, List, LayoutGrid } from 'lucide-react'
import { ControlPanel, ViewSwitcher } from '@/components/layout/ControlPanel'
import { ArchiveFilter } from '@/components/masters/ArchiveFilter'
import { DataTable } from '@/components/ui/DataTable'
import { StatusBadge } from '@/components/ui/StatusBadge'
import { Button } from '@/components/ui/Button'
import { useApiList } from '@/lib/useApi'
import { useAuth, canWrite } from '@/lib/auth'
import { formatMoney, formatNumber } from '@/lib/format'

const VIEW_OPTIONS = [
  { value: 'list', icon: List, label: 'List' },
  { value: 'kanban', icon: LayoutGrid, label: 'Kanban' },
]

function Thumb({ product, size = 20 }) {
  if (product.image) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={product.image} alt={product.name} className="rounded object-cover" style={{ width: size, height: size }} />
  }
  const Icon = product.type === 'service' ? Wrench : Package
  return <Icon size={size * 0.65} className="text-ink-faint" />
}

export default function ProductsListPage() {
  const router = useRouter()
  const { user } = useAuth()
  const [view, setView] = useState('list')
  const [status, setStatus] = useState('active')
  const { rows, loading, search, setSearch, page, pageSize, total, setPage, reload } = useApiList('/products', { extraParams: { status } })

  const columns = [
    {
      key: 'name', header: 'Product',
      render: (r) => (
        <span className="flex items-center gap-2 font-medium">
          <Thumb product={r} size={18} />
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
        breadcrumb="Account"
        title="Products"
        actions={
          canWrite(user?.role) && (
            <Button variant="primary" size="sm" icon={Plus} onClick={() => router.push('/products/new')}>New</Button>
          )
        }
        viewSwitcher={<ViewSwitcher value={view} onChange={setView} options={VIEW_OPTIONS} />}
      >
        <ArchiveFilter value={status} onChange={setStatus} apiPath="/products" onRestored={reload} />
      </ControlPanel>
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
          view={view}
          renderCard={(r) => (
            <div className="flex flex-col items-center gap-2 text-center">
              <div className="flex h-14 w-14 items-center justify-center overflow-hidden rounded border border-line bg-surface-subtle">
                <Thumb product={r} size={56} />
              </div>
              <p className="truncate w-full text-sm font-semibold text-ink">{r.name}</p>
              <p className="text-xs text-ink-faint">{r.category?.name || '—'}</p>
              <p className="tabular text-sm font-medium text-ink">{formatMoney(r.salesPrice)}</p>
              <StatusBadge status={r.status} />
            </div>
          )}
        />
      </div>
    </div>
  )
}
