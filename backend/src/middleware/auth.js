import jwt from 'jsonwebtoken'
import { unauthorized, forbidden } from '../lib/errors.js'

const COOKIE_NAME = process.env.COOKIE_NAME || 'uf_token'

export const signToken = (user) =>
  jwt.sign(
    { id: user.id, email: user.email, role: user.role, contactId: user.contactId ?? null },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRES_IN || '7d' },
  )

export const setAuthCookie = (res, token) =>
  res.cookie(COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    maxAge: 7 * 24 * 60 * 60 * 1000,
  })

export const clearAuthCookie = (res) => res.clearCookie(COOKIE_NAME)

/** Requires a valid session. Populates req.user. */
export const verifyJWT = (req, res, next) => {
  const token = req.cookies?.[COOKIE_NAME] || req.headers.authorization?.split(' ')[1]
  if (!token) return next(unauthorized('No session — please sign in'))

  try {
    req.user = jwt.verify(token, process.env.JWT_SECRET)
    next()
  } catch {
    next(unauthorized('Session expired or invalid'))
  }
}

/**
 * Role gate. Written so the route line reads as documentation:
 *   router.post('/', verifyJWT, requireRole(['admin', 'invoicing_user']), handler)
 *
 * Per the PS: admin creates/modifies/archives; invoicing_user creates only.
 */
export const requireRole = (allowedRoles = []) => (req, res, next) => {
  if (!req.user) return next(unauthorized())
  if (!allowedRoles.includes(req.user.role)) {
    return next(forbidden('Your role does not permit this action'))
  }
  next()
}

/** Convenience gates matching the role matrix in PLAN.md §8. */
export const canCreate = requireRole(['admin', 'invoicing_user'])
export const adminOnly = requireRole(['admin'])

/**
 * Row-level scoping for portal users.
 *
 * A contact must only ever see their OWN documents. This is enforced in the
 * WHERE clause, not by hiding UI — fetching another contact's invoice by id
 * must return 403/404, never 200.
 */
export const scopeToPartner = (req, field = 'customerId') => {
  if (req.user?.role !== 'contact') return {}
  if (!req.user.contactId) return { [field]: '__no_contact_linked__' }
  return { [field]: req.user.contactId }
}

/** Throw if a fetched record isn't visible to this portal user. */
export const assertOwnership = (req, record, field = 'customerId') => {
  if (req.user?.role !== 'contact') return
  if (!record || record[field] !== req.user.contactId) {
    throw forbidden('You do not have access to this document')
  }
}
