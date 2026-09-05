'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { FormField, TextInput, Select } from '@/components/ui/FormField'
import { SearchSelect } from '@/components/ui/SearchSelect'
import { FormSheet, FormGrid, FormSection } from '@/components/layout/FormSheet'
import { ImageUpload } from '@/components/ui/ImageUpload'
import { Button } from '@/components/ui/Button'
import { StatusBadge } from '@/components/ui/StatusBadge'
import { ConfirmDialog } from '@/components/ui/Modal'
import { api, ApiError } from '@/lib/api'
import { useToast } from '@/components/ui/Toast'
import { useAuth, canModify } from '@/lib/auth'
import { formatMoney, formatNumber } from '@/lib/format'
import { useGuardedAction } from '@/lib/useGuardedAction'

const emptyForm = { name: '', type: 'goods', categoryId: '', salesPrice: '', cost: '', gstRate: '18', trackInventory: false, image: null }

export function ProductForm({ product }) {
  const isEdit = Boolean(product)
  const router = useRouter()
  const { push } = useToast()
  const { user } = useAuth()
  const readOnly = isEdit && !canModify(user?.role)

  const [form, setForm] = useState(() =>
    isEdit
      ? {
          name: product.name, type: product.type, categoryId: product.categoryId ?? '',
          salesPrice: product.salesPrice, cost: product.cost, gstRate: product.gstRate,
          trackInventory: product.trackInventory, image: product.image ?? null,
        }
      : emptyForm,
  )
  const [category, setCategory] = useState(product?.category ?? null)
  const [errors, setErrors] = useState({})
  const [confirmArchive, setConfirmArchive] = useState(false)

  const set = (field) => (e) => {
    const value = e.target.type === 'checkbox' ? e.target.checked : e.target.value
    setForm((f) => ({ ...f, [field]: value, ...(field === 'type' && value === 'service' ? { trackInventory: false } : {}) }))
  }

  const [save, saving] = useGuardedAction(async (e) => {
    e.preventDefault()
    setErrors({})
    try {
      const payload = { ...form, categoryId: category?.id || null }
      if (isEdit) {
        await api.put(`/products/${product.id}`, payload)
        push('Product updated', { type: 'success' })
        router.push('/products')
        return
      } else {
        const created = await api.post('/products', payload)
        push('Product created', { type: 'success' })
        router.replace(`/products/${created.id}`)
      }
    } catch (err) {
      if (err instanceof ApiError && err.errors?.length) {
        setErrors(Object.fromEntries(err.errors.map((e) => [e.field, e.message])))
      } else {
        push(err.message || 'Could not save product', { type: 'error' })
      }
    }
  })

  const [archive, archiving] = useGuardedAction(async () => {
    try {
      await api.post(`/products/${product.id}/archive`)
      push('Product archived', { type: 'success' })
      router.push('/products')
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
          {isEdit ? <p className="text-xl font-semibold text-ink">{product.name}</p> : <p className="text-xl font-semibold text-ink-faint">New Product</p>}
          {isEdit && <StatusBadge status={product.status} />}
        </div>

        <FormSection>
          <FormField label="Photo" className="mb-4">
            <ImageUpload
              value={form.image}
              onChange={(v) => setForm((f) => ({ ...f, image: v }))}
              disabled={readOnly}
              label={form.name || 'Product'}
            />
          </FormField>

          <FormGrid>
            <FormField label="Name" required error={errors.name} className="sm:col-span-2">
              <TextInput value={form.name} onChange={set('name')} disabled={readOnly} required />
            </FormField>

            <FormField label="Type" required error={errors.type}>
              <Select value={form.type} onChange={set('type')} disabled={readOnly}>
                <option value="goods">Goods</option>
                <option value="service">Service</option>
                <option value="combo">Combo</option>
              </Select>
            </FormField>

            <FormField label="Category" error={errors.categoryId}>
              <SearchSelect
                path="/product-categories"
                resolvedOption={category}
                onChange={setCategory}
                placeholder="Optional"
                disabled={readOnly}
              />
            </FormField>

            <FormField label="Sales Price" required error={errors.salesPrice}>
              <TextInput type="number" step="0.01" value={form.salesPrice} onChange={set('salesPrice')} disabled={readOnly} required />
            </FormField>

            <FormField label="Cost" required error={errors.cost}>
              <TextInput type="number" step="0.01" value={form.cost} onChange={set('cost')} disabled={readOnly} required />
            </FormField>

            <FormField label="GST %" required error={errors.gstRate}>
              <TextInput type="number" step="0.01" value={form.gstRate} onChange={set('gstRate')} disabled={readOnly} required />
            </FormField>

            <FormField error={errors.trackInventory}>
              <label className="flex items-center gap-2 pt-6 text-sm text-ink">
                <input
                  type="checkbox"
                  checked={form.trackInventory}
                  onChange={set('trackInventory')}
                  disabled={readOnly || form.type === 'service'}
                  className="h-3.5 w-3.5 rounded-sm accent-brand"
                />
                Track inventory (perpetual, moving-average cost)
              </label>
            </FormField>
          </FormGrid>
        </FormSection>

        {isEdit && product.trackInventory && (
          <FormSection title="Stock">
            <div className="grid grid-cols-2 gap-4 rounded border border-line bg-surface-subtle p-3 sm:grid-cols-3">
              <div>
                <p className="field-label mb-0">On Hand</p>
                <p className="tabular text-md font-semibold text-ink">{formatNumber(product.onHandQty, 3)}</p>
              </div>
              <div>
                <p className="field-label mb-0">Avg Cost</p>
                <p className="tabular text-md font-semibold text-ink">{formatMoney(product.avgCost)}</p>
              </div>
              <div>
                <p className="field-label mb-0">Stock Value</p>
                <p className="tabular text-md font-semibold text-ink">{formatMoney(Number(product.onHandQty) * Number(product.avgCost))}</p>
              </div>
            </div>
          </FormSection>
        )}

        <div className="flex items-center justify-between border-t border-line pt-4">
          <div>
            {isEdit && canModify(user?.role) && product.status === 'active' && (
              <Button type="button" variant="danger" size="sm" onClick={() => setConfirmArchive(true)}>Archive</Button>
            )}
          </div>
          {!readOnly && (
            <Button type="submit" variant="primary" loading={saving}>
              {isEdit ? 'Save Changes' : 'Create Product'}
            </Button>
          )}
        </div>
      </FormSheet>

      <ConfirmDialog
        open={confirmArchive}
        onClose={() => setConfirmArchive(false)}
        onConfirm={archive}
        title="Archive this product?"
        consequence={`${product?.name} will no longer be selectable on new documents. This is refused if any stock remains on hand.`}
        confirmLabel="Archive"
        danger
        loading={archiving}
      />
    </form>
  )
}
