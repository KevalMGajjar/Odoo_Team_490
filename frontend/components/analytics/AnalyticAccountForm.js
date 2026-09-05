'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { FormField, TextInput, Select } from '@/components/ui/FormField'
import { FormSheet, FormGrid, FormSection } from '@/components/layout/FormSheet'
import { Button } from '@/components/ui/Button'
import { StatusBadge } from '@/components/ui/StatusBadge'
import { ConfirmDialog } from '@/components/ui/Modal'
import { api, ApiError } from '@/lib/api'
import { useToast } from '@/components/ui/Toast'
import { useAuth, canModify } from '@/lib/auth'
import { useGuardedAction } from '@/lib/useGuardedAction'
import { formatMoney, formatDate } from '@/lib/format'

const emptyForm = { name: '', type: 'expense' }

/** Shared by /analytic-accounts/new and /analytic-accounts/[id]. The Budget
 * usage panel is read-only history, so it renders only in edit mode. */
export function AnalyticAccountForm({ account }) {
  const isEdit = Boolean(account)
  const router = useRouter()
  const { push } = useToast()
  const { user } = useAuth()
  const readOnly = isEdit && !canModify(user?.role)

  const [form, setForm] = useState(() => (isEdit ? { name: account.name, type: account.type } : emptyForm))
  const [errors, setErrors] = useState({})
  const [confirmArchive, setConfirmArchive] = useState(false)

  const [save, saving] = useGuardedAction(async (e) => {
    e.preventDefault()
    setErrors({})
    try {
      if (isEdit) {
        await api.put(`/analytic-accounts/${account.id}`, form)
        push('Analytical account updated', { type: 'success' })
        router.push('/analytic-accounts')
        return
      } else {
        const created = await api.post('/analytic-accounts', form)
        push('Analytical account created', { type: 'success' })
        router.replace(`/analytic-accounts/${created.id}`)
      }
    } catch (err) {
      if (err instanceof ApiError && err.errors?.length) {
        setErrors(err.fieldErrorMap())
      } else {
        push(err.message || 'Could not save', { type: 'error' })
      }
    }
  })

  const [archive, archiving] = useGuardedAction(async () => {
    try {
      await api.post(`/analytic-accounts/${account.id}/archive`)
      push('Analytical account archived', { type: 'success' })
      router.push('/analytic-accounts')
    } catch (err) {
      push(err instanceof ApiError ? err.message : 'Could not archive', { type: 'error' })
    } finally {
      setConfirmArchive(false)
    }
  })

  return (
    <form onSubmit={save}>
      <FormSheet>
        <div className="mb-5 flex items-center justify-between gap-3">
          {isEdit ? <p className="text-xl font-semibold text-ink">{account.name}</p> : <p className="text-xl font-semibold text-ink-faint">New Analytical Account</p>}
          {isEdit && <StatusBadge status={account.status} />}
        </div>

        <FormSection>
          <FormGrid>
            <FormField label="Analytical account" required error={errors.name} className="sm:col-span-2">
              <TextInput value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} disabled={readOnly} autoFocus required />
            </FormField>
            <FormField label="Type" required error={errors.type}>
              <Select value={form.type} onChange={(e) => setForm((f) => ({ ...f, type: e.target.value }))} disabled={readOnly}>
                <option value="expense">Expense</option>
                <option value="income">Income</option>
              </Select>
            </FormField>
          </FormGrid>
        </FormSection>

        <div className="flex items-center justify-between border-t border-line pt-4">
          <div>
            {isEdit && canModify(user?.role) && account.status === 'active' && (
              <Button type="button" variant="danger" size="sm" onClick={() => setConfirmArchive(true)}>Archive</Button>
            )}
          </div>
          {!readOnly && (
            <Button type="submit" variant="primary" loading={saving}>
              {isEdit ? 'Save Changes' : 'Create'}
            </Button>
          )}
        </div>
      </FormSheet>

      {isEdit && (
        <FormSheet className="mt-4">
          <FormSection title="Budgets Using This Analytical Account">
            {account.budgetLines?.length ? (
              <div className="rounded border border-line">
                <table className="w-full border-collapse text-sm">
                  <thead className="bg-surface-subtle">
                    <tr>
                      <th className="px-3 py-2 text-left text-xs font-semibold uppercase text-ink-muted">Budget</th>
                      <th className="px-3 py-2 text-left text-xs font-semibold uppercase text-ink-muted">Period</th>
                      <th className="px-3 py-2 text-right text-xs font-semibold uppercase text-ink-muted">Committed</th>
                      <th className="px-3 py-2 text-left text-xs font-semibold uppercase text-ink-muted">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {account.budgetLines.map((line) => (
                      <tr key={line.id} className="cursor-pointer border-b border-line last:border-b-0 hover:bg-surface-hover" onClick={() => router.push(`/budgets/${line.budget.id}`)}>
                        <td className="px-3 py-1.5 font-medium text-secondary">{line.budget.name}</td>
                        <td className="px-3 py-1.5 text-ink-muted">{formatDate(line.budget.startDate)} – {formatDate(line.budget.endDate)}</td>
                        <td className="px-3 py-1.5 text-right tabular text-ink">{formatMoney(line.committedAmount)}</td>
                        <td className="px-3 py-1.5"><StatusBadge status={line.budget.state} /></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="text-sm text-ink-faint">No budget has used this analytical account yet.</p>
            )}
          </FormSection>
        </FormSheet>
      )}

      <ConfirmDialog
        open={confirmArchive}
        onClose={() => setConfirmArchive(false)}
        onConfirm={archive}
        title="Archive this analytical account?"
        consequence={`${account?.name} will no longer be selectable on new records. Refused if any ledger entries or budgets still reference it.`}
        confirmLabel="Archive"
        danger
        loading={archiving}
      />
    </form>
  )
}
