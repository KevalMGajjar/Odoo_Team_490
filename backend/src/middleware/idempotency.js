import { createHash } from 'node:crypto'
import { prisma } from '../lib/prisma.js'
import { conflict } from '../lib/errors.js'

/**
 * Idempotency for unsafe requests, in the style of Stripe's `Idempotency-Key`.
 *
 * The problem this solves is not the double-click — the client already guards
 * that. It's the lost response: the request succeeds, the reply never arrives,
 * and the user (or a proxy, or a retry) sends it again. Without this, that
 * posts a second payment for money already recorded, and no amount of
 * disabling buttons prevents it.
 *
 * Opt-in by header, so a caller that doesn't care is unaffected.
 *
 * Flow:
 *   - no key            → behave normally
 *   - new key           → reserve it, run the handler, store the response
 *   - same key + body   → return the stored response, don't run the handler
 *   - same key, running → 409, the first attempt is still in flight
 *   - same key, new body→ 409, the caller reused a key for a different request
 */

const hashBody = (body) =>
  createHash('sha256').update(JSON.stringify(body ?? {})).digest('hex')

export async function idempotency(req, res, next) {
  const key = req.header('Idempotency-Key')
  if (!key || req.method === 'GET' || req.method === 'HEAD') return next()

  // Scope the key to the user so one caller's key can never collide with
  // another's, accidentally or otherwise.
  const scopedKey = `${req.user?.id ?? 'anon'}:${key}`
  const requestHash = hashBody(req.body)

  const existing = await prisma.idempotencyKey.findUnique({ where: { key: scopedKey } })

  if (existing) {
    if (existing.requestHash !== requestHash) {
      return next(conflict('This Idempotency-Key was already used with a different request body'))
    }
    if (existing.completedAt === null) {
      return next(conflict('An identical request is still being processed — please wait'))
    }
    res.setHeader('Idempotency-Replayed', 'true')
    return res.status(existing.statusCode ?? 200).json(existing.response)
  }

  try {
    // Reserving before the handler runs is what closes the race: two
    // simultaneous retries both reach here, and the primary key means only one
    // wins the insert. The loser is told the first is still in flight rather
    // than being allowed to duplicate the work.
    await prisma.idempotencyKey.create({
      data: { key: scopedKey, userId: req.user?.id ?? 'anon', method: req.method, path: req.originalUrl, requestHash },
    })
  } catch (err) {
    if (err.code === 'P2002') {
      return next(conflict('An identical request is still being processed — please wait'))
    }
    return next(err)
  }

  const send = res.json.bind(res)
  res.json = (body) => {
    const ok = res.statusCode >= 200 && res.statusCode < 300
    // Only a success is worth replaying. A failed attempt releases its key so
    // the caller can legitimately fix the problem and retry.
    const finish = ok
      ? prisma.idempotencyKey.update({
          where: { key: scopedKey },
          data: { statusCode: res.statusCode, response: body, completedAt: new Date() },
        })
      : prisma.idempotencyKey.delete({ where: { key: scopedKey } })

    finish.catch((err) => console.error('[idempotency] could not finalise key:', err.message))
    return send(body)
  }

  next()
}

/**
 * Drop keys older than `olderThanHours`.
 *
 * Retention is a trade-off, not a cleanup detail: too short and a genuine
 * retry after an outage duplicates the work; too long and the table grows
 * without bound. A day comfortably covers any realistic retry window.
 */
export async function pruneIdempotencyKeys(olderThanHours = 24) {
  const cutoff = new Date(Date.now() - olderThanHours * 3600 * 1000)
  const { count } = await prisma.idempotencyKey.deleteMany({ where: { createdAt: { lt: cutoff } } })
  return count
}
