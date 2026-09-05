'use client'

import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Plus, List, LayoutGrid } from 'lucide-react'
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer, Legend } from 'recharts'
import clsx from 'clsx'
import { ControlPanel, ViewSwitcher } from '@/components/layout/ControlPanel'
import { DataTable } from '@/components/ui/DataTable'
import { StatusBadge } from '@/components/ui/StatusBadge'
import { Button } from '@/components/ui/Button'
import { useApiList } from '@/lib/useApi'
import { useAuth, canWrite } from '@/lib/auth'
import { formatMoney, formatDate } from '@/lib/format'

const VIEW_OPTIONS = [
  { value: 'list', icon: List, label: 'List' },
  { value: 'kanban', icon: LayoutGrid, label: 'Kanban' },
]

const STATE_FILTERS = [
  { value: 'all', label: 'All' },
  { value: 'draft', label: 'Draft' },
  { value: 'confirmed', label: 'Confirmed' },
  { value: 'revised', label: 'Revised' },
  { value: 'cancelled', label: 'Cancelled' },
]

const SLICE_COLORS = ['#714b67', '#a87e9c', '#17a2b8', '#28a745', '#f0ad4e', '#d9534f', '#5c3d54', '#0d6674']

export default function BudgetsListPage() {
  const router = useRouter()
  const { user } = useAuth()
  const [view, setView] = useState('list')
  const [state, setState] = useState('all')
  const { rows, loading, search, setSearch, page, pageSize, total, setPage } = useApiList('/budgets', {
    extraParams: { state },
  })

  const chartData = useMemo(
    () =>
      rows
        .map((b) => ({ name: b.name, value: Number(b.committedTotal) }))
        .filter((d) => d.value > 0),
    [rows],
  )

  const columns = [
    { key: 'name', header: 'Budget' },
    { key: 'period', header: 'Period', hideOnMobile: true, render: (r) => `${formatDate(r.startDate)} – ${formatDate(r.endDate)}` },
    { key: 'responsible', header: 'Responsible', hideOnMobile: true, render: (r) => r.responsible?.name || '—' },
    { key: 'committedTotal', header: 'Committed', align: 'right', render: (r) => formatMoney(r.committedTotal) },
    { key: 'achievedTotal', header: 'Achieved', align: 'right', render: (r) => formatMoney(r.achievedTotal) },
    { key: 'state', header: 'Status', render: (r) => <StatusBadge status={r.state} /> },
  ]

  return (
    <div className="flex h-full flex-col">
      <ControlPanel
        breadcrumb="Account"
        title="Budgets"
        actions={
          canWrite(user?.role) && (
            <Button variant="primary" size="sm" icon={Plus} onClick={() => router.push('/budgets/new')}>New</Button>
          )
        }
        viewSwitcher={<ViewSwitcher value={view} onChange={setView} options={VIEW_OPTIONS} />}
      >
        <div className="flex rounded-sm border border-line overflow-hidden">
          {STATE_FILTERS.map((f) => (
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

      {chartData.length > 0 && (
        <div className="border-b border-line px-4 py-3">
          <p className="mb-1 text-xs font-semibold uppercase text-ink-muted">Committed Amount by Budget</p>
          <ResponsiveContainer width="100%" height={180}>
            <PieChart>
              <Pie data={chartData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={70} paddingAngle={2}>
                {chartData.map((_, i) => <Cell key={i} fill={SLICE_COLORS[i % SLICE_COLORS.length]} />)}
              </Pie>
              <Tooltip formatter={(v) => formatMoney(v)} />
              <Legend layout="vertical" verticalAlign="middle" align="right" wrapperStyle={{ fontSize: 12 }} />
            </PieChart>
          </ResponsiveContainer>
        </div>
      )}

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
          onRowClick={(r) => router.push(`/budgets/${r.id}`)}
          emptyTitle="No budgets yet."
          emptyAction={canWrite(user?.role) ? 'New Budget' : undefined}
          onEmptyAction={() => router.push('/budgets/new')}
          view={view}
          renderCard={(r) => (
            <div className="flex flex-col gap-2">
              <div className="flex items-start justify-between gap-2">
                <p className="text-sm font-semibold text-ink">{r.name}</p>
                <StatusBadge status={r.state} />
              </div>
              <p className="text-xs text-ink-faint">{formatDate(r.startDate)} – {formatDate(r.endDate)}</p>
              <div className="flex justify-between text-xs">
                <span className="text-ink-muted">Committed</span>
                <span className="tabular font-medium text-ink">{formatMoney(r.committedTotal)}</span>
              </div>
              <div className="flex justify-between text-xs">
                <span className="text-ink-muted">Achieved</span>
                <span className="tabular font-medium text-ink">{formatMoney(r.achievedTotal)}</span>
              </div>
            </div>
          )}
        />
      </div>
    </div>
  )
}
