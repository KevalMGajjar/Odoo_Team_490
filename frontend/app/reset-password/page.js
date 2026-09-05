'use client'

import { Suspense, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { FormField, TextInput } from '@/components/ui/FormField'
import { Button } from '@/components/ui/Button'
import { useGuardedAction } from '@/lib/useGuardedAction'
import { api, ApiError } from '@/lib/api'

export default function ResetPasswordPage() {
  return (
    <Suspense fallback={null}>
      <ResetPasswordForm />
    </Suspense>
  )
}

function ResetPasswordForm() {
  const router = useRouter()
  const params = useSearchParams()
  const [email, setEmail] = useState(params.get('email') ?? '')
  const [otp, setOtp] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [done, setDone] = useState(false)

  const [submit, loading] = useGuardedAction(async (e) => {
    e.preventDefault()
    setError('')
    try {
      await api.post('/auth/reset', { email, otp, password })
      setDone(true)
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Something went wrong')
    }
  })

  return (
    <div className="flex min-h-screen items-center justify-center bg-surface-bg px-4">
      <div className="w-full max-w-sm">
        <div className="mb-6 flex items-center justify-center gap-2">
          <span className="h-8 w-8 rounded-sm bg-brand" aria-hidden />
          <span className="text-lg font-semibold text-ink">Urban Furniture</span>
        </div>

        <div className="form-sheet max-w-none p-6">
          <h1 className="mb-1 text-md font-semibold text-ink">Reset your password</h1>
          <p className="mb-5 text-xs text-ink-muted">Enter the 6-digit code and a new password.</p>

          {done ? (
            <div className="space-y-3">
              <p className="rounded-sm bg-state-paid/10 px-2 py-1.5 text-xs text-state-paid">
                Password updated — you can now sign in.
              </p>
              <Button type="button" variant="primary" className="w-full" onClick={() => router.replace('/login')}>
                Go to sign in
              </Button>
            </div>
          ) : (
            <form onSubmit={submit}>
              <FormField label="Email" className="mb-3">
                <TextInput type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoFocus required />
              </FormField>
              <FormField label="Reset Code" hint="6 digits" className="mb-3">
                <TextInput value={otp} onChange={(e) => setOtp(e.target.value)} maxLength={6} required />
              </FormField>
              <FormField label="New Password" hint="At least 8 characters, upper + lower case, one special character" className="mb-4">
                <TextInput type="password" value={password} onChange={(e) => setPassword(e.target.value)} required />
              </FormField>
              {error && <p className="mb-3 rounded-sm bg-state-overdue/10 px-2 py-1.5 text-xs text-state-overdue">{error}</p>}
              <Button type="submit" variant="primary" className="w-full" loading={loading}>
                Reset password
              </Button>
            </form>
          )}
        </div>

        <p className="mt-3 text-center text-xs text-ink-faint">
          <Link href="/login" className="text-secondary hover:underline">Back to sign in</Link>
        </p>
      </div>
    </div>
  )
}
