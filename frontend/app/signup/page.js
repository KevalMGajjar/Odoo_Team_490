'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { useAuth, ApiError } from '@/lib/auth'
import { FormField, TextInput } from '@/components/ui/FormField'
import { Button } from '@/components/ui/Button'
import { useGuardedAction } from '@/lib/useGuardedAction'
import { api } from '@/lib/api'
import { derivePassword, passwordStrengthError } from '@/lib/password'
import { VerifyCodeScreen } from '@/components/auth/VerifyCodeScreen'

/** Self-service sign-up always creates the least-privileged role. Admin and
 *  Accountant accounts are provisioned by an admin; Portal Users come from the
 *  Contact master. */
export default function SignUpPage() {
  const { verifyLogin } = useAuth()
  const router = useRouter()
  const [name, setName] = useState('')
  const [loginId, setLoginId] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [errors, setErrors] = useState({})
  const [error, setError] = useState('')
  // Creating the account does not sign you in — it emails a code that proves
  // you can read the address, because every later sign-in needs one too.
  const [challenge, setChallenge] = useState(null)
  const [otp, setOtp] = useState('')

  const [submit, loading] = useGuardedAction(async (e) => {
    e.preventDefault()
    setError('')
    setErrors({})
    try {
      const weak = passwordStrengthError(password)
      if (weak) { setErrors({ password: weak }); return }
      if (password !== confirmPassword) { setErrors({ confirmPassword: 'Passwords do not match' }); return }

      const derived = await derivePassword(loginId, password)
      const res = await api.post('/auth/signup', {
        name, loginId, email,
        // Both are derived so the server compares like with like.
        password: derived,
        confirmPassword: password === confirmPassword ? derived : await derivePassword(loginId, confirmPassword),
      })
      setChallenge(res)
      setOtp(res.devOtp ?? '')
    } catch (err) {
      if (err instanceof ApiError && err.errors?.length) {
        setErrors(err.fieldErrorMap())
      } else {
        setError(err instanceof ApiError ? err.message : 'Could not create your account')
      }
    }
  })

  const [doVerify, verifying] = useGuardedAction(async (e) => {
    e.preventDefault()
    setError('')
    try {
      const user = await verifyLogin(challenge.challengeId, otp)
      router.replace(user.role === 'user' ? '/portal' : '/dashboard')
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Something went wrong')
    }
  })

  if (challenge) {
    return (
      <VerifyCodeScreen
        challenge={challenge}
        otp={otp}
        setOtp={setOtp}
        error={error}
        loading={verifying}
        onSubmit={doVerify}
        title="Confirm your email"
        // The account already exists; only the code is outstanding. Sending
        // them back to a prefilled form would invite a second signup attempt
        // that can only fail on a duplicate Login ID.
        onBack={() => router.replace('/login')}
        backLabel="Back to sign in"
      />
    )
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-surface-bg px-4 py-10">
      <div className="w-full max-w-sm">
        <div className="mb-6 flex items-center justify-center gap-2">
          <span className="h-8 w-8 rounded-sm bg-brand" aria-hidden />
          <span className="text-lg font-semibold text-ink">Urban Furniture</span>
        </div>

        <form onSubmit={submit} className="form-sheet max-w-none p-6">
          <h1 className="mb-1 text-md font-semibold text-ink">Create an account</h1>
          <p className="mb-5 text-xs text-ink-muted">
            Creates a basic account. An administrator grants access to masters, transactions and reports.
          </p>

          <FormField label="Name" error={errors.name} className="mb-3">
            <TextInput value={name} onChange={(e) => setName(e.target.value)} autoFocus required />
          </FormField>

          <FormField label="Login ID" hint="6-12 letters/numbers" error={errors.loginId} className="mb-3">
            <TextInput value={loginId} onChange={(e) => setLoginId(e.target.value)} required />
          </FormField>

          <FormField label="Email" error={errors.email} className="mb-3">
            <TextInput type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
          </FormField>

          <FormField label="Password" hint="At least 8 characters, upper + lower case, one special character" error={errors.password} className="mb-3">
            <TextInput type="password" value={password} onChange={(e) => setPassword(e.target.value)} required />
          </FormField>

          <FormField label="Re-enter Password" error={errors.confirmPassword} className="mb-4">
            <TextInput type="password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} required />
          </FormField>

          {error && <p className="mb-3 rounded-sm bg-state-overdue/10 px-2 py-1.5 text-xs text-state-overdue">{error}</p>}

          <Button type="submit" variant="primary" className="w-full" loading={loading}>
            Create account
          </Button>
        </form>

        <p className="mt-3 text-center text-xs text-ink-faint">
          Already have an account? <Link href="/login" className="text-secondary hover:underline">Sign in</Link>
        </p>
      </div>
    </div>
  )
}
