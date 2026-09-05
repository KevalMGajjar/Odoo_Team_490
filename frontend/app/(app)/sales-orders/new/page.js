'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { ScanLine } from 'lucide-react'
import { ControlPanel } from '@/components/layout/ControlPanel'
import { FormSheet, FormGrid, FormSection } from '@/components/layout/FormSheet'
import { FormField, TextInput } from '@/components/ui/FormField'
import { SearchSelect } from '@/components/ui/SearchSelect'
import { Button } from '@/components/ui/Button'
import { LineItemGrid, blankProductLine } from '@/components/documents/LineItemGrid'
import { ScanModal } from '@/components/ocr/ScanModal'
import { api, ApiError } from '@/lib/api'
import { useToast } from '@/components/ui/Toast'
import { toDateInput } from '@/lib/format'
import { useGuardedAction } from '@/lib/useGuardedAction'

export default function NewSalesOrderPage() {
  const router = useRouter()
  const { push } = useToast()

  const [customer, setCustomer] = useState(null)
  const [orderDate, setOrderDate] = useState(toDateInput(new Date()))
  const [lines, setLines] = useState([blankProductLine()])
  const [error, setError] = useState('')
  const [scanOpen, setScanOpen] = useState(false)

  const canSubmit = customer && lines.length > 0 && lines.every((l) => l.productId && Number(l.quantity) > 0)

  const [submit, saving] = useGuardedAction(async (e) => {
    e.preventDefault()
    setError('')
    if (!canSubmit) return
    try {
      const so = await api.post('/sales-orders', {
        customerId: customer.id,
        orderDate,
        lines: lines.map((l) => ({
          productId: l.productId, quantity: Number(l.quantity), unitPrice: Number(l.unitPrice), taxRate: Number(l.taxRate),
          analyticAccountId: l.analyticAccountId || undefined,
        })),
      })
      push(`${so.number} created`, { type: 'success' })
      router.replace(`/sales-orders/${so.id}`)
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not create sales order')
    }
  })

  return (
    <div className="flex h-full flex-col">
      <ControlPanel
        breadcrumb="Sales"
        title="New Sales Order"
        actions={<Button type="button" variant="secondary" size="sm" icon={ScanLine} onClick={() => setScanOpen(true)}>Scan Invoice</Button>}
      />
      <form onSubmit={submit} className="flex-1 overflow-y-auto p-4 sm:p-6">
        <FormSheet className="max-w-[1100px]">
          <FormSection>
            <FormGrid>
              <FormField label="Customer" required>
                <SearchSelect path="/contacts" resolvedOption={customer} onChange={setCustomer} placeholder="Select customer" />
              </FormField>
              <FormField label="SO Date" required>
                <TextInput type="date" value={orderDate} onChange={(e) => setOrderDate(e.target.value)} required />
              </FormField>
            </FormGrid>
          </FormSection>

          <FormSection title="Order Lines">
            <LineItemGrid lines={lines} onChange={setLines} showAccountColumn={false} />
          </FormSection>

          {error && <p className="mt-3 rounded-sm bg-state-overdue/10 px-2 py-1.5 text-xs text-state-overdue">{error}</p>}

          <div className="mt-5 flex items-center justify-end gap-2 border-t border-line pt-4">
            <Button type="button" variant="ghost" onClick={() => router.back()}>Cancel</Button>
            <Button type="submit" variant="primary" loading={saving} disabled={!canSubmit}>Create Sales Order</Button>
          </div>
        </FormSheet>
      </form>

      <ScanModal
        open={scanOpen}
        onClose={() => setScanOpen(false)}
        partyRole="customer"
        onFill={({ party, date, lines: scannedLines }) => {
          setCustomer(party)
          if (date) setOrderDate(date)
          setLines(scannedLines)
        }}
      />
    </div>
  )
}
