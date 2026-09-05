'use client'

import { useRouter } from 'next/navigation'
import { Plus } from 'lucide-react'
import { ControlPanel } from '@/components/layout/ControlPanel'
import { DataTable } from '@/components/ui/DataTable'
import { StatusBadge } from '@/components/ui/StatusBadge'
import { Button } from '@/components/ui/Button'
import { useApiList } from '@/lib/useApi'
import { useAuth, canWrite } from '@/lib/auth'
import { formatMoney, formatDate, relativeDue } from '@/lib/format'

export default function InvoicesListPage() {
  const router = useRouter()
  const { user } = useAuth()
  const { rows, loading, search, setSearch, page, pageSize, total, setPage } = useApiList('/invoices')

  const columns = [
    { key: 'number', header: 'Invoice #', render: (r) => <span className="font-medium tabular">{r.number}</span> },
    { key: 'customer', header: 'Customer', render: (r) => r.customer?.name },
    { key: 'invoiceDate', header: 'Date', hideOnMobile: true, render: (r) => formatDate(r.invoiceDate) },
    {
      key: 'dueDate', header: 'Due', hideOnMobile: true,
      render: (r) => {
        const due = relativeDue(r.dueDate)
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
