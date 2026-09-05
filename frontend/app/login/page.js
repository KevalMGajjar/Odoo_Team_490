'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { useAuth, ApiError } from '@/lib/auth'
import { FormField, TextInput } from '@/components/ui/FormField'
import { Button } from '@/components/ui/Button'

/**
 * Quick-login buttons are demo-day insurance (IDEAS.md §5.5) — never fumble
 * credentials on stage. Flat brand fill, no gradient, 3px radius throughout.
 */
const DEMO_ACCOUNTS = [
  { label: 'Admin', email: 'admin@urbanfurniture.com', tone: 'bg-brand' },
  { label: 'Invoicing User', email: 'accountant@urbanfurniture.com', tone: 'bg-secondary' },
  { label: 'Viewer (read-only)', email: 'viewer@urbanfurniture.com', tone: 'bg-state-info' },
  { label: 'Contact Portal', email: 'nimesh@example.com', tone: 'bg-state-paid' },
]

export default function LoginPage() {
  const { login } = useAuth()
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('demo123')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const doLogin = async (e, overrideEmail) => {
    e?.preventDefault()
    setError('')
    setLoading(true)
    try {
      const user = await login(overrideEmail ?? email, password)
      router.replace(user.role === 'contact' ? '/portal' : '/dashboard')
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Something went wrong')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-surface-bg px-4">
      <div className="w-full max-w-sm">
        <div className="mb-6 flex items-center justify-center gap-2">
          <span className="h-8 w-8 rounded-sm bg-brand" aria-hidden />
          <span className="text-lg font-semibold text-ink">Urban Furniture</span>
        </div>

        <form onSubmit={doLogin} className="form-sheet max-w-none p-6">
          <h1 className="mb-1 text-md font-semibold text-ink">Sign in</h1>
          <p className="mb-5 text-xs text-ink-muted">Accounting system — double-entry ledger, perpetual inventory.</p>

          <FormField label="Email" className="mb-3">
            <TextInput
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@urbanfurniture.com"
              autoFocus
              required
            />
          </FormField>

          <FormField label="Password" className="mb-4">
            <TextInput
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </FormField>

          {error && <p className="mb-3 rounded-sm bg-state-overdue/10 px-2 py-1.5 text-xs text-state-overdue">{error}</p>}

          <Button type="submit" variant="primary" className="w-full" loading={loading}>
            Sign in
          </Button>

          <div className="mt-5 border-t border-line pt-4">
            <p className="mb-2 text-xs font-medium uppercase tracking-wide text-ink-faint">Quick sign-in (demo)</p>
            <div className="grid grid-cols-2 gap-1.5">
              {DEMO_ACCOUNTS.map((acc) => (
                <button
                  key={acc.email}
                  type="button"
                  onClick={(e) => { setEmail(acc.email); doLogin(e, acc.email) }}
                  disabled={loading}
                  className="flex items-center gap-1.5 rounded-sm border border-line px-2 py-1.5 text-left text-xs text-ink hover:bg-surface-hover disabled:opacity-50"
                >
                  <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${acc.tone}`} />
                  <span className="truncate">{acc.label}</span>
                </button>
              ))}
            </div>
            <p className="mt-2 text-[11px] text-ink-faint">Password for every demo account: demo123</p>
          </div>
        </form>

        <p className="mt-3 text-center text-xs text-ink-faint">
          Forgot your password? <Link href="/forgot-password" className="text-secondary hover:underline">Reset it</Link>
        </p>
      </div>
    </div>
  )
}
