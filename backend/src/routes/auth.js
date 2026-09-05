import express from 'express'
import bcrypt from 'bcryptjs'
import crypto from 'node:crypto'
import { prisma } from '../lib/prisma.js'
import { unauthorized, conflict, invalidField, notFound } from '../lib/errors.js'
import { validate } from '../middleware/validate.js'
import { verifyJWT, signToken, setAuthCookie, clearAuthCookie } from '../middleware/auth.js'
import { writeAuditLog, AUDIT_ACTIONS } from '../middleware/audit.js'
import { signupSchema, loginSchema, forgotSchema, resetSchema } from '../schemas/auth.js'

const router = express.Router()

const publicUser = (u) => ({
  id: u.id, name: u.name, loginId: u.loginId, email: u.email, role: u.role,
  contactId: u.contactId ?? null, status: u.status,
})

// ─────────────────────────── signup ───────────────────────────
// Self-service always creates the LEAST-privileged role, `user`. An admin
// promotes them to Accountant (or links a contact for portal access) via
// PUT /users/:id. Signup deliberately cannot choose its own role — letting the
// client pick would be straightforward privilege escalation.
router.post('/signup', validate(signupSchema), async (req, res, next) => {
  try {
    const { name, loginId, email, password } = req.body

    const existingEmail = await prisma.user.findUnique({ where: { email } })
    if (existingEmail) throw conflict('An account with this email already exists')
    const existingLoginId = await prisma.user.findUnique({ where: { loginId } })
    if (existingLoginId) throw invalidField('loginId', 'This Login ID is already taken')

    const user = await prisma.$transaction(async (tx) => {
      const created = await tx.user.create({
        data: { name, loginId, email, password: await bcrypt.hash(password, 10), role: 'user' },
      })
      await writeAuditLog(tx, {
        action: AUDIT_ACTIONS.user_registered,
        entity_type: 'user', entity_id: created.id,
        new_value: { loginId, email, role: 'user' }, performed_by: created.id,
      })
      return created
    })

    const token = signToken(user)
    setAuthCookie(res, token)
    // The token is also returned in the body so non-browser clients (the
    // companion view-only app) can hold it and send `Authorization: Bearer`.
    res.status(201).json({ user: publicUser(user), token })
  } catch (err) { next(err) }
})

// ─────────────────────────── login ────────────────────────────
router.post('/login', validate(loginSchema), async (req, res, next) => {
  try {
    const { loginId, password } = req.body
    const user = await prisma.user.findUnique({ where: { loginId } })

    // Same message either way — never reveal whether a Login ID is registered.
    if (!user || !(await bcrypt.compare(password, user.password))) {
      throw unauthorized('Incorrect Login ID or password')
    }
    if (user.status === 'archived') throw unauthorized('This account has been deactivated')

    const token = signToken(user)
    setAuthCookie(res, token)
    // Browser clients use the httpOnly cookie and can ignore `token`.
    // Native / other-origin clients store it and send `Authorization: Bearer <token>`.
    res.json({ user: publicUser(user), token, expiresIn: process.env.JWT_EXPIRES_IN || '7d' })
  } catch (err) { next(err) }
})

// ─────────────────────────── session ──────────────────────────
router.post('/logout', (req, res) => {
  clearAuthCookie(res)
  res.json({ message: 'Signed out' })
})

router.get('/me', verifyJWT, async (req, res, next) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.user.id },
      include: { contact: { select: { id: true, name: true, type: true } } },
    })
    if (!user || user.status === 'archived') throw unauthorized('Session is no longer valid')
    res.json({ user: { ...publicUser(user), contact: user.contact } })
  } catch (err) { next(err) }
})

// ──────────────────── forgotten password ─────────────────────
/**
 * Email delivery is deliberately stubbed to a local `outbox` table so nothing
 * leaves the machine — the app must work with no internet. The token flow
 * itself is real: a 6-digit code, hashed at rest, expiring in 15 minutes.
 * In development the code is also returned in the response so the flow is
 * demonstrable without an inbox.
 */
router.post('/forgot', validate(forgotSchema), async (req, res, next) => {
  try {
    const { email } = req.body
    const user = await prisma.user.findUnique({ where: { email } })

    // Always answer identically, so this cannot be used to enumerate accounts.
    const generic = { message: 'If that email is registered, a reset code has been sent' }
    if (!user) return res.json(generic)

    const otp = String(crypto.randomInt(0, 1_000_000)).padStart(6, '0')
    const otpHash = await bcrypt.hash(otp, 10)

    await prisma.$transaction(async (tx) => {
      await tx.user.update({
        where: { id: user.id },
        data: { resetOtp: otpHash, resetOtpExpires: new Date(Date.now() + 15 * 60 * 1000) },
      })
      await tx.outbox.create({
        data: {
          toEmail: email,
          subject: 'Urban Furniture — password reset code',
          body: `Your password reset code is ${otp}. It expires in 15 minutes.`,
        },
      })
    })

    res.json({
      ...generic,
      ...(process.env.NODE_ENV === 'development' ? { devOtp: otp } : {}),
    })
  } catch (err) { next(err) }
})

router.post('/reset', validate(resetSchema), async (req, res, next) => {
  try {
    const { email, otp, password } = req.body
    const user = await prisma.user.findUnique({ where: { email } })

    if (!user?.resetOtp || !user.resetOtpExpires) {
      throw invalidField('otp', 'No reset is pending for this account')
    }
    if (user.resetOtpExpires < new Date()) {
      throw invalidField('otp', 'This code has expired — request a new one')
    }
    if (!(await bcrypt.compare(otp, user.resetOtp))) {
      throw invalidField('otp', 'That code is not correct')
    }

    await prisma.$transaction(async (tx) => {
      await tx.user.update({
        where: { id: user.id },
        data: {
          password: await bcrypt.hash(password, 10),
          resetOtp: null,
          resetOtpExpires: null,
        },
      })
      await writeAuditLog(tx, {
        action: AUDIT_ACTIONS.password_reset,
        entity_type: 'user', entity_id: user.id, performed_by: user.id,
      })
    })

    res.json({ message: 'Password updated — you can now sign in' })
  } catch (err) { next(err) }
})

// ─────────── development convenience: the seeded demo logins ───────────
router.get('/demo-accounts', async (req, res, next) => {
  try {
    if (process.env.NODE_ENV !== 'development') throw notFound('Route')
    const users = await prisma.user.findMany({
      where: { role: { in: ['admin', 'accountant'] } },
      select: { name: true, loginId: true, role: true },
      orderBy: { role: 'asc' },
    })
    const portal = await prisma.user.findFirst({
      where: { role: 'user' }, select: { name: true, loginId: true, role: true },
    })
    res.json({ accounts: [...users, ...(portal ? [portal] : [])], password: 'demo123' })
  } catch (err) { next(err) }
})

export default router
