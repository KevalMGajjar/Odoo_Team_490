'use client'

import { ControlPanel } from '@/components/layout/ControlPanel'
import { AnalyticAccountForm } from '@/components/analytics/AnalyticAccountForm'

export default function NewAnalyticAccountPage() {
  return (
    <div className="flex h-full flex-col">
      <ControlPanel breadcrumb="Account / Analyticals" title="New Analytical Account" />
      <div className="flex-1 overflow-y-auto p-4 sm:p-6">
        <AnalyticAccountForm />
      </div>
    </div>
  )
}
