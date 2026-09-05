'use client'

import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'

/** Static field-explanation screen — what each Budget line column means. */
export function AmountToAchieveHelpModal({ open, onClose }) {
  return (
    <Modal open={open} onClose={onClose} title="Budget Line Fields" size="md" footer={<Button onClick={onClose}>Got it</Button>}>
      <dl className="space-y-4 text-sm">
        <div>
          <dt className="font-semibold text-ink">Committed Amount</dt>
          <dd className="mt-0.5 text-ink-muted">The amount approved for this Analytic Account for the budget period — set when the line is created.</dd>
        </div>
        <div>
          <dt className="font-semibold text-ink">Achieved Amount</dt>
          <dd className="mt-0.5 text-ink-muted">
            The real posted-ledger total for this Analytic Account within the budget's date range — Sales Invoices for an
            Income account, Vendor Bills/Purchase spend for an Expense account. It updates automatically as documents post;
            nothing here is entered by hand.
          </dd>
        </div>
        <div>
          <dt className="font-semibold text-ink">Achieved %</dt>
          <dd className="mt-0.5 text-ink-muted">Achieved Amount ÷ Committed Amount × 100.</dd>
        </div>
        <div>
          <dt className="font-semibold text-ink">Amount to Achieve</dt>
          <dd className="mt-0.5 text-ink-muted">
            Committed Amount − Achieved Amount — what's left of the plan. A negative value (shown in red) means this
            Analytic Account has already gone over its committed amount.
          </dd>
        </div>
      </dl>
    </Modal>
  )
}
