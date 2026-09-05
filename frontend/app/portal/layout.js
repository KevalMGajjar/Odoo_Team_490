'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/lib/auth'
import { AppShell } from '@/components/layout/AppShell'

/**
 * A completely separate shell for the Contact role — a restricted, real
 * view, not an internal screen with a different label (per the PS's own
 * framing of a customer-facing negotiation/portal screen).
 */
export default function PortalLayout({ children }) {
  const { user, loading } = useAuth()
  const router = useRouter()

  useEffect(() => {
    if (loading) return
    if (!user) router.replace('/login')
    else if (user.role !== 'contact') router.replace('/dashboard')
  }, [user, loading, router])

  if (loading || !user || user.role !== 'contact') {
    return (
      <div className="flex h-screen items-center justify-center bg-surface-bg">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-line border-t-brand" />
      </div>
    )
  }

  return <AppShell>{children}</AppShell>
}
