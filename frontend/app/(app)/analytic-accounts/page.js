'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Plus, List, LayoutGrid, Wallet, TrendingUp } from 'lucide-react'
import { ControlPanel, ViewSwitcher } from '@/components/layout/ControlPanel'
import { ArchiveFilter } from '@/components/masters/ArchiveFilter'
import { DataTable } from '@/components/ui/DataTable'
import { StatusBadge } from '@/components/ui/StatusBadge'
import { Button } from '@/components/ui/Button'
import { useApiList } from '@/lib/useApi'
import { useAuth, canWrite } from '@/lib/auth'

const TYPE_LABEL = { income: 'Income', expense: 'Expense' }
const VIEW_OPTIONS = [
  { value: 'list', icon: List, label: 'List' },
  { value: 'kanban', icon: LayoutGrid, label: 'Kanban' },
]

export default function AnalyticAccountsListPage() {
  const router = useRouter()
  const { user } = useAuth()
  const [view, setView] = useState('list')
  const [status, setStatus] = useState('active')
  const { rows, loading, search, setSearch, page, pageSize, total, setPage, reload } = useApiList('/analytic-accounts', { extraParams: { status } })

  const columns = [
    { key: 'name', header: 'Analytical Account' },
    { key: 'type', header: 'Type', render: (r) => TYPE_LABEL[r.type] ?? r.type },
    { key: 'status', header: 'Status', render: (r) => <StatusBadge status={r.status} /> },
  ]

  return (
    <div className="flex h-full flex-col">
      <ControlPanel
        breadcrumb="Account"
        title="Analytic Accounts"
        actions={
          canWrite(user?.role) && (
            <Button variant="primary" size="sm" icon={Plus} onClick={() => router.push('/analytic-accounts/new')}>New</Button>
          )
        }
        viewSwitcher={<ViewSwitcher value={view} onChange={setView} options={VIEW_OPTIONS} />}
      >
        <ArchiveFilter value={status} onChange={setStatus} apiPath="/analytic-accounts" onRestored={reload} />
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
          onRowClick={(r) => router.push(`/analytic-accounts/${r.id}`)}
          emptyTitle="No analytical accounts yet."
          emptyAction={canWrite(user?.role) ? 'New' : undefined}
          onEmptyAction={() => router.push('/analytic-accounts/new')}
          view={view}
          renderCard={(r) => (
            <div className="flex flex-col items-center gap-2 text-center">
              <div className="flex h-12 w-12 items-center justify-center rounded-full border border-line bg-surface-subtle">
                {r.type === 'income' ? <TrendingUp size={20} className="text-state-paid" /> : <Wallet size={20} className="text-ink-faint" />}
              </div>
              <p className="truncate w-full text-sm font-semibold text-ink">{r.name}</p>
              <p className="text-xs text-ink-faint">{TYPE_LABEL[r.type] ?? r.type}</p>
              <StatusBadge status={r.status} />
            </div>
          )}
        />
      </div>
    </div>
  )
}
