import Link from 'next/link'

/** Bordered box, count above label — instantly recognisable as an ERP (UI.md §5.2). */
export function SmartButton({ value, label, href }) {
  const content = (
    <div className="smart-btn">
      <span className="smart-btn-value">{value}</span>
      <span className="smart-btn-label">{label}</span>
    </div>
  )
  return href ? <Link href={href}>{content}</Link> : content
}
