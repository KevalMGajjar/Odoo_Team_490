/**
 * The Urban Furniture mark: a sofa, in the brand plum.
 *
 * The same geometry is drawn by mobile/lib/widgets/app_logo.dart on a 24-unit
 * grid, so the two clients show the same shape rather than two interpretations
 * of one. If the coordinates below change, change them there too.
 *
 * `tile` wraps it in a rounded plum square for use as an app icon; without it
 * the mark is drawn in `currentColor` and inherits from its container.
 */
export function Logo({ size = 32, tile = true, className = '' }) {
  const mark = (
    <svg
      width={tile ? size * 0.62 : size}
      height={tile ? size * 0.62 : size}
      viewBox="0 0 24 24"
      fill={tile ? '#fff' : 'currentColor'}
      aria-hidden="true"
    >
      {/* back cushion */}
      <rect x="5" y="4.5" width="14" height="7.5" rx="2.6" />
      {/* arms */}
      <rect x="2.2" y="8.6" width="4.2" height="8.4" rx="2.1" />
      <rect x="17.6" y="8.6" width="4.2" height="8.4" rx="2.1" />
      {/* seat */}
      <rect x="5" y="11.4" width="14" height="5.6" rx="2" />
      {/* legs */}
      <rect x="5.4" y="16.6" width="2.2" height="2.9" rx="0.9" />
      <rect x="16.4" y="16.6" width="2.2" height="2.9" rx="0.9" />
    </svg>
  )

  if (!tile) return <span className={className}>{mark}</span>

  return (
    <span
      className={`inline-grid shrink-0 place-items-center bg-brand ${className}`}
      style={{ width: size, height: size, borderRadius: Math.round(size * 0.23) }}
    >
      {mark}
    </span>
  )
}
