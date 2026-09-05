import clsx from 'clsx'

/**
 * Connected chevron pills showing a document's lifecycle (UI.md §5.1).
 * Current stage filled with brand; future stages outlined muted.
 */
export function Statusbar({ stages, current }) {
  const currentIdx = stages.findIndex((s) => s.value === current)

  return (
    <div className="flex items-center">
      {stages.map((stage, i) => {
        const done = i < currentIdx
        const active = i === currentIdx
        return (
          <div key={stage.value} className="flex items-center">
            {i > 0 && <span className="mx-1 text-ink-faint">›</span>}
            <span
              className={clsx(
                'rounded-sm px-2.5 py-1 text-xs font-medium',
                active && 'bg-brand text-ink-invert',
                done && !active && 'text-ink-muted',
                !done && !active && 'border border-line text-ink-faint',
              )}
            >
              {stage.label}
            </span>
          </div>
        )
      })}
    </div>
  )
}
