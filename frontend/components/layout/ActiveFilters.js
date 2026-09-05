'use client'

import { useEffect, useState } from 'react'
import { useRouter, usePathname, useSearchParams } from 'next/navigation'
import { X } from 'lucide-react'
import { api } from '@/lib/api'

const LABELS = {
  settleState: { not_paid: 'Unpaid', partial: 'Partly paid', paid: 'Paid' },
  state: { draft: 'Draft', posted: 'Posted', confirmed: 'Confirmed', cancelled: 'Cancelled' },
  direction: { inbound: 'Received', outbound: 'Paid out' },
}

/**
 * Shows which URL filters are narrowing a list, with a way to clear them.
 *
 * The voice assistant navigates here with query filters applied. Without this
 * strip a filtered list is visually identical to the full one, so someone
 * could read "unpaid invoices" as "all invoices" — the quiet kind of wrong
 * this feature has to avoid.
 */
export function ActiveFilters() {
  const router = useRouter()
  const pathname = usePathname()
  const params = useSearchParams()
  const [partnerName, setPartnerName] = useState(null)

  const partnerId = params.get('partnerId')

  useEffect(() => {
    if (!partnerId) { setPartnerName(null); return }
    let cancelled = false
    api.get(`/contacts/${partnerId}`)
      .then((c) => { if (!cancelled) setPartnerName(c?.name ?? null) })
      .catch(() => { if (!cancelled) setPartnerName(null) })
    return () => { cancelled = true }
  }, [partnerId])

  const chips = []
  for (const key of ['settleState', 'state', 'direction']) {
    const value = params.get(key)
    if (value) chips.push(LABELS[key]?.[value] ?? value)
  }
  if (partnerId) chips.push(partnerName ?? 'Selected contact')

  if (chips.length === 0) return null

  return (
    <div className="flex flex-wrap items-center gap-2 border-b border-line bg-brand-light px-4 py-2 print:hidden">
      <span className="text-xs font-semibold uppercase text-brand">Filtered</span>
      {chips.map((c) => (
        <span key={c} className="rounded-sm border border-line bg-surface-sheet px-2 py-0.5 text-xs text-ink">{c}</span>
      ))}
      <button
        onClick={() => router.replace(pathname)}
        className="ml-auto flex items-center gap-1 text-xs text-ink-muted hover:text-ink"
      >
        <X size={12} /> Clear
      </button>
    </div>
  )
}
