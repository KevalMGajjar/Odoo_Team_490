'use client'

import { useParams } from 'next/navigation'
import { ControlPanel } from '@/components/layout/ControlPanel'
import { AnalyticAccountForm } from '@/components/analytics/AnalyticAccountForm'
import { Skeleton } from '@/components/ui/Skeleton'
import { useApiGet } from '@/lib/useApi'

export default function AnalyticAccountDetailPage() {
  const { id } = useParams()
  const { data: account, loading, error } = useApiGet(`/analytic-accounts/${id}`)

  if (loading) {
    return (
      <div className="flex h-full flex-col">
        <ControlPanel breadcrumb="Account / Analyticals" title="Loading…" />
        <div className="p-6"><div className="form-sheet"><Skeleton className="h-64" /></div></div>
      </div>
    )
  }
  if (error || !account) {
    return (
      <div className="flex h-full flex-col">
        <ControlPanel breadcrumb="Account / Analyticals" title="Not found" />
        <div className="p-6"><p className="text-sm text-state-overdue">Analytical account not found.</p></div>
      </div>
    )
  }

  return (
    <div className="flex h-full flex-col">
      <ControlPanel breadcrumb="Account / Analyticals" title={account.name} />
      <div className="flex-1 overflow-y-auto p-4 sm:p-6">
        <AnalyticAccountForm account={account} />
      </div>
    </div>
  )
}
