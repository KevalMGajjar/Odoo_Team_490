import { Button } from './Button'

/**
 * One line of muted text + a small primary button, left-aligned — not a big
 * centred illustration (UI.md §1's anti-brief). ERP users want to act, not
 * admire empty-state art.
 */
export function EmptyState({ title, action, onAction, icon: Icon }) {
  return (
    <div className="flex items-center gap-3 border border-dashed border-line rounded px-4 py-6">
      {Icon && <Icon size={18} className="text-ink-faint shrink-0" />}
      <p className="text-sm text-ink-muted flex-1">{title}</p>
      {action && (
        <Button variant="primary" size="sm" onClick={onAction}>
          {action}
        </Button>
      )}
    </div>
  )
}
