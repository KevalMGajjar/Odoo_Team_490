'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Plus } from 'lucide-react'
import clsx from 'clsx'
import { ControlPanel } from '@/components/layout/ControlPanel'
import { DataTable } from '@/components/ui/DataTable'
import { StatusBadge } from '@/components/ui/StatusBadge'
import { Button } from '@/components/ui/Button'
import { useApiList } from '@/lib/useApi'
import { useAuth, canWrite } from '@/lib/auth'
import { formatMoney, formatDate } from '@/lib/format'

const FILTERS = [
  { value: 'posted', label: 'Posted' },
  { value: 'draft', label: 'Drafts' },
]

export default function JournalEntriesListPage() {
  const router = useRouter()
  const { user } = useAuth()
  const [state, setState] = useState('posted')
  const { rows, loading, search, setSearch, page, pageSize, total, setPage } = useApiList('/journal-entries', {
    extraParams: { state },
  })

  const columns = [
    { key: 'date', header: 'Date', width: 100, render: (r) => formatDate(r.date) },
    {
      key: 'number', header: 'Entry',
      render: (r) => <span className="font-medium tabular">{r.voucherType ? `${r.voucherType} #${r.voucherNo}` : r.number}</span>,
    },
    { key: 'journal', header: 'Journal', hideOnMobile: true, render: (r) => r.journal?.code },
    { key: 'narration', header: 'Narration', hideOnMobile: true, render: (r) => <span className="truncate">{r.narration || '—'}</span> },
    {
      key: 'amount', header: 'Amount', align: 'right',
      value: (r) => Number(r.items?.reduce((s, i) => s + Number(i.debit), 0) ?? 0),
      render: (r) => formatMoney(r.items?.reduce((s, i) => s + Number(i.debit), 0)),
    },
    { key: 'state', header: 'Status', render: (r) => <StatusBadge status={r.state} /> },
  ]

  return (
    <div className="flex h-full flex-col">
      <ControlPanel
        breadcrumb="Account"
        title="Journal Entries"
        actions={
          canWrite(user?.role) && (
            <Button variant="primary" size="sm" icon={Plus} onClick={() => router.push('/journal-entries/new')}>New</Button>
          )
        }
      >
        <div className="flex rounded-sm border border-line overflow-hidden">
          {FILTERS.map((f) => (
            <button
              key={f.value}
              onClick={() => setState(f.value)}
              className={clsx(
                'h-7 px-3 text-xs font-medium border-r border-line last:border-r-0 transition-colors duration-150',
                state === f.value ? 'bg-brand-light text-brand' : 'bg-surface-sheet text-ink-faint hover:bg-surface-hover',
              )}
            >
              {f.label}
            </button>
          ))}
        </div>
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
          onRowClick={(r) => router.push(`/journal-entries/${r.id}`)}
          emptyTitle={state === 'draft' ? 'No draft entries.' : 'No journal entries posted yet.'}
          emptyAction={canWrite(user?.role) ? 'New Entry' : undefined}
          onEmptyAction={() => router.push('/journal-entries/new')}
        />
      </div>
    </div>
  )
}
