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

const STAGES = [{ value: 'draft', label: 'Draft' }, { value: 'confirmed', label: 'Confirmed' }]

export default function SalesOrderDetailPage() {
  const { id } = useParams()
  const router = useRouter()
  const { user } = useAuth()
  const { push } = useToast()
  const { data: so, loading, error, reload } = useApiGet(`/sales-orders/${id}`)
  const [working, setWorking] = useState(false)

  const confirm = async () => {
    setWorking(true)
    try {
      await api.post(`/sales-orders/${id}/confirm`)
      push('Sales order confirmed', { type: 'success' })
      reload()
    } catch (err) {
      push(err instanceof ApiError ? err.message : 'Could not confirm', { type: 'error' })
    } finally {
      setWorking(false)
    }
  }

  const createInvoice = async () => {
    setWorking(true)
    try {
      const inv = await api.post(`/sales-orders/${id}/create-invoice`)
      push(`Draft invoice ${inv.number} created`, { type: 'success' })
      router.push(`/invoices/${inv.id}`)
    } catch (err) {
      push(err instanceof ApiError ? err.message : 'Could not create invoice', { type: 'error' })
      setWorking(false)
    }
  }

  if (loading) {
    return (
      <div className="flex h-full flex-col">
        <ControlPanel breadcrumb="Sales" title="Loading…" />
        <div className="p-6"><div className="form-sheet"><Skeleton className="h-64" /></div></div>
      </div>
    )
  }
  if (error || !so) {
    return (
      <div className="flex h-full flex-col">
        <ControlPanel breadcrumb="Sales" title="Not found" />
        <div className="p-6"><p className="text-sm text-state-overdue">Sales order not found.</p></div>
      </div>
    )
  }

  const lines = so.lines.map((l) => ({ ...l, product: l.product }))

  return (
    <div className="flex h-full flex-col">
      <ControlPanel
        breadcrumb="Sales"
        title={so.number}
        actions={
          <>
            <Statusbar stages={STAGES} current={so.state} />
            {canWrite(user?.role) && so.state === 'draft' && (
              <Button variant="primary" size="sm" onClick={confirm} loading={working}>Confirm</Button>
            )}
            {canWrite(user?.role) && so.state === 'confirmed' && so.invoices.length === 0 && (
              <Button variant="primary" size="sm" onClick={createInvoice} loading={working}>Create Invoice</Button>
            )}
          </>
        }
      />

      <div className="flex-1 overflow-y-auto p-4 sm:p-6">
        <FormSheet className="max-w-[1100px]">
          <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
            <p className="text-xl font-semibold text-ink">{so.number}</p>
            {so.invoices.length > 0 && (
              <div className="flex gap-1.5">
                {so.invoices.map((inv) => (
                  <Link key={inv.id} href={`/invoices/${inv.id}`} className="rounded-sm bg-brand-light px-2 py-1 text-xs text-brand hover:underline">
                    Invoice: {inv.number}
                  </Link>
                ))}
              </div>
            )}
          </div>

          <FormSection>
            <FormGrid>
              <FormField label="Customer"><TextInput value={so.customer?.name ?? ''} disabled /></FormField>
              <FormField label="Order Date"><TextInput value={formatDate(so.orderDate)} disabled /></FormField>
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
