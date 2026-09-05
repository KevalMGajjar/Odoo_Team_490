/**
 * Formatting helpers. The backend sends every monetary value as an exact
 * decimal STRING (PLAN.md §9) — these functions are display-only and never
 * feed a recomputed total back into a request.
 */

/** ₹1,23,456.78 — Indian digit grouping, always 2dp, never a float round-trip. */
export function formatMoney(value, { symbol = '₹', signed = false } = {}) {
  if (value === null || value === undefined || value === '') return `${symbol}0.00`
  const n = Number(value)
  if (Number.isNaN(n)) return `${symbol}0.00`

  const neg = n < 0
  const abs = Math.abs(n).toFixed(2)
  const [intPart, decPart] = abs.split('.')

  // Indian grouping: last 3 digits, then groups of 2.
  let grouped = intPart
  if (intPart.length > 3) {
    const last3 = intPart.slice(-3)
    const rest = intPart.slice(0, -3)
    grouped = rest.replace(/\B(?=(\d{2})+(?!\d))/g, ',') + ',' + last3
  }

  const sign = neg ? '-' : signed ? '+' : ''
  return `${sign}${symbol}${grouped}.${decPart}`
}

/** Plain number with Indian grouping, no currency symbol (quantities). */
export function formatNumber(value, dp = 0) {
  if (value === null || value === undefined || value === '') return '0'
  const n = Number(value)
  if (Number.isNaN(n)) return '0'
  const fixed = n.toFixed(dp)
  const [intPart, decPart] = fixed.split('.')
  let grouped = intPart
  if (intPart.length > 3) {
    const last3 = intPart.slice(-3)
    const rest = intPart.slice(0, -3)
    grouped = rest.replace(/\B(?=(\d{2})+(?!\d))/g, ',') + ',' + last3
  }
  return decPart ? `${grouped}.${decPart}` : grouped
}

export function formatPercent(value, dp = 1) {
  if (value === null || value === undefined) return '—'
  return `${Number(value).toFixed(dp)}%`
}

/** 05 Sep 2026 — compact, unambiguous, no locale surprises. */
export function formatDate(value) {
  if (!value) return '—'
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return '—'
  const day = String(d.getUTCDate()).padStart(2, '0')
  const month = d.toLocaleString('en-US', { month: 'short', timeZone: 'UTC' })
  return `${day} ${month} ${d.getUTCFullYear()}`
}

/** For <input type="date"> value props. */
export function toDateInput(value) {
  if (!value) return ''
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return ''
  return d.toISOString().slice(0, 10)
}

export function formatDateTime(value) {
  if (!value) return '—'
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return '—'
  return `${formatDate(value)}, ${String(d.getUTCHours()).padStart(2, '0')}:${String(d.getUTCMinutes()).padStart(2, '0')}`
}

/**
 * "3 days overdue" / "due in 5 days" — used on invoice/bill worklists.
 *
 * Pass `settleState` when known: a fully paid document is never "overdue" —
 * it may have been paid late, but there is nothing outstanding to chase, so
 * showing red urgency styling on it is actively misleading, not just cosmetic.
 */
export function relativeDue(dueDate, settleState) {
  if (!dueDate) return null
  if (settleState === 'paid') return null
  const due = new Date(dueDate)
  const today = new Date()
  const diffDays = Math.round((due.setUTCHours(0, 0, 0, 0) - today.setUTCHours(0, 0, 0, 0)) / 86400000)
  if (diffDays === 0) return 'due today'
  if (diffDays > 0) return `due in ${diffDays}d`
  return `${Math.abs(diffDays)}d overdue`
}
