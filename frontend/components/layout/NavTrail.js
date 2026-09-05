'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { ChevronRight, X } from 'lucide-react'
import { useNavHistory } from '@/lib/navHistory'

/**
 * The visited-page trail. Hidden until there's somewhere to go back to, so it
 * costs no vertical space on a fresh session, and hidden in print.
 */
export function NavTrail() {
  const { trail, clear } = useNavHistory()
  const pathname = usePathname()

  if (trail.length < 2) return null

  return (
    <nav
      aria-label="Recently visited"
      className="flex items-center gap-1 overflow-x-auto border-b border-line bg-surface-subtle px-4 py-1.5 print:hidden"
    >
      {trail.map((entry, i) => {
        const isCurrent = entry.path === pathname
        return (
          <span key={`${entry.path}-${i}`} className="flex shrink-0 items-center gap-1">
            {i > 0 && <ChevronRight size={12} className="text-ink-faint" />}
            {isCurrent ? (
              <span className="max-w-[220px] truncate text-xs font-medium text-ink">{entry.label}</span>
            ) : (
              <Link
                href={entry.path}
                className="max-w-[220px] truncate rounded-sm px-1.5 py-0.5 text-xs text-ink-muted hover:bg-surface-hover hover:text-secondary"
              >
                {entry.label}
              </Link>
            )}
          </span>
        )
      })}
      <button
        onClick={clear}
        title="Clear trail"
        className="ml-auto shrink-0 rounded p-1 text-ink-faint hover:bg-surface-hover hover:text-ink"
      >
        <X size={12} />
      </button>
    </nav>
  )
}
