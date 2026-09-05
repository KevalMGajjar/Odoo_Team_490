'use client'

import { ArrowRight } from 'lucide-react'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { StatusBadge } from '@/components/ui/StatusBadge'

const STAGES = [
  { value: 'draft', desc: 'Being drafted — lines can still be edited.' },
  { value: 'confirmed', desc: 'Approved — this is the live plan checked against every Purchase/Sales/Bill/Invoice.' },
  { value: 'revised', desc: 'Superseded by a follow-up budget — frozen, kept for history.' },
  { value: 'cancelled', desc: 'Retired — no longer in effect.' },
]

/**
 * Opened by the "Revise" button — doubles as the stage-mapping reference and
 * the actual confirmation for the action: Confirmed -> Revised (frozen), and
 * a new Draft budget is created with the same lines, linked back to this one.
 */
export function ReviseBudgetModal({ open, onClose, budget, onConfirm, loading }) {
  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Revise Budget"
      size="md"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button variant="primary" onClick={onConfirm} loading={loading}>Confirm Revise</Button>
        </>
      }
    >
      <p className="mb-4 text-sm text-ink-muted">
        Revising <span className="font-medium text-ink">{budget?.name}</span> freezes it and creates a new draft budget,
        <span className="font-medium text-ink"> {budget?.name} Revised</span>, with the same lines — ready for you to
        adjust and confirm.
      </p>

      <div className="mb-4 flex items-center gap-2 rounded border border-line bg-surface-subtle px-3 py-2 text-sm">
        <StatusBadge status="confirmed" />
        <ArrowRight size={14} className="text-ink-faint" />
        <StatusBadge status="revised" />
        <span className="text-ink-faint">+</span>
        <StatusBadge status="draft" />
        <span className="text-ink-faint text-xs">(new, linked)</span>
      </div>

      <p className="mb-2 text-xs font-semibold uppercase text-ink-muted">Stage reference</p>
      <dl className="space-y-2 text-sm">
        {STAGES.map((s) => (
          <div key={s.value} className="flex items-start gap-2">
            <StatusBadge status={s.value} className="mt-0.5 shrink-0" />
            <dd className="text-ink-muted">{s.desc}</dd>
          </div>
        ))}
      </dl>
    </Modal>
  )
}
