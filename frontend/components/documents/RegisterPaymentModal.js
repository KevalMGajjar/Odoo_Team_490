'use client'

import { useEffect, useState } from 'react'
import { MoreVertical, Printer, Send } from 'lucide-react'
import { Modal } from '@/components/ui/Modal'
import { FormField, TextInput, Select, TextArea } from '@/components/ui/FormField'
import { Button } from '@/components/ui/Button'
import { Statusbar } from '@/components/documents/Statusbar'
import { api, ApiError } from '@/lib/api'
import { useToast } from '@/components/ui/Toast'
import { toDateInput, formatMoney } from '@/lib/format'
import { useGuardedAction } from '@/lib/useGuardedAction'

const PAY_STAGES = [
  { value: 'draft', label: 'Draft' },
  { value: 'confirm', label: 'Confirm' },
  { value: 'cancelled', label: 'Cancelled' },
]

/** Shared by Vendor Bill and Customer Invoice detail pages. */
export function RegisterPaymentModal({ open, onClose, kind, doc, onPosted }) {
  const { push } = useToast()
  const [journals, setJournals] = useState([])
  const [journalId, setJournalId] = useState('')
  const [date, setDate] = useState(toDateInput(new Date()))
  const [amount, setAmount] = useState('')
  const [note, setNote] = useState('')
  const [error, setError] = useState('')
  const [menuOpen, setMenuOpen] = useState(false)

  const partner = kind === 'invoice' ? doc?.customer : doc?.vendor
  const paymentType = kind === 'invoice' ? 'Receive' : 'Send'

  useEffect(() => {
    if (!open) return
    setError('')
    setNote('')
    setMenuOpen(false)
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
      const payment = await api.post(path, { journalId, paymentDate: date, amount: Number(amount), note: note || undefined })
      push('Payment recorded', { type: 'success' })
      onPosted?.(payment)
      onClose()
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not record payment')
    }
  })

  const doPrint = () => { setMenuOpen(false); window.print() }
  const doSend = () => { setMenuOpen(false); push('Sending is stubbed in this offline-first build — nothing leaves the machine.', { type: 'info' }) }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={`${kind === 'invoice' ? 'Invoice' : 'Bill'} Payment`}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button variant="primary" onClick={submit} loading={saving} disabled={!journalId || !Number(amount)}>Confirm</Button>
        </>
      }
    >
      <div className="mb-3 flex items-center justify-between">
        <Statusbar stages={PAY_STAGES} current="draft" />
        <div className="relative">
          <button
            type="button"
            onClick={() => setMenuOpen((v) => !v)}
            className="rounded p-1.5 text-ink-faint hover:bg-surface-hover hover:text-ink"
            aria-label="More actions"
          >
            <MoreVertical size={16} />
          </button>
          {menuOpen && (
            <div className="absolute right-0 z-10 mt-1 w-36 rounded border border-line bg-surface-sheet shadow-pop">
              <button type="button" onClick={doPrint} className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs text-ink hover:bg-surface-hover">
                <Printer size={12} /> Print
              </button>
              <button type="button" onClick={doSend} className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs text-ink hover:bg-surface-hover">
                <Send size={12} /> Send
              </button>
            </div>
          )}
        </div>
      </div>

      <form onSubmit={submit} className="space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <FormField label="Payment Type">
            <TextInput value={paymentType} disabled />
          </FormField>
          <FormField label="Partner">
            <TextInput value={partner?.name ?? ''} disabled />
          </FormField>
        </div>

        <p className="text-xs text-ink-muted">
          Outstanding: <span className="tabular font-medium text-ink">{formatMoney(doc?.amountResidual)}</span>
        </p>

        <div className="grid grid-cols-2 gap-3">
          <FormField label="Date" required>
            <TextInput type="date" value={date} onChange={(e) => setDate(e.target.value)} required />
          </FormField>
          <FormField label="Payment Via" required hint={journals.length === 0 ? 'No bank/cash journal configured' : undefined}>
            <Select value={journalId} onChange={(e) => setJournalId(e.target.value)}>
              {journals.map((j) => <option key={j.id} value={j.id}>{j.code} — {j.name}</option>)}
            </Select>
          </FormField>
        </div>

        <FormField label="Amount" required>
          <TextInput type="number" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} required />
        </FormField>

        <FormField label="Note">
          <TextArea rows={2} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Optional" />
        </FormField>

        {error && <p className="text-xs text-state-overdue">{error}</p>}
      </form>
    </Modal>
  )
}
