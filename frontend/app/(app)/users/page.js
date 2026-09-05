'use client'

import { useRouter } from 'next/navigation'
import { Plus } from 'lucide-react'
import { ControlPanel } from '@/components/layout/ControlPanel'
import { DataTable } from '@/components/ui/DataTable'
import { StatusBadge } from '@/components/ui/StatusBadge'
import { Button } from '@/components/ui/Button'
import { useApiList } from '@/lib/useApi'
import { useAuth, canModify } from '@/lib/auth'
import { formatDate } from '@/lib/format'

const ROLE_LABEL = { admin: 'Admin', accountant: 'Accountant', user: 'Portal User' }

export default function UsersListPage() {
  const router = useRouter()
  const { user } = useAuth()
  const { rows, loading, search, setSearch } = useApiList('/users', { pageSize: 200 })

  const columns = [
    { key: 'name', header: 'Name', render: (r) => <span className="font-medium">{r.name}</span> },
    { key: 'loginId', header: 'Login ID', render: (r) => <span className="font-mono text-xs">{r.loginId}</span> },
    { key: 'email', header: 'Email', hideOnMobile: true },
    { key: 'role', header: 'Role', render: (r) => ROLE_LABEL[r.role] ?? r.role },
    { key: 'contact', header: 'Linked Contact', hideOnMobile: true, render: (r) => r.contact?.name ?? '—' },
    { key: 'createdAt', header: 'Created', hideOnMobile: true, render: (r) => formatDate(r.createdAt) },
    { key: 'status', header: 'Status', render: (r) => <StatusBadge status={r.status} /> },
  ]

  if (!canModify(user?.role)) {
    return (
      <div className="flex h-full flex-col">
        <ControlPanel breadcrumb="Admin" title="Users" />
        <div className="p-6"><p className="text-sm text-ink-muted">Admin access only.</p></div>
      </div>
    )
  }

  return (
    <div className="flex h-full flex-col">
      <ControlPanel
        breadcrumb="Admin"
        title="Users"
        actions={
          <Button variant="primary" size="sm" icon={Plus} onClick={() => router.push('/users/new')}>
            New
          </Button>
        }
      />
      <div className="flex-1 overflow-hidden">
        <DataTable
          columns={columns}
          rows={rows}
          loading={loading}
          search={search}
          onSearchChange={setSearch}
          onRowClick={(r) => router.push(`/users/${r.id}`)}
          emptyTitle="No users yet."
          emptyAction="New User"
          onEmptyAction={() => router.push('/users/new')}
        />
      </div>
    </div>
  )
}
