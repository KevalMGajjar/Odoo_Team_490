'use client'

import { useState } from 'react'
import { useParams } from 'next/navigation'
import { ControlPanel } from '@/components/layout/ControlPanel'
import { FormSheet, FormGrid, FormSection } from '@/components/layout/FormSheet'
import { FormField, TextInput } from '@/components/ui/FormField'
import { LineItemGrid } from '@/components/documents/LineItemGrid'
import { DebitCreditGrid } from '@/components/documents/DebitCreditGrid'
import { Statusbar } from '@/components/documents/Statusbar'
import { SmartButton } from '@/components/documents/SmartButton'
import { RegisterPaymentModal } from '@/components/documents/RegisterPaymentModal'
import { StatusBadge } from '@/components/ui/StatusBadge'
import { Skeleton } from '@/components/ui/Skeleton'
import { Button } from '@/components/ui/Button'
import { useApiGet } from '@/lib/useApi'
import { useAuth, canWrite } from '@/lib/auth'
import { api, ApiError } from '@/lib/api'
import { useToast } from '@/components/ui/Toast'
import { formatDate, formatMoney } from '@/lib/format'
import { useGuardedAction } from '@/lib/useGuardedAction'

const STAGES = [{ value: 'draft', label: 'Draft' }, { value: 'posted', label: 'Posted' }]

export default function InvoiceDetailPage() {
  const { id } = useParams()
  const { user } = useAuth()
  const { push } = useToast()
  const { data: invoice, loading, error, reload } = useApiGet(`/invoices/${id}`)
  const [payOpen, setPayOpen] = useState(false)

  const [postInvoice, posting] = useGuardedAction(async () => {
    try {
      await api.post(`/invoices/${id}/post`)
      push('Invoice posted — revenue and COGS entries created', { type: 'success' })
      reload()
    } catch (err) {
      push(err instanceof ApiError ? err.message : 'Could not post invoice', { type: 'error' })
    }
  })

  if (loading) {
    return (
      <div className="flex h-full flex-col">
        <ControlPanel breadcrumb="Sales" title="Loading…" />
        <div className="p-6"><div className="form-sheet"><Skeleton className="h-64" /></div></div>
      </div>
    )
  }
  if (error || !invoice) {
    return (
      <div className="flex h-full flex-col">
        <ControlPanel breadcrumb="Sales" title="Not found" />
        <div className="p-6"><p className="text-sm text-state-overdue">Invoice not found.</p></div>
      </div>
    )
  }

  const lines = invoice.lines.map((l) => ({ ...l, product: l.product }))
  const grossMargin = invoice.cogsEntry
    ? Number(invoice.untaxed) - invoice.cogsEntry.items.reduce((s, i) => s + Number(i.debit), 0)
    : null

  return (
    <div className="flex h-full flex-col">
      <ControlPanel
        breadcrumb="Sales"
        title={invoice.number}
        actions={
          <>
            <Statusbar stages={STAGES} current={invoice.state} />
            {canWrite(user?.role) && invoice.state === 'draft' && (
              <Button variant="primary" size="sm" onClick={postInvoice} loading={posting}>Post</Button>
            )}
            {canWrite(user?.role) && invoice.state === 'posted' && invoice.settleState !== 'paid' && (
              <Button variant="primary" size="sm" onClick={() => setPayOpen(true)}>Register Payment</Button>
            )}
          </>
        }
      />

      <div className="flex-1 overflow-y-auto p-4 sm:p-6">
        <FormSheet className="max-w-[1100px]">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <p className="text-xl font-semibold text-ink">{invoice.number}</p>
            <div className="flex items-center gap-2">
              <StatusBadge status={invoice.settleState} />
              {invoice.state === 'posted' && (
                <div className="flex gap-2">
                  <SmartButton value={invoice.allocations?.length ?? 0} label="Payments" />
                  {invoice.journalEntry && <SmartButton value={formatMoney(invoice.total)} label="Revenue" href={`/journal-entries/${invoice.journalEntry.id}`} />}
                  {invoice.cogsEntry && <SmartButton value={formatMoney(invoice.cogsEntry.items.reduce((s, i) => s + Number(i.debit), 0))} label="COGS" href={`/journal-entries/${invoice.cogsEntry.id}`} />}
                </div>
              )}
            </div>
          </div>

          <FormSection>
            <FormGrid>
              <FormField label="Customer"><TextInput value={invoice.customer?.name ?? ''} disabled /></FormField>
              <FormField label="Invoice Date"><TextInput value={formatDate(invoice.invoiceDate)} disabled /></FormField>
              <FormField label="Due Date"><TextInput value={invoice.dueDate ? formatDate(invoice.dueDate) : '—'} disabled /></FormField>
              <FormField label="Residual"><TextInput value={formatMoney(invoice.amountResidual)} disabled /></FormField>
            </FormGrid>
          </FormSection>

          <FormSection title="Invoice Lines">
            <LineItemGrid lines={lines} onChange={() => {}} disabled />
          </FormSection>

          {grossMargin !== null && (
            <FormSection>
              <div className="flex items-center gap-2 rounded border border-state-paid/30 bg-state-paid/5 px-4 py-2.5 text-sm">
                <span className="font-medium text-state-paid">Gross Margin</span>
                <span className="tabular font-semibold text-ink">{formatMoney(grossMargin)}</span>
                <span className="text-xs text-ink-faint">— real, computed from moving-average cost at delivery, not estimated</span>
              </div>
            </FormSection>
          )}

          {invoice.journalEntry && (
            <FormSection title="Revenue Entry">
              <DebitCreditGrid items={invoice.journalEntry.items.map((i) => ({ ...i, account: i.account }))} onChange={() => {}} disabled />
            </FormSection>
          )}

          {invoice.cogsEntry && (
            <FormSection title="Cost of Goods Sold Entry">
              <DebitCreditGrid items={invoice.cogsEntry.items.map((i) => ({ ...i, account: i.account }))} onChange={() => {}} disabled />
            </FormSection>
          )}
        </FormSheet>
      </div>

      <RegisterPaymentModal open={payOpen} onClose={() => setPayOpen(false)} kind="invoice" doc={invoice} onPosted={reload} />
    </div>
  )
}
