'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { FormField, TextInput } from '@/components/ui/FormField'
import { Button } from '@/components/ui/Button'
import { useGuardedAction } from '@/lib/useGuardedAction'
import { api, ApiError } from '@/lib/api'

/**
 * Email delivery is stubbed to a local outbox — nothing leaves the machine.
 * In development the API also returns the code directly (`devOtp`) so the
 * flow is demonstrable without a real inbox.
 */
export default function ForgotPasswordPage() {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [error, setError] = useState('')
  const [sent, setSent] = useState(false)
  const [devOtp, setDevOtp] = useState(null)

  const [submit, loading] = useGuardedAction(async (e) => {
    e.preventDefault()
    setError('')
    try {
      const res = await api.post('/auth/forgot', { email })
      setSent(true)
      setDevOtp(res.devOtp ?? null)
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
          <h1 className="mb-1 text-md font-semibold text-ink">Forgot your password?</h1>
          <p className="mb-5 text-xs text-ink-muted">Enter your account email and we&apos;ll send a 6-digit reset code.</p>

          {sent ? (
            <div className="space-y-3">
              <p className="rounded-sm bg-state-paid/10 px-2 py-1.5 text-xs text-state-paid">
                If that email is registered, a reset code has been sent.
              </p>
              {devOtp && (
                <p className="rounded-sm bg-surface-subtle px-2 py-1.5 text-xs text-ink-muted">
                  Dev mode — code: <span className="font-mono font-semibold text-ink">{devOtp}</span>
                </p>
              )}
              <Button
                type="button"
                variant="primary"
                className="w-full"
                onClick={() => router.push(`/reset-password?email=${encodeURIComponent(email)}`)}
              >
                Enter code
              </Button>
            </div>
          ) : (
            <form onSubmit={submit}>
              <FormField label="Email" className="mb-4">
                <TextInput type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoFocus required />
              </FormField>
              {error && <p className="mb-3 rounded-sm bg-state-overdue/10 px-2 py-1.5 text-xs text-state-overdue">{error}</p>}
              <Button type="submit" variant="primary" className="w-full" loading={loading}>
                Send reset code
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
