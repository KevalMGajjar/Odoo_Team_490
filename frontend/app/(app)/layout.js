'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/lib/auth'
import { AppShell } from '@/components/layout/AppShell'

/** Route guard for every internal (non-portal) screen. */
export default function AppLayout({ children }) {
  const { user, loading } = useAuth()
  const router = useRouter()

  useEffect(() => {
    if (loading) return
    if (!user) router.replace('/login')
    else if (user.role === 'user') router.replace('/portal')
  }, [user, loading, router])

  if (loading || !user || user.role === 'user') {
    return (
      <div className="flex h-screen items-center justify-center bg-surface-bg">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-line border-t-brand" />
      </div>
    )
  }

  return <AppShell>{children}</AppShell>
}
