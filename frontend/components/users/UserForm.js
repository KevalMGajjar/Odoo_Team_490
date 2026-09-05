'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { FormField, TextInput, Select } from '@/components/ui/FormField'
import { SearchSelect } from '@/components/ui/SearchSelect'
import { FormSheet, FormGrid, FormSection } from '@/components/layout/FormSheet'
import { Button } from '@/components/ui/Button'
import { StatusBadge } from '@/components/ui/StatusBadge'
import { ConfirmDialog } from '@/components/ui/Modal'
import { api, ApiError } from '@/lib/api'
import { derivePassword, passwordStrengthError } from '@/lib/password'
import { useToast } from '@/components/ui/Toast'
import { useAuth } from '@/lib/auth'
import { useGuardedAction } from '@/lib/useGuardedAction'

const emptyForm = { name: '', loginId: '', email: '', password: '', role: 'accountant' }

/** Admin-only Create User screen (and edit, for role/contact changes — never password here). */
export function UserForm({ user: editUser }) {
  const isEdit = Boolean(editUser)
  const router = useRouter()
  const { push } = useToast()
  const { user: me } = useAuth()

  const [form, setForm] = useState(() =>
    isEdit ? { name: editUser.name, role: editUser.role } : emptyForm,
  )
  const [contact, setContact] = useState(editUser?.contact ?? null)
  const [errors, setErrors] = useState({})
  const [confirmArchive, setConfirmArchive] = useState(false)

  const set = (field) => (e) => setForm((f) => ({ ...f, [field]: e.target.value }))

  const [save, saving] = useGuardedAction(async (e) => {
    e.preventDefault()
    setErrors({})
    try {
      if (isEdit) {
        await api.put(`/users/${editUser.id}`, { name: form.name, role: form.role, contactId: contact?.id || null })
        push('User updated', { type: 'success' })
        router.push('/users')
      } else {
        const weak = passwordStrengthError(form.password)
        if (weak) { setErrors({ password: weak }); return }
        // Salted with the new user's own Login ID, matching what they'll
        // send when they sign in.
        await api.post('/users', {
          ...form,
          password: await derivePassword(form.loginId, form.password),
          contactId: contact?.id || null,
        })
        push('User created', { type: 'success' })
        router.replace('/users')
      }
    } catch (err) {
      if (err instanceof ApiError && err.errors?.length) {
        setErrors(err.fieldErrorMap())
      } else {
        push(err.message || 'Could not save user', { type: 'error' })
      }
    }
  })

  const [archive, archiving] = useGuardedAction(async () => {
    try {
      await api.post(`/users/${editUser.id}/archive`)
      push('User archived', { type: 'success' })
      router.push('/users')
    } catch (err) {
      push(err instanceof ApiError ? err.message : 'Could not archive', { type: 'error' })
    } finally {
      setConfirmArchive(false)
    }
  })

  const isSelf = isEdit && editUser.id === me?.id

  return (
    <form onSubmit={save}>
      <FormSheet>
        <div className="mb-5 flex items-center justify-between gap-3">
          {isEdit ? <p className="text-xl font-semibold text-ink">{editUser.name}</p> : <p className="text-xl font-semibold text-ink-faint">Create User</p>}
          {isEdit && <StatusBadge status={editUser.status} />}
        </div>

        <FormSection>
          <FormGrid>
            <FormField label="Name" required error={errors.name} className="sm:col-span-2">
              <TextInput value={form.name} onChange={set('name')} required />
            </FormField>

            {!isEdit && (
              <>
                <FormField label="Login ID" required hint="6-12 letters/numbers" error={errors.loginId}>
                  <TextInput value={form.loginId} onChange={set('loginId')} required />
                </FormField>
                <FormField label="Email" required error={errors.email}>
                  <TextInput type="email" value={form.email} onChange={set('email')} required />
                </FormField>
                <FormField label="Password" required hint="At least 8 characters, upper + lower case, one special character" error={errors.password} className="sm:col-span-2">
                  <TextInput type="password" value={form.password} onChange={set('password')} required />
                </FormField>
              </>
            )}

            <FormField label="Role" required error={errors.role}>
              <Select value={form.role} onChange={set('role')} disabled={isSelf}>
                <option value="admin">Admin</option>
                <option value="accountant">Accountant</option>
                <option value="user">Portal User</option>
              </Select>
            </FormField>

            {form.role === 'user' && (
              <FormField label="Linked Contact" required error={errors.contactId} hint="A Portal User must be linked to a contact">
                <SearchSelect path="/contacts" resolvedOption={contact} onChange={setContact} placeholder="Select contact" />
              </FormField>
            )}
          </FormGrid>
        </FormSection>

        <div className="flex items-center justify-between border-t border-line pt-4">
          <div>
            {isEdit && !isSelf && editUser.status === 'active' && (
              <Button type="button" variant="danger" size="sm" onClick={() => setConfirmArchive(true)}>Archive</Button>
            )}
          </div>
          <Button type="submit" variant="primary" loading={saving}>
            {isEdit ? 'Save Changes' : 'Create User'}
          </Button>
        </div>
      </FormSheet>

      <ConfirmDialog
        open={confirmArchive}
        onClose={() => setConfirmArchive(false)}
        onConfirm={archive}
        title="Archive this user?"
        consequence={`${editUser?.name} will no longer be able to sign in.`}
        confirmLabel="Archive"
        danger
        loading={archiving}
      />
    </form>
  )
}
