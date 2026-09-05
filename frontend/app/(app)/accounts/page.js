'use client'

import { useRouter } from 'next/navigation'
import { Plus, Landmark } from 'lucide-react'
import { ControlPanel } from '@/components/layout/ControlPanel'
import { DataTable } from '@/components/ui/DataTable'
import { StatusBadge } from '@/components/ui/StatusBadge'
import { Button } from '@/components/ui/Button'
import { useApiList } from '@/lib/useApi'
import { useAuth, canWrite } from '@/lib/auth'

const TYPE_TONE = {
  asset: 'text-secondary', liability: 'text-ledger-credit', bank: 'text-secondary', cash: 'text-secondary',
  income: 'text-state-paid', expense: 'text-state-overdue', other_expense: 'text-state-overdue', capital: 'text-brand',
}
const TYPE_LABEL = {
  asset: 'Asset', liability: 'Liability', bank: 'Bank', cash: 'Cash',
  capital: 'Capital', income: 'Income', expense: 'Expenses', other_expense: 'Other Expenses',
}

export default function AccountsListPage() {
  const router = useRouter()
  const { user } = useAuth()
  const { rows, loading, search, setSearch, page, pageSize, total, setPage } = useApiList('/accounts', { pageSize: 50 })

  const columns = [
    { key: 'code', header: 'Code', width: 90, render: (r) => <span className="font-medium tabular">{r.code}</span> },
    {
      key: 'name', header: 'Account',
      render: (r) => (
        <span className="flex items-center gap-1.5">
          {r.isCashBank && <Landmark size={13} className="text-secondary" />}
          {r.name}
        </span>
      ),
    },
    { key: 'type', header: 'Type', render: (r) => <span className={TYPE_TONE[r.type]}>{TYPE_LABEL[r.type]}</span> },
    { key: 'isCashBank', header: 'Cash/Bank', hideOnMobile: true, render: (r) => (r.isCashBank ? 'Yes' : '—') },
    { key: 'status', header: 'Status', render: (r) => <StatusBadge status={r.status} /> },
  ]

  return (
    <div className="flex h-full flex-col">
      <ControlPanel
        breadcrumb="Account"
        title="Chart of Accounts"
        actions={
          canWrite(user?.role) && (
            <Button variant="primary" size="sm" icon={Plus} onClick={() => router.push('/accounts/new')}>New</Button>
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
          onRowClick={(r) => router.push(`/accounts/${r.id}`)}
          emptyTitle="No accounts yet."
          emptyAction={canWrite(user?.role) ? 'New Account' : undefined}
          onEmptyAction={() => router.push('/accounts/new')}
        />
      </div>
    </div>
  )
}
