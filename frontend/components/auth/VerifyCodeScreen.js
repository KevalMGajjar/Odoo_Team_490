'use client'

import { Logo } from '@/components/ui/Logo'
import { FormField, TextInput } from '@/components/ui/FormField'
import { Button } from '@/components/ui/Button'

/**
 * The emailed-code step, shared by sign-in and sign-up.
 *
 * Both reach the same place: an account exists, its password is settled, and
 * the only thing left is proving the mailbox. One screen rather than two keeps
 * the wording and the digit handling identical — a second factor that behaves
 * differently depending on how you got there is one people learn to distrust.
 *
 * A full screen rather than a field revealed under the form: by this point the
 * earlier inputs are already accepted, and leaving them on screen invites
 * people to edit them and wonder why nothing changes.
 */
export function VerifyCodeScreen({
  challenge, otp, setOtp, error, loading, onSubmit, onBack,
  title = 'Check your email',
  backLabel = 'Use a different account',
}) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-surface-bg px-4">
      <div className="w-full max-w-sm">
        <div className="mb-6 flex items-center justify-center gap-2">
          <Logo size={32} />
          <span className="text-lg font-semibold text-ink">Urban Furniture</span>
        </div>

        <form onSubmit={onSubmit} className="form-sheet max-w-none p-6">
          <h1 className="mb-1 text-md font-semibold text-ink">{title}</h1>
          <p className="mb-5 text-xs text-ink-muted">
            We sent a 6-digit code to <span className="font-medium text-ink">{challenge.sentTo}</span>.
            It expires in 10 minutes.
          </p>

          <FormField label="Sign-in code" className="mb-4">
            <TextInput
              value={otp}
              // Digits only, capped at six: people paste codes with spaces
              // around them, and a stray character would fail validation for a
              // reason the message can't usefully explain.
              onChange={(e) => setOtp(e.target.value.replace(/\D/g, '').slice(0, 6))}
              inputMode="numeric"
              autoComplete="one-time-code"
              placeholder="000000"
              className="text-center text-lg tracking-[0.4em] tabular-nums"
              autoFocus
              required
            />
          </FormField>

          {challenge.devOtp && (
            <p className="mb-3 rounded-sm bg-state-draft/10 px-2 py-1.5 text-[11px] text-ink-muted">
              No mail server is configured, so the code is shown here:{' '}
              <span className="font-medium tabular-nums text-ink">{challenge.devOtp}</span>
            </p>
          )}

          {error && (
            <p className="mb-3 rounded-sm bg-state-overdue/10 px-2 py-1.5 text-xs text-state-overdue">{error}</p>
          )}

          <Button type="submit" variant="primary" className="w-full" loading={loading} disabled={otp.length !== 6}>
            Verify and continue
          </Button>

          <button
            type="button"
            onClick={onBack}
            className="mt-3 w-full text-center text-xs text-ink-faint hover:text-secondary"
          >
            {backLabel}
          </button>
        </form>
      </div>
    </div>
  )
}
