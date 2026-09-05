import CircuitBreaker from 'opossum'

/**
 * Circuit breakers for outbound calls to systems we don't control — the Odoo
 * ERP and the AI endpoint.
 *
 * The failure they prevent is subtle: when a dependency goes slow rather than
 * down, every request sits waiting for its timeout. Those requests hold
 * connections, the pool drains, and an outage in something optional takes the
 * whole API with it. After enough failures the breaker opens and calls fail
 * instantly instead of hanging, then it lets a single probe through to see if
 * the dependency recovered.
 *
 * Both dependencies are optional by design, so an open breaker degrades a
 * feature rather than breaking the app: Odoo sync reports unavailable, and the
 * assistant says it can't be reached.
 */

const DEFAULTS = {
  timeout: 10000,
  // Open once half the calls in a rolling window fail — but only after
  // `volumeThreshold` calls, so the first unlucky request can't trip it.
  errorThresholdPercentage: 50,
  volumeThreshold: 5,
  resetTimeout: 30000,
  rollingCountTimeout: 60000,
  rollingCountBuckets: 10,
}

const registry = new Map()

/**
 * Wrap an async function in a named breaker. Calling this twice with the same
 * name returns the same breaker, so state is shared across requests — a
 * breaker created per request would never accumulate enough history to open.
 */
export function breaker(name, fn, options = {}) {
  if (registry.has(name)) return registry.get(name)

  const cb = new CircuitBreaker(fn, { ...DEFAULTS, ...options, name })

  cb.on('open', () => console.warn(`[circuit:${name}] OPEN — failing fast for ${(options.resetTimeout ?? DEFAULTS.resetTimeout) / 1000}s`))
  cb.on('halfOpen', () => console.warn(`[circuit:${name}] half-open — probing`))
  cb.on('close', () => console.log(`[circuit:${name}] closed — dependency healthy again`))

  registry.set(name, cb)
  return cb
}

/** Breaker health, surfaced on /health so an open breaker is visible. */
export function breakerStats() {
  const out = {}
  for (const [name, cb] of registry) {
    out[name] = {
      state: cb.opened ? 'open' : cb.halfOpen ? 'half-open' : 'closed',
      failures: cb.stats.failures,
      successes: cb.stats.successes,
      timeouts: cb.stats.timeouts,
    }
  }
  return out
}
