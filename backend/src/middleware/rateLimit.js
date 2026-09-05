import rateLimit from 'express-rate-limit'

/**
 * Rate limiting.
 *
 * The store is in-memory, which is correct for a single process but does NOT
 * hold across replicas — each would keep its own counters, so N replicas means
 * N times the allowance. Behind a load balancer this needs a shared store
 * (`rate-limit-redis`); that's a deployment change, not a code change, and is
 * called out here rather than silently assumed.
 *
 * Limits are skipped entirely in test runs: the verification harness makes
 * dozens of rapid calls as one client and would otherwise trip them and fail
 * for the wrong reason.
 */

const skip = () => process.env.NODE_ENV === 'test'

const json = (message) => (req, res) => res.status(429).json({ message })

/**
 * Sign-in, signup and password reset.
 *
 * Deliberately strict and counted per IP *and* per Login ID, so one attacker
 * can't spread guesses across many accounts from one address, and can't
 * exhaust a victim's allowance from many addresses either. Successful logins
 * don't count — only failures burn the budget, so a legitimate user working
 * normally never sees this.
 */
export const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  skip,
  skipSuccessfulRequests: true,
  keyGenerator: (req) => {
    const id = String(req.body?.loginId ?? req.body?.email ?? '').trim().toLowerCase()
    return `${req.ip}:${id}`
  },
  handler: json('Too many attempts. Please wait a few minutes and try again.'),
})

/** Everything else — generous enough that normal use never notices. */
export const apiLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 300,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  skip,
  handler: json('You are sending requests too quickly. Please slow down.'),
})

/**
 * Writes are capped tighter than reads: a runaway client retrying a POST does
 * far more damage than one refreshing a list.
 */
export const writeLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 60,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  skip: (req) => skip() || req.method === 'GET' || req.method === 'HEAD',
  handler: json('Too many changes at once. Please wait a moment.'),
})
