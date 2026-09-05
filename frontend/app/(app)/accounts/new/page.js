'use client'

import { ControlPanel } from '@/components/layout/ControlPanel'
import { AccountForm } from '@/components/accounts/AccountForm'

export default function NewAccountPage() {
  return (
    <div className="flex h-full flex-col">
      <ControlPanel breadcrumb="Chart of Account" title="New Account" />
      <div className="flex-1 overflow-y-auto p-4 sm:p-6">
        <AccountForm />
      </div>
    </div>
  )
}
