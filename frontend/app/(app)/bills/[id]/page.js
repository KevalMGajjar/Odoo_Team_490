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

export default function BillDetailPage() {
  const { id } = useParams()
  const { user } = useAuth()
  const { push } = useToast()
  const { data: bill, loading, error, reload } = useApiGet(`/bills/${id}`)
  const [payOpen, setPayOpen] = useState(false)

  const [postBill, posting] = useGuardedAction(async () => {
    try {
      await api.post(`/bills/${id}/post`)
      push('Bill posted — stock received, ledger updated', { type: 'success' })
      reload()
    } catch (err) {
      push(err instanceof ApiError ? err.message : 'Could not post bill', { type: 'error' })
    }
  })

  if (loading) {
    return (
      <div className="flex h-full flex-col">
        <ControlPanel breadcrumb="Purchase" title="Loading…" />
        <div className="p-6"><div className="form-sheet"><Skeleton className="h-64" /></div></div>
      </div>
    )
  }
  if (error || !bill) {
    return (
      <div className="flex h-full flex-col">
        <ControlPanel breadcrumb="Purchase" title="Not found" />
        <div className="p-6"><p className="text-sm text-state-overdue">Bill not found.</p></div>
      </div>
    )
  }

  const lines = bill.lines.map((l) => ({ ...l, product: l.product }))

  return (
    <div className="flex h-full flex-col">
      <ControlPanel
        breadcrumb="Purchase"
        title={bill.number}
        actions={
          <>
            <Statusbar stages={STAGES} current={bill.state} />
            {canWrite(user?.role) && bill.state === 'draft' && (
              <Button variant="primary" size="sm" onClick={postBill} loading={posting}>Post</Button>
            )}
            {canWrite(user?.role) && bill.state === 'posted' && bill.settleState !== 'paid' && (
              <Button variant="primary" size="sm" onClick={() => setPayOpen(true)}>Register Payment</Button>
            )}
          </>
        }
      />

      <div className="flex-1 overflow-y-auto p-4 sm:p-6">
        <FormSheet className="max-w-[1100px]">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <p className="text-xl font-semibold text-ink">Vendor Bill No. {bill.number}</p>
            <div className="flex items-center gap-2">
              <StatusBadge status={bill.settleState} />
              <div className="flex gap-2">
                {bill.purchaseOrder && <SmartButton value={bill.purchaseOrder.number} label="PO" href={`/purchase-orders/${bill.purchaseOrder.id}`} />}
                <SmartButton value="View" label="Budget" href="/reports/budget" />
                {bill.state === 'posted' && (
                  <>
                    <SmartButton value={bill.allocations?.length ?? 0} label="Payments" />
                    {bill.journalEntry && <SmartButton value={formatMoney(bill.total)} label="Journal" href={`/journal-entries/${bill.journalEntry.id}`} />}
                    <SmartButton value={bill.stockMoves?.length ?? 0} label="Stock Moves" />
                  </>
                )}
              </div>
            </div>
          </div>

          <FormSection>
            <FormGrid>
              <FormField label="Vendor"><TextInput value={bill.vendor?.name ?? ''} disabled /></FormField>
              <FormField label="Bill Reference"><TextInput value={bill.reference ?? '—'} disabled /></FormField>
              <FormField label="Bill Date"><TextInput value={formatDate(bill.billDate)} disabled /></FormField>
              <FormField label="Due Date"><TextInput value={bill.dueDate ? formatDate(bill.dueDate) : '—'} disabled /></FormField>
              <FormField label="Residual"><TextInput value={formatMoney(bill.amountResidual)} disabled /></FormField>
            </FormGrid>
          </FormSection>

          <FormSection title="Bill Lines">
            <LineItemGrid lines={lines} onChange={() => {}} disabled />
          </FormSection>

          {bill.journalEntry && (
            <FormSection title="Journal Entry">
              <DebitCreditGrid
                items={bill.journalEntry.items.map((i) => ({ ...i, account: i.account }))}
                onChange={() => {}}
                disabled
              />
            </FormSection>
          )}
        </FormSheet>
      </div>

      <RegisterPaymentModal open={payOpen} onClose={() => setPayOpen(false)} kind="bill" doc={bill} onPosted={reload} />
    </div>
  )
}
