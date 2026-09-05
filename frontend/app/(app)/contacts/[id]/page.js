'use client'

import { useParams, useRouter } from 'next/navigation'
import { ControlPanel } from '@/components/layout/ControlPanel'
import { ContactForm } from '@/components/contacts/ContactForm'
import { Skeleton } from '@/components/ui/Skeleton'
import { useApiGet } from '@/lib/useApi'

export default function ContactDetailPage() {
  const { id } = useParams()
  const router = useRouter()
  const { data: contact, loading, error } = useApiGet(`/contacts/${id}`)

  return (
    <div className="flex h-full flex-col">
      <ControlPanel breadcrumb="Contact" title={loading ? 'Loading…' : contact?.name} />
      <div className="flex-1 overflow-y-auto p-4 sm:p-6">
        {loading ? (
          <div className="form-sheet"><Skeleton className="h-64" /></div>
        ) : error ? (
          <div className="form-sheet">
            <p className="text-sm text-state-overdue">Contact not found.</p>
            <button className="btn-secondary btn-sm mt-3" onClick={() => router.push('/contacts')}>Back to Contacts</button>
          </div>
        ) : (
          <ContactForm contact={contact} />
        )}
      </div>
    </div>
  )
}
