'use client'

import { ControlPanel } from '@/components/layout/ControlPanel'
import { UserForm } from '@/components/users/UserForm'

export default function NewUserPage() {
  return (
    <div className="flex h-full flex-col">
      <ControlPanel breadcrumb="Admin" title="Create User" />
      <div className="flex-1 overflow-y-auto p-4 sm:p-6">
        <UserForm />
      </div>
    </div>
  )
}
