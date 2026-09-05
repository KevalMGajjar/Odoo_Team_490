/**
 * Small in-process TTL cache for expensive read-only queries.
 *
 * Reports aggregate the whole ledger, so repeatedly opening a Balance Sheet
 * re-scans every journal item for an answer that cannot have changed unless
 * something posted. Caching them is worthwhile; caching them *wrongly* is
 * worse than not caching, because a stale trial balance looks authoritative.
 *
 * The rule here is that anything which writes to the ledger invalidates the
 * whole report namespace. That is blunt, and deliberately so — a clever
 * per-key scheme is where staleness bugs hide, and reports are cheap to
 * recompute.
 *
 * In-process means each replica keeps its own copy; entries expire on their
 * own so replicas converge within the TTL. A shared Redis would be the next
 * step if this ever ran multi-instance.
 */

const store = new Map()

const now = () => Date.now()

/** Read a live entry, or undefined if missing/expired. */
export function cacheGet(key) {
  const hit = store.get(key)
  if (!hit) return undefined
  if (hit.expiresAt <= now()) {
    store.delete(key)
    return undefined
  }
  return hit.value
}

export function cacheSet(key, value, ttlMs) {
  store.set(key, { value, expiresAt: now() + ttlMs })
}

/** Drop every key beginning with `prefix` (e.g. all of `report:`). */
export function cacheInvalidate(prefix) {
  let dropped = 0
  for (const key of store.keys()) {
    if (key.startsWith(prefix)) {
      store.delete(key)
      dropped += 1
    }
  }
  return dropped
}

export function cacheClear() {
  store.clear()
}

export function cacheStats() {
  let live = 0
  for (const entry of store.values()) if (entry.expiresAt > now()) live += 1
  return { entries: store.size, live }
}

/**
 * Invalidate cached reports after any successful write.
 *
 * Hooked to response `finish` rather than called inside the service layer on
 * purpose: invalidating mid-transaction leaves a window where a concurrent
 * read repopulates the cache with pre-commit data and pins it there for the
 * full TTL. By the time the response is being sent, the transaction has
 * committed.
 */
export function invalidateReportsOnWrite(req, res, next) {
  if (req.method === 'GET' || req.method === 'HEAD') return next()
  res.on('finish', () => {
    if (res.statusCode >= 200 && res.statusCode < 400) cacheInvalidate('report:')
  })
  next()
}

/**
 * Express middleware caching successful GET responses.
 *
 * Keyed by URL *and* role, because what a report returns can depend on who
 * asked — caching one user's view and serving it to another would be a
 * disclosure bug, not just a stale read.
 */
export function cacheResponse({ ttlMs = 30_000, namespace = 'report' } = {}) {
  return (req, res, next) => {
    if (req.method !== 'GET') return next()

    const key = `${namespace}:${req.user?.role ?? 'anon'}:${req.originalUrl}`
    const hit = cacheGet(key)
    if (hit !== undefined) {
      res.setHeader('X-Cache', 'HIT')
      return res.json(hit)
    }

    res.setHeader('X-Cache', 'MISS')
    const send = res.json.bind(res)
    res.json = (body) => {
      // Only cache success — caching a 4xx/5xx would pin an error in place.
      if (res.statusCode >= 200 && res.statusCode < 300) cacheSet(key, body, ttlMs)
      return send(body)
    }
    next()
  }
}
