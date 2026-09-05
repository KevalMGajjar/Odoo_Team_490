'use client'

import { useParams } from 'next/navigation'
import { ControlPanel } from '@/components/layout/ControlPanel'
import { FormSheet, FormGrid, FormSection } from '@/components/layout/FormSheet'
import { FormField, TextInput } from '@/components/ui/FormField'
import { DebitCreditGrid } from '@/components/documents/DebitCreditGrid'
import { SmartButton } from '@/components/documents/SmartButton'
import { Skeleton } from '@/components/ui/Skeleton'
import { useApiGet } from '@/lib/useApi'
import { formatDate, formatMoney } from '@/lib/format'

export function PaymentDetail({ breadcrumb }) {
  const { id } = useParams()
  const { data: payment, loading, error } = useApiGet(`/payments/${id}`)

  if (loading) {
    return (
      <div className="flex h-full flex-col">
        <ControlPanel breadcrumb={breadcrumb} title="Loading…" />
        <div className="p-6"><div className="form-sheet"><Skeleton className="h-56" /></div></div>
      </div>
    )
  }
  if (error || !payment) {
    return (
      <div className="flex h-full flex-col">
        <ControlPanel breadcrumb={breadcrumb} title="Not found" />
        <div className="p-6"><p className="text-sm text-state-overdue">Payment not found.</p></div>
      </div>
    )
  }

  const doc = payment.allocations?.find((a) => a.invoice || a.bill)
  const source = doc?.invoice
    ? { label: 'Invoice', href: `/invoices/${doc.invoice.id}`, number: doc.invoice.number }
    : doc?.bill
      ? { label: 'Bill', href: `/bills/${doc.bill.id}`, number: doc.bill.number }
      : null

  return (
    <div className="flex h-full flex-col">
      <ControlPanel breadcrumb={breadcrumb} title={payment.number} />
      <div className="flex-1 overflow-y-auto p-4 sm:p-6">
        <FormSheet className="max-w-[1100px]">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <p className="text-xl font-semibold text-ink">{payment.number}</p>
            {payment.journalEntry && <SmartButton value={formatMoney(payment.amount)} label="Journal Entry" href={`/journal-entries/${payment.journalEntry.id}`} />}
          </div>

          <FormSection>
            <FormGrid>
              <FormField label={payment.direction === 'inbound' ? 'Received From' : 'Paid To'}>
                <TextInput value={payment.partner?.name ?? ''} disabled />
              </FormField>
              <FormField label="Date"><TextInput value={formatDate(payment.paymentDate)} disabled /></FormField>
              <FormField label="Via Journal"><TextInput value={payment.journal?.name ?? ''} disabled /></FormField>
              <FormField label="Amount"><TextInput value={formatMoney(payment.amount)} disabled /></FormField>
              {source && (
                <FormField label="Against">
                  <a href={source.href} className="field-input flex items-center text-secondary hover:underline">{source.label}: {source.number}</a>
                </FormField>
              )}
            </FormGrid>
          </FormSection>

          {payment.journalEntry && (
            <FormSection title="Journal Entry">
              <DebitCreditGrid items={payment.journalEntry.items.map((i) => ({ ...i, account: i.account }))} onChange={() => {}} disabled />
            </FormSection>
          )}
        </FormSheet>
      </div>
    </div>
  )
}
