import clsx from 'clsx'

/** Skeleton rows on list load — never a centred spinner (UI.md §6). */
export function Skeleton({ className }) {
  return <div className={clsx('animate-pulse rounded bg-surface-subtle', className)} />
}

export function TableSkeleton({ rows = 6, cols = 5 }) {
  return (
    <div className="w-full">
      {Array.from({ length: rows }).map((_, r) => (
        <div key={r} className="flex items-center gap-4 border-b border-line px-3" style={{ height: 32 }}>
          {Array.from({ length: cols }).map((__, c) => (
            <Skeleton key={c} className="h-3" style={{ width: c === 0 ? '18%' : `${100 / cols}%` }} />
          ))}
        </div>
      ))}
    </div>
  )
}
