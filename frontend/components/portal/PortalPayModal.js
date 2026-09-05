'use client'

import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { useToast } from '@/components/ui/Toast'
import { api, ApiError } from '@/lib/api'
import { formatMoney } from '@/lib/format'
import { useGuardedAction } from '@/lib/useGuardedAction'
import { useState } from 'react'

/** Always pays the full outstanding amount — "pay my dues" means settle in full. */
export function PortalPayModal({ open, onClose, doc, onPaid }) {
  const { push } = useToast()
  const [error, setError] = useState('')

  const [pay, paying] = useGuardedAction(async () => {
    setError('')
    try {
      await api.post(`/portal/documents/invoice/${doc.id}/pay`)
      push('Payment recorded', { type: 'success' })
      onPaid?.()
      onClose()
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not record payment')
    }
  })

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Pay Invoice"
      size="sm"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button variant="primary" onClick={pay} loading={paying}>Pay Now</Button>
        </>
      }
    >
      <p className="text-sm text-ink-muted">
        You are about to pay <span className="tabular font-semibold text-ink">{formatMoney(doc?.amountResidual)}</span> against
        {' '}<span className="font-medium text-ink">{doc?.number}</span> in full.
      </p>
      {error && <p className="mt-3 text-xs text-state-overdue">{error}</p>}
    </Modal>
  )
}
