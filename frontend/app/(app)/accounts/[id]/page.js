'use client'

import { useParams, useRouter } from 'next/navigation'
import { ControlPanel } from '@/components/layout/ControlPanel'
import { AccountForm } from '@/components/accounts/AccountForm'
import { Skeleton } from '@/components/ui/Skeleton'
import { useApiGet } from '@/lib/useApi'

export default function AccountDetailPage() {
  const { id } = useParams()
  const router = useRouter()
  const { data: account, loading, error } = useApiGet(`/accounts/${id}`)

  return (
    <div className="flex h-full flex-col">
      <ControlPanel breadcrumb="Chart of Accounts" title={loading ? 'Loading…' : account?.name} />
      <div className="flex-1 overflow-y-auto p-4 sm:p-6">
        {loading ? (
          <div className="form-sheet"><Skeleton className="h-64" /></div>
        ) : error ? (
          <div className="form-sheet">
            <p className="text-sm text-state-overdue">Account not found.</p>
            <button className="btn-secondary btn-sm mt-3" onClick={() => router.push('/accounts')}>Back to Accounts</button>
          </div>
        ) : (
          <AccountForm account={account} />
        )}
      </div>
    </div>
  )
}
