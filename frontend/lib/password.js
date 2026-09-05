'use client'

/**
 * Client-side password derivation.
 *
 * The browser never sends the typed password. It sends PBKDF2-SHA256 of it,
 * salted with the Login ID, and the server bcrypts *that* before storing it.
 * Same approach password managers like Bitwarden use.
 *
 * What this buys: the server (and its logs, and anyone reading a request
 * body server-side) never sees the actual secret, so a password reused on
 * another site isn't exposed by this one. The Network tab shows a hash
 * instead of the password.
 *
 * What it does NOT buy: the derived value is still password-equivalent *for
 * this site* — anyone who captures it can replay it. Only TLS prevents that,
 * so HTTPS in production remains mandatory. Client-side derivation is defence
 * in depth, never a replacement for it.
 *
 * The salt is the Login ID rather than a constant so two users with the same
 * password don't transmit the same value.
 */

const ITERATIONS = 100_000
const KEY_BITS = 256

const RULES = [
  { test: (p) => p.length >= 8, message: 'at least 8 characters' },
  { test: (p) => /[a-z]/.test(p), message: 'a lowercase letter' },
  { test: (p) => /[A-Z]/.test(p), message: 'an uppercase letter' },
  { test: (p) => /[^A-Za-z0-9]/.test(p), message: 'a special character' },
]

/**
 * Every strength rule the password fails, as one sentence — or null if it
 * passes.
 *
 * This has to live here now: the server only ever receives the derived hash,
 * so it cannot judge strength. Reporting all failures at once matters because
 * the old server-side check surfaced them one at a time.
 */
export function passwordStrengthError(password) {
  const missing = RULES.filter((r) => !r.test(password ?? '')).map((r) => r.message)
  if (missing.length === 0) return null
  return `Password needs ${missing.join(', ')}.`
}

/** Hex-encoded PBKDF2 of `password`, salted with `loginId`. */
export async function derivePassword(loginId, password) {
  // Without WebCrypto (non-secure origin, ancient browser) send the password
  // as-is rather than a weak home-made hash — the server bcrypts either way,
  // so login still works and TLS is doing the real protecting.
  if (typeof crypto === 'undefined' || !crypto.subtle) return password

  const enc = new TextEncoder()
  const key = await crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveBits'])
  const bits = await crypto.subtle.deriveBits(
    {
      name: 'PBKDF2',
      salt: enc.encode(String(loginId ?? '').trim().toLowerCase()),
      iterations: ITERATIONS,
      hash: 'SHA-256',
    },
    key,
    KEY_BITS,
  )
  return [...new Uint8Array(bits)].map((b) => b.toString(16).padStart(2, '0')).join('')
}
