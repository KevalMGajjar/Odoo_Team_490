import { pbkdf2Sync } from 'node:crypto'

/**
 * Server-side twin of frontend/lib/password.js.
 *
 * Clients derive PBKDF2-SHA256(password, salt = loginId) and send that; the
 * server bcrypts the result. This exists so the seed script and the
 * verification harnesses can produce the same value a browser would — without
 * it they'd write bcrypt(plaintext) and nothing could sign in.
 *
 * These parameters MUST stay identical to the browser and the Flutter app.
 * Changing any of them invalidates every stored password.
 */
const ITERATIONS = 100_000
const KEY_BYTES = 32

export function derivePassword(loginId, password) {
  const salt = String(loginId ?? '').trim().toLowerCase()
  return pbkdf2Sync(password, salt, ITERATIONS, KEY_BYTES, 'sha256').toString('hex')
}
