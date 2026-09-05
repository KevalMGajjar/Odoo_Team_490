'use client'

import { useState } from 'react'
import { ControlPanel } from '@/components/layout/ControlPanel'
import { DataTable } from '@/components/ui/DataTable'
import { Modal } from '@/components/ui/Modal'
import { Select } from '@/components/ui/FormField'
import { useApiGet, useApiList } from '@/lib/useApi'
import { formatDateTime } from '@/lib/format'

const ENTITY_TYPES = [
  'contact', 'product', 'chart_of_account', 'journal', 'tax', 'currency', 'currency_rate',
  'analytic_account', 'budget', 'journal_entry', 'purchase_order', 'vendor_bill',
  'sales_order', 'customer_invoice', 'payment', 'user',
]

export default function AuditLogPage() {
  const [action, setAction] = useState('')
  const [entityType, setEntityType] = useState('')
  const [viewing, setViewing] = useState(null)
  const { data: actionsData } = useApiGet('/audit/actions')
  const { rows, loading, page, pageSize, total, setPage } = useApiList('/audit', {
    extraParams: { action: action || undefined, entityType: entityType || undefined },
  })

  const columns = [
    { key: 'performedAt', header: 'When', render: (r) => formatDateTime(r.performedAt) },
    { key: 'action', header: 'Action', render: (r) => <span className="font-mono text-xs">{r.action}</span> },
    { key: 'entityType', header: 'Entity', hideOnMobile: true },
    { key: 'performer', header: 'By', render: (r) => r.performer?.name ?? '—' },
    {
      key: 'view', header: '', sortable: false,
      render: (r) => (r.oldValue || r.newValue) && (
        <button onClick={() => setViewing(r)} className="text-xs text-secondary hover:underline">View diff</button>
      ),
    },
  ]

  return (
    <div className="flex h-full flex-col">
      <ControlPanel breadcrumb="Admin" title="Audit Log" />
      <div className="flex flex-wrap items-end gap-3 border-b border-line bg-surface-sheet px-4 py-3">
        <div>
          <label className="field-label">Action</label>
          <Select value={action} onChange={(e) => setAction(e.target.value)}>
            <option value="">All</option>
            {actionsData?.actions.map((a) => <option key={a} value={a}>{a}</option>)}
          </Select>
        </div>
        <div>
          <label className="field-label">Entity Type</label>
          <Select value={entityType} onChange={(e) => setEntityType(e.target.value)}>
            <option value="">All</option>
            {ENTITY_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
          </Select>
        </div>
      </div>
      <div className="flex-1 overflow-hidden">
        <DataTable
          columns={columns} rows={rows} loading={loading}
          page={page} pageSize={pageSize} total={total} onPageChange={setPage}
          emptyTitle="No audit entries match this filter."
        />
      </div>

      <Modal open={Boolean(viewing)} onClose={() => setViewing(null)} title={viewing?.action} size="lg">
        {viewing && (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <p className="field-label">Old Value</p>
              <pre className="max-h-72 overflow-auto rounded bg-surface-subtle p-2 text-xs">{JSON.stringify(viewing.oldValue, null, 2) ?? '—'}</pre>
            </div>
            <div>
              <p className="field-label">New Value</p>
              <pre className="max-h-72 overflow-auto rounded bg-surface-subtle p-2 text-xs">{JSON.stringify(viewing.newValue, null, 2) ?? '—'}</pre>
            </div>
          </div>
        )}
      </Modal>
    </div>
  )
}
