'use client'

import { ControlPanel } from '@/components/layout/ControlPanel'
import { BudgetForm } from '@/components/budgets/BudgetForm'

export default function NewBudgetPage() {
  return (
    <div className="flex h-full flex-col">
      <ControlPanel breadcrumb="Account / Budgets" title="New Budget" />
      <div className="flex-1 overflow-y-auto p-4 sm:p-6">
        <BudgetForm />
      </div>
    </div>
  )
}
