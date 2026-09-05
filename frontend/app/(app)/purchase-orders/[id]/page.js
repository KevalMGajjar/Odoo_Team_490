'use client'

import { useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { ControlPanel } from '@/components/layout/ControlPanel'
import { FormSheet, FormGrid, FormSection } from '@/components/layout/FormSheet'
import { FormField, TextInput } from '@/components/ui/FormField'
import { LineItemGrid } from '@/components/documents/LineItemGrid'
import { Statusbar } from '@/components/documents/Statusbar'
import { Skeleton } from '@/components/ui/Skeleton'
import { Button } from '@/components/ui/Button'
import { useApiGet } from '@/lib/useApi'
import { useAuth, canWrite } from '@/lib/auth'
import { api, ApiError } from '@/lib/api'
import { useToast } from '@/components/ui/Toast'
import { formatDate } from '@/lib/format'

const STAGES = [
  { value: 'draft', label: 'Draft' },
  { value: 'confirmed', label: 'Confirmed' },
]

export default function PurchaseOrderDetailPage() {
  const { id } = useParams()
  const router = useRouter()
  const { user } = useAuth()
  const { push } = useToast()
  const { data: po, loading, error, reload } = useApiGet(`/purchase-orders/${id}`)
  const [working, setWorking] = useState(false)

  const confirm = async () => {
    setWorking(true)
    try {
      await api.post(`/purchase-orders/${id}/confirm`)
      push('Purchase order confirmed', { type: 'success' })
      reload()
    } catch (err) {
      push(err instanceof ApiError ? err.message : 'Could not confirm', { type: 'error' })
    } finally {
      setWorking(false)
    }
  }

  const createBill = async () => {
    setWorking(true)
    try {
      const bill = await api.post(`/purchase-orders/${id}/create-bill`)
      push(`Draft bill ${bill.number} created`, { type: 'success' })
      router.push(`/bills/${bill.id}`)
    } catch (err) {
      push(err instanceof ApiError ? err.message : 'Could not create bill', { type: 'error' })
      setWorking(false)
    }
  }

  if (loading) {
    return (
      <div className="flex h-full flex-col">
        <ControlPanel breadcrumb="Purchase" title="Loading…" />
        <div className="p-6"><div className="form-sheet"><Skeleton className="h-64" /></div></div>
      </div>
    )
  }
  if (error || !po) {
    return (
      <div className="flex h-full flex-col">
        <ControlPanel breadcrumb="Purchase" title="Not found" />
        <div className="p-6"><p className="text-sm text-state-overdue">Purchase order not found.</p></div>
      </div>
    )
  }

  const lines = po.lines.map((l) => ({ ...l, product: l.product }))

  return (
    <div className="flex h-full flex-col">
      <ControlPanel
        breadcrumb="Purchase"
        title={po.number}
        actions={
          <>
            <Statusbar stages={STAGES} current={po.state} />
            {canWrite(user?.role) && po.state === 'draft' && (
              <Button variant="primary" size="sm" onClick={confirm} loading={working}>Confirm</Button>
            )}
            {canWrite(user?.role) && po.state === 'confirmed' && po.bills.length === 0 && (
              <Button variant="primary" size="sm" onClick={createBill} loading={working}>Create Bill</Button>
            )}
          </>
        }
      />

      <div className="flex-1 overflow-y-auto p-4 sm:p-6">
        <FormSheet className="max-w-[1100px]">
          <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
            <p className="text-xl font-semibold text-ink">{po.number}</p>
            {po.bills.length > 0 && (
              <div className="flex gap-1.5">
                {po.bills.map((b) => (
                  <Link key={b.id} href={`/bills/${b.id}`} className="rounded-sm bg-brand-light px-2 py-1 text-xs text-brand hover:underline">
                    Bill: {b.number}
                  </Link>
                ))}
              </div>
            )}
          </div>

          <FormSection>
            <FormGrid>
              <FormField label="Vendor"><TextInput value={po.vendor?.name ?? ''} disabled /></FormField>
              <FormField label="Order Date"><TextInput value={formatDate(po.orderDate)} disabled /></FormField>
            </FormGrid>
          </FormSection>

          <FormSection title="Order Lines">
            <LineItemGrid lines={lines} onChange={() => {}} disabled />
          </FormSection>
        </FormSheet>
      </div>
    </div>
  )
}
