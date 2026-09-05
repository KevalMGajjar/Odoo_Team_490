'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { ControlPanel } from '@/components/layout/ControlPanel'
import { FormSheet, FormGrid, FormSection } from '@/components/layout/FormSheet'
import { FormField, TextInput } from '@/components/ui/FormField'
import { SearchSelect } from '@/components/ui/SearchSelect'
import { Button } from '@/components/ui/Button'
import { api, ApiError } from '@/lib/api'
import { useToast } from '@/components/ui/Toast'
import { toDateInput } from '@/lib/format'
import { useGuardedAction } from '@/lib/useGuardedAction'

/** Journal Voucher: debit the first account, credit the second — no filter, per spec. */
export function JournalVoucherForm() {
  const router = useRouter()
  const { push } = useToast()

  const [date, setDate] = useState(toDateInput(new Date()))
  const [debitAccount, setDebitAccount] = useState(null)
  const [creditAccount, setCreditAccount] = useState(null)
  const [amount, setAmount] = useState('')
  const [reference, setReference] = useState('')
  const [narration, setNarration] = useState('')
  const [voucherNo, setVoucherNo] = useState(null)
  const [error, setError] = useState('')

  useEffect(() => {
    api.get('/vouchers/next-number', { voucherType: 'Journal', date }).then(setVoucherNo)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const canSubmit = debitAccount && creditAccount && debitAccount.id !== creditAccount.id && Number(amount) > 0

  const [submit, saving] = useGuardedAction(async (e) => {
    e.preventDefault()
    setError('')
    if (!canSubmit) return
    try {
      const posted = await api.post('/vouchers', {
        voucherType: 'Journal',
        date,
        debitAccountId: debitAccount.id,
        creditAccountId: creditAccount.id,
        amount: Number(amount),
        reference: reference || undefined,
        narration: narration || undefined,
      })
      push(`Journal Voucher #${posted.voucherNo} posted`, { type: 'success' })
      router.push(`/journal-entries/${posted.id}`)
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not post journal voucher')
    }
  })

  return (
    <div className="flex h-full flex-col">
      <ControlPanel breadcrumb="Account" title="Journal Voucher" />
      <form onSubmit={submit} className="flex-1 overflow-y-auto p-4 sm:p-6">
        <FormSheet className="max-w-[720px]">
          <div className="mb-4 flex items-center justify-between">
            <div>
              <p className="text-xl font-semibold text-ink">Journal Voucher</p>
              <p className="text-xs text-ink-muted">Debit the first account, credit the second — either account, no filter.</p>
            </div>
            {voucherNo && (
              <span className="rounded-sm bg-brand-light px-2.5 py-1 text-sm font-medium tabular text-brand">
                #{voucherNo.voucherNo}
                <span className="ml-1 text-xs font-normal text-brand/70">FY {voucherNo.fiscalYearLabel}</span>
              </span>
            )}
          </div>

          <FormSection>
            <FormGrid>
              <FormField label="Debit Account" required>
                <SearchSelect
                  path="/accounts"
                  resolvedOption={debitAccount}
                  onChange={setDebitAccount}
                  getLabel={(o) => `${o.code} ${o.name}`}
                  placeholder="Select account"
                />
              </FormField>
              <FormField label="Credit Account" required>
                <SearchSelect
                  path="/accounts"
                  resolvedOption={creditAccount}
                  onChange={setCreditAccount}
                  getLabel={(o) => `${o.code} ${o.name}`}
                  placeholder="Select account"
                />
              </FormField>
              <FormField label="Amount" required>
                <TextInput type="number" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} required />
              </FormField>
              <FormField label="Date" required>
                <TextInput type="date" value={date} onChange={(e) => setDate(e.target.value)} required />
              </FormField>
              <FormField label="Reference">
                <TextInput value={reference} onChange={(e) => setReference(e.target.value)} />
              </FormField>
              <FormField label="Narration">
                <TextInput value={narration} onChange={(e) => setNarration(e.target.value)} />
              </FormField>
            </FormGrid>
          </FormSection>

          {debitAccount && creditAccount && debitAccount.id === creditAccount.id && (
            <p className="mt-3 text-xs text-state-overdue">Debit and credit accounts must be different.</p>
          )}
          {error && <p className="mt-3 rounded-sm bg-state-overdue/10 px-2 py-1.5 text-xs text-state-overdue">{error}</p>}

          <div className="mt-5 flex items-center justify-end gap-2 border-t border-line pt-4">
            <Button type="button" variant="ghost" onClick={() => router.back()}>Cancel</Button>
            <Button type="submit" variant="primary" loading={saving} disabled={!canSubmit}>Post Voucher</Button>
          </div>
        </FormSheet>
      </form>
    </div>
  )
}
