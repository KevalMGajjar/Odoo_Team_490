'use client'

import { AuthProvider } from '@/lib/auth'
import { ToastProvider } from '@/components/ui/Toast'

export function Providers({ children }) {
  return (
    <AuthProvider>
      <ToastProvider>{children}</ToastProvider>
    </AuthProvider>
  )
}
