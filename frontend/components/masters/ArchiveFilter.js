'use client'

import { useState } from 'react'
import clsx from 'clsx'
import { ArchiveRestore } from 'lucide-react'
import { api, ApiError } from '@/lib/api'
import { useToast } from '@/components/ui/Toast'
import { useAuth, canModify } from '@/lib/auth'
import { useGuardedAction } from '@/lib/useGuardedAction'

const OPTIONS = [
  { value: 'active', label: 'Active' },
  { value: 'archived', label: 'Archived' },
  { value: 'all', label: 'All' },
]

/**
 * Active / Archived / All switch for a master list, plus bulk restore.
 *
 * Archived records are hidden by default now, so without this there would be
 * no way to reach them at all.
 */
export function ArchiveFilter({ value, onChange, apiPath, onRestored }) {
  const { push } = useToast()
  const { user } = useAuth()
  const [confirming, setConfirming] = useState(false)

  const [restoreAll, restoring] = useGuardedAction(async () => {
    try {
      const res = await api.post(`${apiPath}/unarchive-all`)
      push(
        res.restored > 0
          ? `Restored ${res.restored} archived record${res.restored === 1 ? '' : 's'}`
          : 'Nothing was archived',
        { type: 'success' },
      )
      onRestored?.()
    } catch (err) {
      push(err instanceof ApiError ? err.message : 'Could not restore', { type: 'error' })
    } finally {
      setConfirming(false)
    }
  })

  return (
    <div className="flex items-center gap-2">
      <div className="flex rounded-sm border border-line overflow-hidden">
        {OPTIONS.map((opt) => (
          <button
            key={opt.value}
            type="button"
            onClick={() => onChange(opt.value)}
            className={clsx(
              'h-7 px-3 text-xs font-medium border-r border-line last:border-r-0 transition-colors duration-150',
              value === opt.value
                ? 'bg-brand-light text-brand'
                : 'bg-surface-sheet text-ink-faint hover:bg-surface-hover',
            )}
          >
            {opt.label}
          </button>
        ))}
      </div>

      {value !== 'active' && canModify(user?.role) && (
        confirming ? (
          <span className="flex items-center gap-1.5 text-xs">
            <span className="text-ink-muted">Restore every archived record?</span>
            <button onClick={restoreAll} disabled={restoring} className="btn-primary btn-sm">
              {restoring ? 'Restoring…' : 'Yes, restore'}
            </button>
            <button onClick={() => setConfirming(false)} className="btn-ghost btn-sm">Cancel</button>
          </span>
        ) : (
          <button onClick={() => setConfirming(true)} className="btn-secondary btn-sm">
            <ArchiveRestore size={13} /> Unarchive all
          </button>
        )
      )}
    </div>
  )
}
