'use client'

import { useParams, useRouter } from 'next/navigation'
import { ControlPanel } from '@/components/layout/ControlPanel'
import { UserForm } from '@/components/users/UserForm'
import { Skeleton } from '@/components/ui/Skeleton'
import { useApiGet } from '@/lib/useApi'

export default function UserDetailPage() {
  const { id } = useParams()
  const router = useRouter()
  const { data: user, loading, error } = useApiGet(`/users/${id}`)

  return (
    <div className="flex h-full flex-col">
      <ControlPanel breadcrumb="Admin" title={loading ? 'Loading…' : user?.name} />
      <div className="flex-1 overflow-y-auto p-4 sm:p-6">
        {loading ? (
          <div className="form-sheet"><Skeleton className="h-64" /></div>
        ) : error ? (
          <div className="form-sheet">
            <p className="text-sm text-state-overdue">User not found.</p>
            <button className="btn-secondary btn-sm mt-3" onClick={() => router.push('/users')}>Back to Users</button>
          </div>
        ) : (
          <UserForm user={user} />
        )}
      </div>
    </div>
  )
}
