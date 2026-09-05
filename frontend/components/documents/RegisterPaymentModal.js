'use client'

import { useEffect, useState } from 'react'
import { Modal } from '@/components/ui/Modal'
import { FormField, TextInput, Select } from '@/components/ui/FormField'
import { Button } from '@/components/ui/Button'
import { api, ApiError } from '@/lib/api'
import { useToast } from '@/components/ui/Toast'
import { toDateInput, formatMoney } from '@/lib/format'
import { useGuardedAction } from '@/lib/useGuardedAction'

/** Shared by Vendor Bill and Customer Invoice detail pages. */
export function RegisterPaymentModal({ open, onClose, kind, doc, onPosted }) {
  const { push } = useToast()
  const [journals, setJournals] = useState([])
  const [journalId, setJournalId] = useState('')
  const [date, setDate] = useState(toDateInput(new Date()))
  const [amount, setAmount] = useState('')
  const [error, setError] = useState('')

  useEffect(() => {
    if (!open) return
    setError('')
    setAmount(doc?.amountResidual ?? '')
    setDate(toDateInput(new Date()))
    api.get('/journals', { pageSize: 100 }).then((res) => {
      const bankCash = res.rows.filter((j) => ['bank', 'cash'].includes(j.type))
      setJournals(bankCash)
      setJournalId(bankCash[0]?.id ?? '')
    })
  }, [open, doc])

  const [submit, saving] = useGuardedAction(async (e) => {
    e.preventDefault()
    setError('')
    try {
      const path = kind === 'invoice' ? `/invoices/${doc.id}/register-payment` : `/bills/${doc.id}/register-payment`
      const payment = await api.post(path, { journalId, paymentDate: date, amount: Number(amount) })
      push('Payment recorded', { type: 'success' })
      onPosted?.(payment)
      onClose()
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not record payment')
    }
  })

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={`Register ${kind === 'invoice' ? 'Receipt' : 'Payment'}`}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button variant="primary" onClick={submit} loading={saving} disabled={!journalId || !Number(amount)}>Record</Button>
        </>
      }
    >
      <form onSubmit={submit} className="space-y-3">
        <p className="text-xs text-ink-muted">
          Outstanding: <span className="tabular font-medium text-ink">{formatMoney(doc?.amountResidual)}</span>
        </p>
        <FormField label="Journal" required hint={journals.length === 0 ? 'No bank/cash journal configured' : undefined}>
          <Select value={journalId} onChange={(e) => setJournalId(e.target.value)}>
            {journals.map((j) => <option key={j.id} value={j.id}>{j.code} — {j.name}</option>)}
          </Select>
        </FormField>
        <FormField label="Date" required>
          <TextInput type="date" value={date} onChange={(e) => setDate(e.target.value)} required />
        </FormField>
        <FormField label="Amount" required>
          <TextInput type="number" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} required />
        </FormField>
        {error && <p className="text-xs text-state-overdue">{error}</p>}
      </form>
    </Modal>
  )
}
