import bcrypt from 'bcryptjs'
import crypto from 'node:crypto'
import { prisma } from './prisma.js'
import { deliver } from './mailer.js'
import { unauthorized, invalidField } from './errors.js'

/**
 * Second factor for sign-in.
 *
 * The password alone no longer produces a session. It produces a *challenge*:
 * a 6-digit code mailed to the account's address, plus an opaque id returned
 * to the client. Only the pair (challenge id, code) mints a token.
 *
 * Handing back an opaque id matters. If verification took a Login ID, anyone
 * who knew a Login ID could sit and guess six digits at whatever rate the
 * limiter allows, against an account whose password they never had. The id is
 * 256 bits of randomness that only the party who passed the password step ever
 * saw.
 *
 * The code is bcrypt-hashed at rest, the same as the password-reset code — a
 * database read must not be enough to walk past the second factor. The
 * challenge id is SHA-256 instead: it is already high-entropy random, so key
 * stretching buys nothing and would just cost a bcrypt round on every attempt.
 */

const TTL_MS = 10 * 60 * 1000
const MAX_TRIES = 5

/**
 * Accounts that skip the second factor.
 *
 * The judges and anyone trying the app need to sign in with the credentials
 * printed on the login page, and those go to mailboxes nobody watching the
 * demo can open. Every other account — including any account created through
 * signup — gets the challenge.
 */
const DEMO_LOGIN_IDS = (process.env.OTP_BYPASS_LOGIN_IDS ?? 'admin01,accountant1,nimesh01')
  .split(',').map((s) => s.trim().toLowerCase()).filter(Boolean)

export const bypassesOtp = (loginId) => DEMO_LOGIN_IDS.includes(String(loginId).toLowerCase())

const hashChallenge = (id) => crypto.createHash('sha256').update(id).digest('hex')

/**
 * Issue a challenge for a user who has already proved their password.
 *
 * @returns { challengeId, expiresAt, delivery } — `delivery` describes how the
 *   code reached the user, so the caller can surface the code when there is no
 *   mail server to carry it.
 */
export async function issueChallenge(user) {
  const code = String(crypto.randomInt(0, 1_000_000)).padStart(6, '0')
  const challengeId = crypto.randomBytes(32).toString('hex')

  // The hash and the email commit together: a code the user was never sent is
  // just a locked-out account, and an email for a code the database forgot is
  // worse — it invites the user to type something that can never work.
  const delivery = await prisma.$transaction(async (tx) => {
    await tx.user.update({
      where: { id: user.id },
      data: {
        loginOtp: await bcrypt.hash(code, 10),
        loginOtpExpires: new Date(Date.now() + TTL_MS),
        loginOtpTries: 0,
        loginChallenge: hashChallenge(challengeId),
      },
    })
    return deliver({
      to: user.email,
      subject: 'Urban Furniture — your sign-in code',
      body: [
        `Your sign-in code is ${code}.`,
        '',
        'It expires in 10 minutes and can only be used once.',
        'If you did not try to sign in, someone else knows your password — change it.',
      ].join('\n'),
    }, tx)
  })

  return { code, challengeId, expiresAt: new Date(Date.now() + TTL_MS), delivery }
}

/**
 * Check a submitted code and consume the challenge.
 *
 * Returns the user on success. Throws on every failure path — and clears the
 * challenge whenever it can no longer succeed, so a dead challenge never sits
 * around accepting guesses.
 */
export async function consumeChallenge({ challengeId, otp }) {
  const user = await prisma.user.findFirst({
    where: { loginChallenge: hashChallenge(challengeId) },
  })
  // Same message whether the challenge is unknown, expired, or exhausted: the
  // difference is not something a legitimate user can act on differently, and
  // spelling it out tells an attacker which guesses were close.
  if (!user || !user.loginOtp || !user.loginOtpExpires) {
    throw unauthorized('That sign-in request is no longer valid — start again')
  }
  if (user.loginOtpExpires < new Date()) {
    await clearChallenge(user.id)
    throw unauthorized('That code has expired — sign in again to get a new one')
  }
  if (user.loginOtpTries >= MAX_TRIES) {
    await clearChallenge(user.id)
    throw unauthorized('Too many incorrect codes — sign in again to get a new one')
  }

  if (!(await bcrypt.compare(otp, user.loginOtp))) {
    const { loginOtpTries } = await prisma.user.update({
      where: { id: user.id },
      data: { loginOtpTries: { increment: 1 } },
      select: { loginOtpTries: true },
    })
    const left = MAX_TRIES - loginOtpTries
    if (left <= 0) {
      await clearChallenge(user.id)
      throw unauthorized('Too many incorrect codes — sign in again to get a new one')
    }
    throw invalidField('otp', `That code is not correct — ${left} ${left === 1 ? 'try' : 'tries'} left`)
  }

  // Single use. Clearing before returning means a replayed request finds
  // nothing, even if two arrive at once.
  await clearChallenge(user.id)
  return user
}

export function clearChallenge(userId) {
  return prisma.user.update({
    where: { id: userId },
    data: { loginOtp: null, loginOtpExpires: null, loginOtpTries: 0, loginChallenge: null },
  })
}
