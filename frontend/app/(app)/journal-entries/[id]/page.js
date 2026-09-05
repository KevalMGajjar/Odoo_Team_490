'use client'

import { useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { Undo2, RotateCcw } from 'lucide-react'
import { ControlPanel } from '@/components/layout/ControlPanel'
import { FormSheet, FormGrid, FormSection } from '@/components/layout/FormSheet'
import { FormField, TextInput } from '@/components/ui/FormField'
import { DebitCreditGrid } from '@/components/documents/DebitCreditGrid'
import { Skeleton } from '@/components/ui/Skeleton'
import { Button } from '@/components/ui/Button'
import { StatusBadge } from '@/components/ui/StatusBadge'
import { ConfirmDialog } from '@/components/ui/Modal'
import { useApiGet } from '@/lib/useApi'
import { useAuth, canWrite } from '@/lib/auth'
import { api, ApiError } from '@/lib/api'
import { useToast } from '@/components/ui/Toast'
import { toDateInput } from '@/lib/format'
import { useGuardedAction } from '@/lib/useGuardedAction'

export default function JournalEntryDetailPage() {
  const { id } = useParams()
  const router = useRouter()
  const { user } = useAuth()
  const { push } = useToast()
  const { data: entry, loading, error, reload } = useApiGet(`/journal-entries/${id}`)
  const [confirmReverse, setConfirmReverse] = useState(false)
  const [reversing, setReversing] = useState(false)

  const reverse = async () => {
    setReversing(true)
    try {
      const rev = await api.post(`/journal-entries/${id}/reverse`, {})
      push(`Reversed as ${rev.number}`, { type: 'success' })
      router.push(`/journal-entries/${rev.id}`)
    } catch (err) {
      push(err instanceof ApiError ? err.message : 'Could not reverse', { type: 'error' })
    } finally {
      setReversing(false)
      setConfirmReverse(false)
    }
  }

  const [postDraft, posting] = useGuardedAction(async () => {
    try {
      await api.post(`/journal-entries/${id}/post`)
      push('Entry posted', { type: 'success' })
      reload()
    } catch (err) {
      push(err instanceof ApiError ? err.message : 'Could not post', { type: 'error' })
    }
  })

  const [resetToDraft, resetting] = useGuardedAction(async () => {
    try {
      await api.post(`/journal-entries/${id}/reset-to-draft`)
      push('Entry reset to draft', { type: 'success' })
      reload()
    } catch (err) {
      push(err instanceof ApiError ? err.message : 'Could not reset to draft', { type: 'error' })
    }
  })

  if (loading) {
    return (
      <div className="flex h-full flex-col">
        <ControlPanel breadcrumb="Account" title="Loading…" />
        <div className="p-6"><div className="form-sheet"><Skeleton className="h-64" /></div></div>
      </div>
    )
  }

  if (error || !entry) {
    return (
      <div className="flex h-full flex-col">
        <ControlPanel breadcrumb="Account" title="Not found" />
        <div className="p-6">
          <p className="text-sm text-state-overdue">Journal entry not found.</p>
        </div>
      </div>
    )
  }

  const items = entry.items.map((i) => ({
    ...i,
    account: i.account,
    partner: i.partner,
    analyticAccount: i.analyticAccount,
  }))

  const sourceDoc = entry.bill
    ? { label: 'Vendor Bill', href: `/bills/${entry.bill.id}`, number: entry.bill.number }
    : entry.invoice
      ? { label: 'Customer Invoice', href: `/invoices/${entry.invoice.id}`, number: entry.invoice.number }
      : entry.payment
        ? { label: 'Payment', href: `/payments-made/${entry.payment.id}`, number: entry.payment.number }
        : null

  return (
    <div className="flex h-full flex-col">
      <ControlPanel
        breadcrumb="Account"
        title={entry.voucherType ? `${entry.voucherType} #${entry.voucherNo}` : entry.number}
        actions={
          <>
            <StatusBadge status={entry.state} />
            {canWrite(user?.role) && entry.state === 'draft' && (
              <Button variant="primary" size="sm" onClick={postDraft} loading={posting}>Post</Button>
            )}
            {canWrite(user?.role) && entry.state === 'posted' && entry.kind === 'standard' && !entry.reversedBy && (
              <Button variant="secondary" size="sm" icon={RotateCcw} onClick={resetToDraft} loading={resetting}>Reset to Draft</Button>
            )}
            {user?.role === 'admin' && entry.state === 'posted' && !entry.reversedBy && (
              <Button variant="danger" size="sm" icon={Undo2} onClick={() => setConfirmReverse(true)}>
                Reverse
              </Button>
            )}
          </>
        }
      />
      <div className="flex-1 overflow-y-auto p-4 sm:p-6">
        <FormSheet className="max-w-[1100px]">
          <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-xl font-semibold text-ink">{entry.number}</p>
              <p className="text-xs text-ink-muted">{entry.journal?.name}</p>
            </div>
            <div className="flex items-center gap-2 text-xs">
              {entry.reversalOf && (
                <Link href={`/journal-entries/${entry.reversalOf.id}`} className="rounded-sm bg-surface-subtle px-2 py-1 text-ink-muted hover:underline">
                  Reverses {entry.reversalOf.number}
                </Link>
              )}
              {entry.reversedBy && (
                <Link href={`/journal-entries/${entry.reversedBy.id}`} className="rounded-sm bg-state-overdue/10 px-2 py-1 text-state-overdue hover:underline">
                  Reversed by {entry.reversedBy.number}
                </Link>
              )}
              {sourceDoc && (
                <Link href={sourceDoc.href} className="rounded-sm bg-brand-light px-2 py-1 text-brand hover:underline">
                  {sourceDoc.label}: {sourceDoc.number}
                </Link>
              )}
            </div>
          </div>

          <FormSection>
            <FormGrid>
              <FormField label="Accounting Date">
                <TextInput value={toDateInput(entry.date)} disabled />
              </FormField>
              <FormField label="Reference">
                <TextInput value={entry.reference || '—'} disabled />
              </FormField>
              <FormField label="Narration" className="sm:col-span-2">
                <TextInput value={entry.narration || '—'} disabled />
              </FormField>
            </FormGrid>
          </FormSection>

          <FormSection title="Journal Items">
            <DebitCreditGrid items={items} onChange={() => {}} disabled />
          </FormSection>
        </FormSheet>
      </div>

      <ConfirmDialog
        open={confirmReverse}
        onClose={() => setConfirmReverse(false)}
        onConfirm={reverse}
        title="Reverse this entry?"
        consequence={`This posts a new mirrored entry (debit ↔ credit swapped) dated today. ${entry.number} itself is never edited or deleted — it stays in the audit trail exactly as posted.`}
        confirmLabel="Post Reversal"
        danger
        loading={reversing}
      />
    </div>
  )
}
