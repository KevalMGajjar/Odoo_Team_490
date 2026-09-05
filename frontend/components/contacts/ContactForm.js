'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { FormField, TextInput, Select } from '@/components/ui/FormField'
import { FormSheet, FormGrid, FormSection } from '@/components/layout/FormSheet'
import { ImageUpload } from '@/components/ui/ImageUpload'
import { Button } from '@/components/ui/Button'
import { StatusBadge } from '@/components/ui/StatusBadge'
import { ConfirmDialog } from '@/components/ui/Modal'
import { api, ApiError } from '@/lib/api'
import { useToast } from '@/components/ui/Toast'
import { useAuth, canModify } from '@/lib/auth'
import { useGuardedAction } from '@/lib/useGuardedAction'

const emptyForm = { name: '', type: 'customer', email: '', mobile: '', city: '', state: '', pincode: '', profileImage: null }

/** Shared by /contacts/new and /contacts/[id] — create and edit are the same sheet. */
export function ContactForm({ contact }) {
  const isEdit = Boolean(contact)
  const router = useRouter()
  const { push } = useToast()
  const { user } = useAuth()
  const readOnly = isEdit && !canModify(user?.role)

  const [form, setForm] = useState(() =>
    isEdit
      ? { name: contact.name, type: contact.type, email: contact.email ?? '', mobile: contact.mobile ?? '', city: contact.city ?? '', state: contact.state ?? '', pincode: contact.pincode ?? '', profileImage: contact.profileImage ?? null }
      : emptyForm,
  )
  const [errors, setErrors] = useState({})
  const [confirmArchive, setConfirmArchive] = useState(false)

  const set = (field) => (e) => setForm((f) => ({ ...f, [field]: e.target.value }))

  const [save, saving] = useGuardedAction(async (e) => {
    e.preventDefault()
    setErrors({})
    try {
      if (isEdit) {
        await api.put(`/contacts/${contact.id}`, form)
        push('Contact updated', { type: 'success' })
        // Saving an edit returns to the list — staying on a read-back form
        // left people wondering whether the change had actually taken.
        router.push('/contacts')
        return
      } else {
        const created = await api.post('/contacts', form)
        push('Contact created', { type: 'success' })
        router.replace(`/contacts/${created.id}`)
        return
      }
    } catch (err) {
      if (err instanceof ApiError && err.errors?.length) {
        setErrors(err.fieldErrorMap())
      } else {
        push(err.message || 'Could not save contact', { type: 'error' })
      }
    }
  })

  const [archive, archiving] = useGuardedAction(async () => {
    try {
      await api.post(`/contacts/${contact.id}/archive`)
      push('Contact archived', { type: 'success' })
      router.push('/contacts')
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
          <div className="min-w-0 flex-1">
            {isEdit ? (
              <p className="truncate text-xl font-semibold text-ink">{contact.name}</p>
            ) : (
              <p className="text-xl font-semibold text-ink-faint">New Contact</p>
            )}
          </div>
          {isEdit && <StatusBadge status={contact.status} />}
        </div>

        <FormSection>
          <FormField label="Photo" className="mb-4">
            <ImageUpload
              value={form.profileImage}
              onChange={(v) => setForm((f) => ({ ...f, profileImage: v }))}
              disabled={readOnly}
              shape="circle"
              label={form.name || 'Contact'}
            />
          </FormField>

          <FormGrid>
            <FormField label="Name" required error={errors.name} className="sm:col-span-2">
              <TextInput value={form.name} onChange={set('name')} disabled={readOnly} required />
            </FormField>

            <FormField label="Type" required error={errors.type}>
              <Select value={form.type} onChange={set('type')} disabled={readOnly}>
                <option value="customer">Customer</option>
                <option value="vendor">Vendor</option>
                <option value="both">Customer &amp; Vendor</option>
              </Select>
            </FormField>

            <FormField label="Email" error={errors.email}>
              <TextInput type="email" value={form.email} onChange={set('email')} disabled={readOnly} />
            </FormField>

            <FormField label="Mobile" error={errors.mobile}>
              <TextInput value={form.mobile} onChange={set('mobile')} disabled={readOnly} />
            </FormField>

            <FormField label="City" error={errors.city}>
              <TextInput value={form.city} onChange={set('city')} disabled={readOnly} />
            </FormField>

            <FormField label="State" error={errors.state}>
              <TextInput value={form.state} onChange={set('state')} disabled={readOnly} />
            </FormField>

            <FormField label="Pincode" error={errors.pincode}>
              <TextInput value={form.pincode} onChange={set('pincode')} disabled={readOnly} />
            </FormField>
          </FormGrid>
        </FormSection>

        <div className="flex items-center justify-between border-t border-line pt-4">
          <div>
            {isEdit && canModify(user?.role) && contact.status === 'active' && (
              <Button type="button" variant="danger" size="sm" onClick={() => setConfirmArchive(true)}>
                Archive
              </Button>
            )}
          </div>
          {!readOnly && (
            <Button type="submit" variant="primary" loading={saving}>
              {isEdit ? 'Save Changes' : 'Create Contact'}
            </Button>
          )}
        </div>
      </FormSheet>

      <ConfirmDialog
        open={confirmArchive}
        onClose={() => setConfirmArchive(false)}
        onConfirm={archive}
        title="Archive this contact?"
        consequence={`${contact?.name} will no longer be selectable on new documents. This is refused if any unpaid invoices or bills reference them.`}
        confirmLabel="Archive"
        danger
        loading={archiving}
      />
    </form>
  )
}
