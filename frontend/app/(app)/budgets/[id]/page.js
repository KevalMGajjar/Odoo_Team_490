'use client'

import { useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { ControlPanel } from '@/components/layout/ControlPanel'
import { FormSheet, FormGrid, FormSection } from '@/components/layout/FormSheet'
import { FormField, TextInput } from '@/components/ui/FormField'
import { BudgetForm } from '@/components/budgets/BudgetForm'
import { BudgetLineTable } from '@/components/budgets/BudgetLineTable'
import { ReviseBudgetModal } from '@/components/budgets/ReviseBudgetModal'
import { StatusBadge } from '@/components/ui/StatusBadge'
import { SmartButton } from '@/components/documents/SmartButton'
import { Skeleton } from '@/components/ui/Skeleton'
import { Button } from '@/components/ui/Button'
import { ConfirmDialog } from '@/components/ui/Modal'
import { useApiGet } from '@/lib/useApi'
import { useAuth, canWrite } from '@/lib/auth'
import { api, ApiError } from '@/lib/api'
import { useToast } from '@/components/ui/Toast'
import { formatDate } from '@/lib/format'
import { useGuardedAction } from '@/lib/useGuardedAction'

export default function BudgetDetailPage() {
  const { id } = useParams()
  const router = useRouter()
  const { user } = useAuth()
  const { push } = useToast()
  const { data: budget, loading, error, reload } = useApiGet(`/budgets/${id}`)
  const [reviseOpen, setReviseOpen] = useState(false)
  const [cancelOpen, setCancelOpen] = useState(false)

  const [doConfirm, confirming] = useGuardedAction(async () => {
    try {
      await api.post(`/budgets/${id}/confirm`)
      push('Budget confirmed', { type: 'success' })
      reload()
    } catch (err) {
      push(err instanceof ApiError ? err.message : 'Could not confirm budget', { type: 'error' })
    }
  })

  const [doCancel, cancelling] = useGuardedAction(async () => {
    try {
      await api.post(`/budgets/${id}/cancel`)
      push('Budget cancelled', { type: 'success' })
      reload()
    } catch (err) {
      push(err instanceof ApiError ? err.message : 'Could not cancel budget', { type: 'error' })
    } finally {
      setCancelOpen(false)
    }
  })

  const [doRevise, revising] = useGuardedAction(async () => {
    try {
      const revised = await api.post(`/budgets/${id}/revise`)
      push('Budget revised — new draft created', { type: 'success' })
      router.push(`/budgets/${revised.id}`)
    } catch (err) {
      push(err instanceof ApiError ? err.message : 'Could not revise budget', { type: 'error' })
      setReviseOpen(false)
    }
  })

  if (loading) {
    return (
      <div className="flex h-full flex-col">
        <ControlPanel breadcrumb="Account / Budgets" title="Loading…" />
        <div className="p-6"><div className="form-sheet"><Skeleton className="h-64" /></div></div>
      </div>
    )
  }
  if (error || !budget) {
    return (
      <div className="flex h-full flex-col">
        <ControlPanel breadcrumb="Account / Budgets" title="Not found" />
        <div className="p-6"><p className="text-sm text-state-overdue">Budget not found.</p></div>
      </div>
    )
  }

  const canAct = canWrite(user?.role)

  return (
    <div className="flex h-full flex-col">
      <ControlPanel
        breadcrumb="Account / Budgets"
        title={budget.name}
        actions={
          <>
            <StatusBadge status={budget.state} />
            {canAct && budget.state === 'draft' && (
              <Button variant="primary" size="sm" onClick={doConfirm} loading={confirming}>Confirm</Button>
            )}
            {canAct && budget.state === 'confirmed' && (
              <Button variant="secondary" size="sm" onClick={() => setReviseOpen(true)}>Revise</Button>
            )}
            {canAct && ['draft', 'confirmed'].includes(budget.state) && (
              <Button variant="danger" size="sm" onClick={() => setCancelOpen(true)}>Cancel</Button>
            )}
          </>
        }
      />

      <div className="flex-1 overflow-y-auto p-4 sm:p-6">
        {budget.state === 'draft' && canAct ? (
          <BudgetForm budget={budget} onSaved={reload} />
        ) : (
          <FormSheet className="max-w-[1100px]">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
              <p className="text-xl font-semibold text-ink">{budget.name}</p>
              <div className="flex gap-2">
                {budget.revises && <SmartButton value={budget.revises.name} label="Revises" href={`/budgets/${budget.revises.id}`} />}
                {budget.revisedBy && <SmartButton value={budget.revisedBy.name} label="Revised Into" href={`/budgets/${budget.revisedBy.id}`} />}
              </div>
            </div>

            <FormSection>
              <FormGrid>
                <FormField label="Period"><TextInput value={`${formatDate(budget.startDate)} – ${formatDate(budget.endDate)}`} disabled /></FormField>
                <FormField label="Responsible"><TextInput value={budget.responsible?.name ?? '—'} disabled /></FormField>
              </FormGrid>
            </FormSection>

            <FormSection title="Budget Lines">
              <BudgetLineTable lines={budget.lines} committedTotal={budget.committedTotal} achievedTotal={budget.achievedTotal} />
            </FormSection>
          </FormSheet>
        )}
      </div>

      <ReviseBudgetModal open={reviseOpen} onClose={() => setReviseOpen(false)} budget={budget} onConfirm={doRevise} loading={revising} />
      <ConfirmDialog
        open={cancelOpen}
        onClose={() => setCancelOpen(false)}
        onConfirm={doCancel}
        title="Cancel this budget?"
        consequence={`${budget.name} will no longer be checked against new documents.`}
        confirmLabel="Cancel Budget"
        danger
        loading={cancelling}
      />
    </div>
  )
}
