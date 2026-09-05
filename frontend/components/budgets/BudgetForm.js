'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { FormField, TextInput } from '@/components/ui/FormField'
import { SearchSelect } from '@/components/ui/SearchSelect'
import { FormSheet, FormGrid, FormSection } from '@/components/layout/FormSheet'
import { BudgetLineEditor, blankBudgetLine } from './BudgetLineEditor'
import { Button } from '@/components/ui/Button'
import { StatusBadge } from '@/components/ui/StatusBadge'
import { api, ApiError } from '@/lib/api'
import { useToast } from '@/components/ui/Toast'
import { useAuth } from '@/lib/auth'
import { toDateInput } from '@/lib/format'
import { useGuardedAction } from '@/lib/useGuardedAction'

const emptyForm = { name: '', startDate: toDateInput(new Date()), endDate: '', responsible: null, lines: [blankBudgetLine()] }

/** Shared by /budgets/new and the draft-editing path on /budgets/[id] — a
 * Budget can only be edited (header or lines) while it's still Draft; once
 * Confirmed, Revise is the only way to change committed amounts. */
export function BudgetForm({ budget, onSaved }) {
  const isEdit = Boolean(budget)
  const router = useRouter()
  const { push } = useToast()
  const { user } = useAuth()

  const [form, setForm] = useState(() =>
    isEdit
      ? {
          name: budget.name, startDate: toDateInput(budget.startDate), endDate: toDateInput(budget.endDate),
          responsible: budget.responsible, lines: budget.lines.map((l) => ({ ...l, committedAmount: l.committedAmount })),
        }
      : emptyForm,
  )
  const [errors, setErrors] = useState({})

  const [save, saving] = useGuardedAction(async (e) => {
    e.preventDefault()
    setErrors({})
    const payload = {
      name: form.name, startDate: form.startDate, endDate: form.endDate,
      responsibleId: form.responsible?.id || null,
      lines: form.lines.map((l) => ({ analyticAccountId: l.analyticAccountId, committedAmount: l.committedAmount })),
    }
    try {
      if (isEdit) {
        const updated = await api.put(`/budgets/${budget.id}`, payload)
        push('Budget saved', { type: 'success' })
        onSaved ? onSaved(updated) : router.refresh()
      } else {
        const created = await api.post('/budgets', payload)
        push('Budget created as Draft', { type: 'success' })
        router.replace(`/budgets/${created.id}`)
      }
    } catch (err) {
      if (err instanceof ApiError && err.errors?.length) {
        setErrors(err.fieldErrorMap())
      } else {
        push(err.message || 'Could not save budget', { type: 'error' })
      }
    }
  })

  return (
    <form onSubmit={save}>
      <FormSheet>
        <div className="mb-5 flex items-center justify-between gap-3">
          {isEdit ? <p className="text-xl font-semibold text-ink">{budget.name}</p> : <p className="text-xl font-semibold text-ink-faint">New Budget</p>}
          {isEdit && <StatusBadge status={budget.state} />}
        </div>

        <FormSection>
          <FormGrid>
            <FormField label="Name" required error={errors.name} className="sm:col-span-2">
              <TextInput value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} required />
            </FormField>
            <FormField label="Start Date" required error={errors.startDate}>
              <TextInput type="date" value={form.startDate} onChange={(e) => setForm((f) => ({ ...f, startDate: e.target.value }))} required />
            </FormField>
            <FormField label="End Date" required error={errors.endDate}>
              <TextInput type="date" value={form.endDate} onChange={(e) => setForm((f) => ({ ...f, endDate: e.target.value }))} required />
            </FormField>
            <FormField label="Responsible" className="sm:col-span-2" hint={user?.role !== 'admin' ? 'Only an admin can change this' : undefined}>
              {user?.role === 'admin' ? (
                <SearchSelect
                  path="/users"
                  resolvedOption={form.responsible}
                  onChange={(opt) => setForm((f) => ({ ...f, responsible: opt }))}
                  placeholder="Optional"
                />
              ) : (
                <TextInput value={form.responsible?.name ?? '—'} disabled />
              )}
            </FormField>
          </FormGrid>
        </FormSection>

        <FormSection title="Budget Lines">
          <BudgetLineEditor
            lines={form.lines}
            onChange={(lines) => setForm((f) => ({ ...f, lines }))}
          />
          {errors.lines && <p className="field-error mt-2">{errors.lines}</p>}
        </FormSection>

        <div className="flex items-center justify-end border-t border-line pt-4">
          <Button type="submit" variant="primary" loading={saving}>
            {isEdit ? 'Save Changes' : 'Save as Draft'}
          </Button>
        </div>
      </FormSheet>
    </form>
  )
}
