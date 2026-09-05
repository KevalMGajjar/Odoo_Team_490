'use client'

import { useParams } from 'next/navigation'
import { ControlPanel } from '@/components/layout/ControlPanel'
import { FormSheet, FormGrid, FormSection } from '@/components/layout/FormSheet'
import { FormField, TextInput } from '@/components/ui/FormField'
import { LineItemGrid } from '@/components/documents/LineItemGrid'
import { StatusBadge } from '@/components/ui/StatusBadge'
import { Skeleton } from '@/components/ui/Skeleton'
import { useApiGet } from '@/lib/useApi'
import { formatDate, formatMoney } from '@/lib/format'

/**
 * A restricted, real view — not an internal screen with a different label.
 * No ledger detail (no DebitCreditGrid, no journal-entry links): a customer
 * sees their own document, not the double-entry behind it.
 */
export default function PortalDocumentDetailPage() {
  const { kind, id } = useParams()
  const { data: doc, loading, error } = useApiGet(`/portal/documents/${kind}/${id}`)

  if (loading) {
    return (
      <div className="flex h-full flex-col">
        <ControlPanel breadcrumb="Portal" title="Loading…" />
        <div className="p-6"><div className="form-sheet"><Skeleton className="h-64" /></div></div>
      </div>
    )
  }
  if (error || !doc) {
    return (
      <div className="flex h-full flex-col">
        <ControlPanel breadcrumb="Portal" title="Not found" />
        <div className="p-6"><p className="text-sm text-state-overdue">Document not found.</p></div>
      </div>
    )
  }

  const partner = doc.customer ?? doc.vendor
  const date = doc.invoiceDate ?? doc.billDate
  const lines = doc.lines.map((l) => ({ ...l, product: l.product }))

  return (
    <div className="flex h-full flex-col">
      <ControlPanel breadcrumb="Portal" title={doc.number} />
      <div className="flex-1 overflow-y-auto p-4 sm:p-6">
        <FormSheet className="max-w-[900px]">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <p className="text-xl font-semibold text-ink">{doc.number}</p>
            <StatusBadge status={doc.settleState} />
          </div>

          <FormSection>
            <FormGrid>
              <FormField label={kind === 'invoice' ? 'Billed To' : 'From'}><TextInput value={partner?.name ?? ''} disabled /></FormField>
              <FormField label="Date"><TextInput value={formatDate(date)} disabled /></FormField>
              <FormField label="Due Date"><TextInput value={doc.dueDate ? formatDate(doc.dueDate) : '—'} disabled /></FormField>
              <FormField label="Outstanding"><TextInput value={formatMoney(doc.amountResidual)} disabled /></FormField>
            </FormGrid>
          </FormSection>

          <FormSection title="Lines">
            <LineItemGrid lines={lines} onChange={() => {}} disabled />
          </FormSection>
        </FormSheet>
      </div>
    </div>
  )
}
