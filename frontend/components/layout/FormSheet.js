import clsx from 'clsx'

/**
 * White card, max-width 1100px, centred, 1px border, one shadow token
 * (UI.md §5.3). Fields go in a two-column grid; pass a `Notebook` as
 * children for line items.
 */
export function FormSheet({ children, className }) {
  return <div className={clsx('form-sheet', className)}>{children}</div>
}

export function FormGrid({ children }) {
  return <div className="grid grid-cols-1 gap-x-6 gap-y-4 sm:grid-cols-2">{children}</div>
}

export function FormSection({ title, children }) {
  return (
    <div className="mb-6 last:mb-0">
      {title && <p className="text-md font-semibold text-ink mb-3">{title}</p>}
      {children}
    </div>
  )
}
