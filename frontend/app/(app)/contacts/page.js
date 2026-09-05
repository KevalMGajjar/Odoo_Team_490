'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Plus, Building2, User, List, LayoutGrid } from 'lucide-react'
import { ControlPanel, ViewSwitcher } from '@/components/layout/ControlPanel'
import { ArchiveFilter } from '@/components/masters/ArchiveFilter'
import { DataTable } from '@/components/ui/DataTable'
import { StatusBadge } from '@/components/ui/StatusBadge'
import { Button } from '@/components/ui/Button'
import { useApiList } from '@/lib/useApi'
import { assetUrl } from '@/lib/api'
import { useAuth, canWrite } from '@/lib/auth'

const TYPE_LABEL = { customer: 'Customer', vendor: 'Vendor', both: 'Customer & Vendor' }
const VIEW_OPTIONS = [
  { value: 'list', icon: List, label: 'List' },
  { value: 'kanban', icon: LayoutGrid, label: 'Kanban' },
]

function Avatar({ contact, size = 20 }) {
  if (contact.profileImage) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={assetUrl(contact.profileImage)} alt={contact.name} className="rounded-full object-cover" style={{ width: size, height: size }} />
  }
  const Icon = contact.type === 'vendor' ? Building2 : User
  return <Icon size={size * 0.7} className="text-ink-faint" />
}

export default function ContactsListPage() {
  const router = useRouter()
  const { user } = useAuth()
  const [view, setView] = useState('list')
  const [status, setStatus] = useState('active')
  const { rows, loading, search, setSearch, searchField, setSearchField, page, pageSize, total, setPage, reload } = useApiList('/contacts', { extraParams: { status } })

  const columns = [
    {
      key: 'name',
      header: 'Name',
      render: (r) => (
        <span className="flex items-center gap-2 font-medium">
          <Avatar contact={r} size={18} />
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
        breadcrumb="Account"
        title="Contacts"
        actions={
          canWrite(user?.role) && (
            <Button variant="primary" size="sm" icon={Plus} onClick={() => router.push('/contacts/new')}>
              New
            </Button>
          )
        }
        viewSwitcher={<ViewSwitcher value={view} onChange={setView} options={VIEW_OPTIONS} />}
      >
        <ArchiveFilter value={status} onChange={setStatus} apiPath="/contacts" onRestored={reload} />
      </ControlPanel>
      <div className="flex-1 overflow-hidden">
        <DataTable
          columns={columns}
          rows={rows}
          loading={loading}
          search={search}
          onSearchChange={setSearch}
          searchColumns={[{ key: 'name', label: 'Name' }, { key: 'email', label: 'Email' }, { key: 'city', label: 'City' }]}
          searchField={searchField}
          onSearchFieldChange={setSearchField}
          page={page}
          pageSize={pageSize}
          total={total}
          onPageChange={setPage}
          onRowClick={(r) => router.push(`/contacts/${r.id}`)}
          emptyTitle="No contacts yet — add your first customer or vendor."
          emptyAction={canWrite(user?.role) ? 'New Contact' : undefined}
          onEmptyAction={() => router.push('/contacts/new')}
          view={view}
          renderCard={(r) => (
            <div className="flex flex-col items-center gap-2 text-center">
              <div className="flex h-14 w-14 items-center justify-center overflow-hidden rounded-full border border-line bg-surface-subtle">
                <Avatar contact={r} size={56} />
              </div>
              <p className="truncate w-full text-sm font-semibold text-ink">{r.name}</p>
              <p className="text-xs text-ink-faint">{TYPE_LABEL[r.type] ?? r.type}</p>
              {r.city && <p className="text-xs text-ink-faint">{r.city}</p>}
              <StatusBadge status={r.status} />
            </div>
          )}
        />
      </div>
    </div>
  )
}
