'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { ControlPanel } from '@/components/layout/ControlPanel'
import { FormSheet, FormGrid, FormSection } from '@/components/layout/FormSheet'
import { FormField, TextInput } from '@/components/ui/FormField'
import { SearchSelect } from '@/components/ui/SearchSelect'
import { Button } from '@/components/ui/Button'
import { LineItemGrid, blankProductLine } from '@/components/documents/LineItemGrid'
import { api, ApiError } from '@/lib/api'
import { useToast } from '@/components/ui/Toast'
import { toDateInput } from '@/lib/format'

export default function NewBillPage() {
  const router = useRouter()
  const { push } = useToast()

  const [vendor, setVendor] = useState(null)
  const [billDate, setBillDate] = useState(toDateInput(new Date()))
  const [dueDate, setDueDate] = useState('')
  const [lines, setLines] = useState([blankProductLine()])
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  const canSubmit = vendor && lines.length > 0 && lines.every((l) => l.productId && Number(l.quantity) > 0)

  const submit = async (e) => {
    e.preventDefault()
    setError('')
    if (!canSubmit) return
    setSaving(true)
    try {
      const bill = await api.post('/bills', {
        vendorId: vendor.id,
        billDate,
        dueDate: dueDate || undefined,
        lines: lines.map((l) => ({ productId: l.productId, quantity: Number(l.quantity), unitPrice: Number(l.unitPrice), taxRate: Number(l.taxRate) })),
      })
      push(`${bill.number} created as draft`, { type: 'success' })
      router.replace(`/bills/${bill.id}`)
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not create bill')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="flex h-full flex-col">
      <ControlPanel breadcrumb="Purchase" title="New Vendor Bill" />
      <form onSubmit={submit} className="flex-1 overflow-y-auto p-4 sm:p-6">
        <FormSheet className="max-w-[1100px]">
          <FormSection>
            <FormGrid>
              <FormField label="Vendor" required>
                <SearchSelect path="/contacts" resolvedOption={vendor} onChange={setVendor} placeholder="Select vendor" />
              </FormField>
              <FormField label="Bill Date" required>
                <TextInput type="date" value={billDate} onChange={(e) => setBillDate(e.target.value)} required />
              </FormField>
              <FormField label="Due Date">
                <TextInput type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} min={billDate} />
              </FormField>
            </FormGrid>
          </FormSection>

          <FormSection title="Bill Lines">
            <LineItemGrid lines={lines} onChange={setLines} />
          </FormSection>

          {error && <p className="mt-3 rounded-sm bg-state-overdue/10 px-2 py-1.5 text-xs text-state-overdue">{error}</p>}

          <div className="mt-5 flex items-center justify-end gap-2 border-t border-line pt-4">
            <Button type="button" variant="ghost" onClick={() => router.back()}>Cancel</Button>
            <Button type="submit" variant="primary" loading={saving} disabled={!canSubmit}>Save Draft</Button>
          </div>
        </FormSheet>
      </form>
    </div>
  )
}
