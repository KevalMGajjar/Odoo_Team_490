'use client'

import { useRouter } from 'next/navigation'
import { Plus } from 'lucide-react'
import { ControlPanel } from '@/components/layout/ControlPanel'
import { DataTable } from '@/components/ui/DataTable'
import { StatusBadge } from '@/components/ui/StatusBadge'
import { Button } from '@/components/ui/Button'
import { useApiList } from '@/lib/useApi'
import { useAuth, canWrite } from '@/lib/auth'
import { formatDate } from '@/lib/format'

export default function StockAdjustmentsPage() {
  const router = useRouter()
  const { user } = useAuth()
  const { rows, loading, page, pageSize, total, setPage } = useApiList('/stock-adjustments', { pageSize: 50 })

  const columns = [
    { key: 'number', header: 'Adjustment #', render: (r) => <span className="font-medium tabular">{r.number}</span> },
    { key: 'date', header: 'Date', render: (r) => formatDate(r.date) },
    { key: 'reason', header: 'Reason', hideOnMobile: true, render: (r) => r.reason || '—' },
    { key: 'lines', header: 'Products', align: 'right', render: (r) => r.lines?.length ?? 0 },
    { key: 'state', header: 'Status', render: (r) => <StatusBadge status={r.state} /> },
  ]

  return (
    <div className="flex h-full flex-col">
      <ControlPanel
        breadcrumb="Account"
        title="Stock Adjustments"
        actions={canWrite(user?.role) && <Button variant="primary" size="sm" icon={Plus} onClick={() => router.push('/stock-adjustments/new')}>New Count</Button>}
      />
      <div className="flex-1 overflow-hidden">
        <DataTable
          columns={columns} rows={rows} loading={loading}
          page={page} pageSize={pageSize} total={total} onPageChange={setPage}
          onRowClick={(r) => router.push(`/stock-adjustments/${r.id}`)}
          emptyTitle="No stock counts recorded yet."
          emptyAction={canWrite(user?.role) ? 'New Count' : undefined}
          onEmptyAction={() => router.push('/stock-adjustments/new')}
        />
      </div>
    </div>
  )
}
