'use client'

import { ControlPanel } from '@/components/layout/ControlPanel'
import { ContactForm } from '@/components/contacts/ContactForm'

export default function NewContactPage() {
  return (
    <div className="flex h-full flex-col">
      <ControlPanel breadcrumb="Contact" title="New Contact" />
      <div className="flex-1 overflow-y-auto p-4 sm:p-6">
        <ContactForm />
      </div>
    </div>
  )
}
