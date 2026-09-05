import Link from 'next/link'
import clsx from 'clsx'

/**
 * Every report figure is a drill-down link — teal, underline on hover
 * (UI.md §5.8). This is what makes a balance sheet number explainable.
 */
export function DrillDownLink({ href, children, className }) {
  return (
    <Link href={href} className={clsx('text-secondary hover:underline hover:text-secondary-hover', className)}>
      {children}
    </Link>
  )
}
