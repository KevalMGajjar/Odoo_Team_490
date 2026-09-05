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

const emptyForm = { code: '', name: '', type: 'expense', isCashBank: false }

export function AccountForm({ account }) {
  const isEdit = Boolean(account)
  const router = useRouter()
  const { push } = useToast()
  const { user } = useAuth()
  const readOnly = isEdit && !canModify(user?.role)

  const [form, setForm] = useState(() =>
    isEdit ? { code: account.code, name: account.name, type: account.type, isCashBank: account.isCashBank } : emptyForm,
  )
  const [errors, setErrors] = useState({})
  const [saving, setSaving] = useState(false)
  const [confirmArchive, setConfirmArchive] = useState(false)

  const set = (field) => (e) => {
    const value = e.target.type === 'checkbox' ? e.target.checked : e.target.value
    setForm((f) => ({ ...f, [field]: value }))
  }

  const save = async (e) => {
    e.preventDefault()
    setErrors({})
    setSaving(true)
    try {
      if (isEdit) {
        await api.put(`/accounts/${account.id}`, form)
        push('Account updated', { type: 'success' })
        router.refresh()
      } else {
        const created = await api.post('/accounts', form)
        push('Account created', { type: 'success' })
        router.replace(`/accounts/${created.id}`)
      }
    } catch (err) {
      if (err instanceof ApiError && err.errors?.length) {
        setErrors(Object.fromEntries(err.errors.map((e) => [e.field, e.message])))
      } else {
        push(err.message || 'Could not save account', { type: 'error' })
      }
    } finally {
      setSaving(false)
    }
  }

  const archive = async () => {
    setSaving(true)
    try {
      await api.post(`/accounts/${account.id}/archive`)
      push('Account archived', { type: 'success' })
      router.refresh()
    } catch (err) {
      push(err instanceof ApiError ? err.message : 'Could not archive', { type: 'error' })
    } finally {
      setSaving(false)
      setConfirmArchive(false)
    }
  }

  return (
    <form onSubmit={save}>
      <FormSheet>
        <div className="mb-5 flex items-center justify-between gap-3">
          {isEdit ? (
            <p className="text-xl font-semibold text-ink">
              <span className="tabular text-ink-faint">{account.code}</span> {account.name}
            </p>
          ) : (
            <p className="text-xl font-semibold text-ink-faint">New Account</p>
          )}
          {isEdit && <StatusBadge status={account.status} />}
        </div>

        <FormSection>
          <FormGrid>
            <FormField label="Code" required error={errors.code} hint="e.g. 1300">
              <TextInput value={form.code} onChange={set('code')} disabled={readOnly} required />
            </FormField>

            <FormField label="Type" required error={errors.type}>
              <Select value={form.type} onChange={set('type')} disabled={readOnly}>
                <option value="asset">Asset</option>
                <option value="liability">Liability</option>
                <option value="income">Income</option>
                <option value="expense">Expense</option>
                <option value="capital">Capital</option>
              </Select>
            </FormField>

            <FormField label="Name" required error={errors.name} className="sm:col-span-2">
              <TextInput value={form.name} onChange={set('name')} disabled={readOnly} required />
            </FormField>

            <FormField error={errors.isCashBank} className="sm:col-span-2">
              <label className="flex items-center gap-2 text-sm text-ink">
                <input
                  type="checkbox"
                  checked={form.isCashBank}
                  onChange={set('isCashBank')}
                  disabled={readOnly || form.type !== 'asset'}
                  className="h-3.5 w-3.5 rounded-sm accent-brand"
                />
                Cash or bank account
                <span className="text-xs text-ink-faint">— selectable on receipt/payment voucher screens</span>
              </label>
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
              {isEdit ? 'Save Changes' : 'Create Account'}
            </Button>
          )}
        </div>
      </FormSheet>

      <ConfirmDialog
        open={confirmArchive}
        onClose={() => setConfirmArchive(false)}
        onConfirm={archive}
        title="Archive this account?"
        consequence={`${account?.name} will no longer be selectable on new entries. This is refused if any ledger entries already reference it.`}
        confirmLabel="Archive"
        danger
        loading={saving}
      />
    </form>
  )
}
