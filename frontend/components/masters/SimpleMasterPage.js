'use client'

import { useState } from 'react'
import { Plus } from 'lucide-react'
import { ControlPanel } from '@/components/layout/ControlPanel'
import { DataTable } from '@/components/ui/DataTable'
import { StatusBadge } from '@/components/ui/StatusBadge'
import { Button } from '@/components/ui/Button'
import { Modal, ConfirmDialog } from '@/components/ui/Modal'
import { useApiList } from '@/lib/useApi'
import { useAuth, canWrite, canModify } from '@/lib/auth'
import { api, ApiError } from '@/lib/api'
import { useToast } from '@/components/ui/Toast'

/**
 * List + create/edit-in-modal for single-purpose masters (a name, maybe a
 * type or rate) — Product Categories, Taxes, Analytic Accounts. Full
 * page-navigation forms are the right shape for Contacts/Products/Accounts;
 * for a two-field master a modal is the less redundant choice, not a
 * shortcut — same FormField/validation contract either way.
 */
export function SimpleMasterPage({
  title,
  breadcrumb,
  apiPath,
  columns,
  Fields, // component: ({ form, setForm, errors, readOnly }) => JSX
  emptyForm,
  toPayload = (form) => form,
  toForm = (row) => row,
  archivable = true,
  searchable = true,
}) {
  const { user } = useAuth()
  const { push } = useToast()
  const { rows, loading, search, setSearch, reload } = useApiList(apiPath, { pageSize: 100 })

  const [modalRow, setModalRow] = useState(null) // null = closed, {} = new, {...} = edit
  const [form, setForm] = useState(emptyForm)
  const [errors, setErrors] = useState({})
  const [saving, setSaving] = useState(false)
  const [confirmArchive, setConfirmArchive] = useState(null)

  const openNew = () => { setForm(emptyForm); setErrors({}); setModalRow({}) }
  const openEdit = (row) => { setForm(toForm(row)); setErrors({}); setModalRow(row) }

  const save = async (e) => {
    e.preventDefault()
    setErrors({})
    setSaving(true)
    try {
      const isEdit = Boolean(modalRow?.id)
      if (isEdit) await api.put(`${apiPath}/${modalRow.id}`, toPayload(form))
      else await api.post(apiPath, toPayload(form))
      push(isEdit ? 'Saved' : 'Created', { type: 'success' })
      setModalRow(null)
      reload()
    } catch (err) {
      if (err instanceof ApiError && err.errors?.length) {
        setErrors(Object.fromEntries(err.errors.map((e) => [e.field, e.message])))
      } else {
        push(err.message || 'Could not save', { type: 'error' })
      }
    } finally {
      setSaving(false)
    }
  }

  const archive = async () => {
    setSaving(true)
    try {
      await api.post(`${apiPath}/${confirmArchive.id}/archive`)
      push('Archived', { type: 'success' })
      reload()
    } catch (err) {
      push(err instanceof ApiError ? err.message : 'Could not archive', { type: 'error' })
    } finally {
      setSaving(false)
      setConfirmArchive(null)
    }
  }

  const allColumns = [
    ...columns,
    ...(archivable ? [{ key: 'status', header: 'Status', render: (r) => <StatusBadge status={r.status} /> }] : []),
  ]

  return (
    <div className="flex h-full flex-col">
      <ControlPanel
        breadcrumb={breadcrumb}
        title={title}
        actions={
          canWrite(user?.role) && (
            <Button variant="primary" size="sm" icon={Plus} onClick={openNew}>New</Button>
          )
        }
      />
      <div className="flex-1 overflow-hidden">
        <DataTable
          columns={allColumns}
          rows={rows}
          loading={loading}
          search={searchable ? search : undefined}
          onSearchChange={searchable ? setSearch : undefined}
          onRowClick={canWrite(user?.role) ? openEdit : undefined}
          emptyTitle={`No ${title.toLowerCase()} yet.`}
          emptyAction={canWrite(user?.role) ? 'New' : undefined}
          onEmptyAction={openNew}
        />
      </div>

      <Modal
        open={modalRow !== null}
        onClose={() => setModalRow(null)}
        title={modalRow?.id ? `Edit ${title.slice(0, -1)}` : `New ${title.slice(0, -1)}`}
        footer={
          <>
            <Button variant="ghost" onClick={() => setModalRow(null)}>Cancel</Button>
            {(!modalRow?.id || canModify(user?.role)) && (
              <Button variant="primary" onClick={save} loading={saving}>Save</Button>
            )}
            {modalRow?.id && canModify(user?.role) && archivable && modalRow.status === 'active' && (
              <Button variant="danger" onClick={() => setConfirmArchive(modalRow)}>Archive</Button>
            )}
          </>
        }
      >
        <Fields form={form} setForm={setForm} errors={errors} readOnly={modalRow?.id && !canModify(user?.role)} />
      </Modal>

      <ConfirmDialog
        open={Boolean(confirmArchive)}
        onClose={() => setConfirmArchive(null)}
        onConfirm={archive}
        title={`Archive this ${title.toLowerCase().slice(0, -1)}?`}
        consequence="It will no longer be selectable on new records. Refused if anything still references it."
        confirmLabel="Archive"
        danger
        loading={saving}
      />
    </div>
  )
}
