'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { ControlPanel } from '@/components/layout/ControlPanel'
import { FormSheet, FormGrid, FormSection } from '@/components/layout/FormSheet'
import { FormField, TextInput, Select } from '@/components/ui/FormField'
import { Button } from '@/components/ui/Button'
import { VoucherLines, blankLine } from './VoucherLines'
import { api, ApiError } from '@/lib/api'
import { useToast } from '@/components/ui/Toast'
import { toDateInput } from '@/lib/format'
import { useGuardedAction } from '@/lib/useGuardedAction'

const META = {
  BReceipt: { label: 'Bank Receipt', group: 'Bank', direction: 'Credit to party, Debit to bank' },
  BPayment: { label: 'Bank Payment', group: 'Bank', direction: 'Debit to party, Credit from bank' },
  CReceipt: { label: 'Cash Receipt', group: 'Cash', direction: 'Credit to party, Debit to cash' },
  CPayment: { label: 'Cash Payment', group: 'Cash', direction: 'Debit to party, Credit from cash' },
}

/** Shared by all four receipt/payment voucher screens — only voucherType differs. */
export function ReceiptPaymentVoucherForm({ voucherType }) {
  const meta = META[voucherType]
  const router = useRouter()
  const { push } = useToast()

  const [date, setDate] = useState(toDateInput(new Date()))
  const [cashBank, setCashBank] = useState(null)
  const [cashBankOptions, setCashBankOptions] = useState([])
  const [voucherNo, setVoucherNo] = useState(null)
  const [lines, setLines] = useState([blankLine()])
  const [reference, setReference] = useState('')
  const [narration, setNarration] = useState('')
  const [error, setError] = useState('')

  // load the filtered cash/bank accounts + the remembered default, and peek the next number
  useEffect(() => {
    let cancelled = false
    api.get('/vouchers/cash-bank-accounts', { voucherType }).then((res) => {
      if (cancelled) return
      setCashBankOptions(res.accounts)
      if (res.lastUsed) setCashBank(res.lastUsed)
    })
    api.get('/vouchers/next-number', { voucherType, date }).then((res) => {
      if (!cancelled) setVoucherNo(res)
    })
    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [voucherType])

  const total = lines.reduce((s, l) => s + (Number(l.amount) || 0), 0)
  const canSubmit = cashBank && lines.every((l) => l.accountId && Number(l.amount) > 0) && total > 0

  const [submit, saving] = useGuardedAction(async (e) => {
    e.preventDefault()
    setError('')
    if (!canSubmit) return
    try {
      const posted = await api.post('/vouchers', {
        voucherType,
        date,
        cashBankAccountId: cashBank.id,
        lines: lines.map((l) => ({
          accountId: l.accountId,
          amount: Number(l.amount),
          partnerId: l.partnerId || undefined,
        })),
        reference: reference || undefined,
        narration: narration || undefined,
      })
      push(`${meta.label} #${posted.voucherNo} posted`, { type: 'success' })
      router.push(`/journal-entries/${posted.id}`)
    } catch (err) {
      setError(err instanceof ApiError ? err.message : `Could not post ${meta.label.toLowerCase()}`)
    }
  })

  return (
    <div className="flex h-full flex-col">
      <ControlPanel breadcrumb={meta.group} title={meta.label} />
      <form onSubmit={submit} className="flex-1 overflow-y-auto p-4 sm:p-6">
        <FormSheet className="max-w-[900px]">
          <div className="mb-4 flex items-center justify-between">
            <div>
              <p className="text-xl font-semibold text-ink">{meta.label}</p>
              <p className="text-xs text-ink-muted">{meta.direction}</p>
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
              <FormField label={meta.group === 'Bank' ? 'Bank Account' : 'Cash Account'} required hint="Remembers the last account you used">
                <Select
                  value={cashBank?.id ?? ''}
                  onChange={(e) => setCashBank(cashBankOptions.find((o) => o.id === e.target.value) ?? null)}
                >
                  <option value="" disabled>
                    {cashBankOptions.length ? 'Select account' : 'Loading…'}
                  </option>
                  {cashBankOptions.map((o) => (
                    <option key={o.id} value={o.id}>{o.code} — {o.name}</option>
                  ))}
                </Select>
              </FormField>
              <FormField label="Date" required>
                <TextInput type="date" value={date} onChange={(e) => setDate(e.target.value)} required />
              </FormField>
              <FormField label="Reference">
                <TextInput value={reference} onChange={(e) => setReference(e.target.value)} placeholder="e.g. NEFT ref / cheque no." />
              </FormField>
              <FormField label="Narration">
                <TextInput value={narration} onChange={(e) => setNarration(e.target.value)} />
              </FormField>
            </FormGrid>
          </FormSection>

          <FormSection title="Party">
            <VoucherLines lines={lines} onChange={setLines} />
          </FormSection>

          {error && <p className="mt-3 rounded-sm bg-state-overdue/10 px-2 py-1.5 text-xs text-state-overdue">{error}</p>}

          <div className="mt-5 flex items-center justify-end gap-2 border-t border-line pt-4">
            <Button type="button" variant="ghost" onClick={() => router.back()}>Cancel</Button>
            <Button type="submit" variant="primary" loading={saving} disabled={!canSubmit}>
              Post {meta.label}
            </Button>
          </div>
        </FormSheet>
      </form>
    </div>
  )
}
