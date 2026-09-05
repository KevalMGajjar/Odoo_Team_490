'use client'

import { useRouter } from 'next/navigation'
import { Plus, Building2, User } from 'lucide-react'
import { ControlPanel } from '@/components/layout/ControlPanel'
import { DataTable } from '@/components/ui/DataTable'
import { StatusBadge } from '@/components/ui/StatusBadge'
import { Button } from '@/components/ui/Button'
import { useApiList } from '@/lib/useApi'
import { useAuth, canWrite } from '@/lib/auth'

const TYPE_LABEL = { customer: 'Customer', vendor: 'Vendor', both: 'Customer & Vendor' }

export default function ContactsListPage() {
  const router = useRouter()
  const { user } = useAuth()
  const { rows, loading, search, setSearch, page, pageSize, total, setPage } = useApiList('/contacts')

  const columns = [
    {
      key: 'name',
      header: 'Name',
      render: (r) => (
        <span className="flex items-center gap-2 font-medium">
          {r.type === 'vendor' ? <Building2 size={14} className="text-ink-faint" /> : <User size={14} className="text-ink-faint" />}
          {r.name}
        </span>
      ),
    },
    { key: 'type', header: 'Type', render: (r) => TYPE_LABEL[r.type] ?? r.type },
    { key: 'email', header: 'Email', hideOnMobile: true, render: (r) => r.email || '—' },
    { key: 'mobile', header: 'Mobile', hideOnMobile: true, render: (r) => r.mobile || '—' },
    { key: 'city', header: 'City', hideOnMobile: true, render: (r) => r.city || '—' },
    { key: 'status', header: 'Status', render: (r) => <StatusBadge status={r.status} /> },
  ]

  return (
    <div className="flex h-full flex-col">
      <ControlPanel
        breadcrumb="Business Masters"
        title="Contacts"
        actions={
          canWrite(user?.role) && (
            <Button variant="primary" size="sm" icon={Plus} onClick={() => router.push('/contacts/new')}>
              New
            </Button>
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
          onRowClick={(r) => router.push(`/contacts/${r.id}`)}
          emptyTitle="No contacts yet — add your first customer or vendor."
          emptyAction={canWrite(user?.role) ? 'New Contact' : undefined}
          onEmptyAction={() => router.push('/contacts/new')}
        />
      </div>
    </div>
  )
}
