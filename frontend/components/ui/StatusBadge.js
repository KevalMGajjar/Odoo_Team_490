import clsx from 'clsx'

/**
 * 11px, 2px radius, tinted background at ~12% of the semantic colour with
 * solid text (UI.md §5.6). Semantic only — never a rainbow of statuses.
 */
const TONE = {
  draft: 'bg-[#8f8f8f1f] text-state-draft',
  posted: 'bg-brand-light text-brand',
  paid: 'bg-[#28a7451f] text-state-paid',
  partial: 'bg-[#f0ad4e1f] text-[#a06a1f]',
  not_paid: 'bg-[#d9534f1f] text-state-overdue',
  overdue: 'bg-[#d9534f1f] text-state-overdue',
  confirmed: 'bg-[#17a2b81f] text-state-info',
  cancelled: 'bg-surface-subtle text-ink-faint line-through',
  active: 'bg-[#28a7451f] text-state-paid',
  archived: 'bg-surface-subtle text-ink-faint',
  info: 'bg-[#17a2b81f] text-state-info',
}

const LABEL = {
  not_paid: 'Unpaid',
  partial: 'Partial',
  paid: 'Paid',
  draft: 'Draft',
  posted: 'Posted',
  confirmed: 'Confirmed',
  cancelled: 'Cancelled',
  active: 'Active',
  archived: 'Archived',
}

export function StatusBadge({ status, children, className }) {
  const tone = TONE[status] ?? TONE.draft
  return (
    <span className={clsx('badge', tone, className)}>
      {children ?? LABEL[status] ?? status}
    </span>
  )
}
