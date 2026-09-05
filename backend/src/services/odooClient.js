import xmlrpc from 'xmlrpc'

/**
 * Low-level Odoo XML-RPC client.
 *
 * ONE-DIRECTIONAL, best-effort by design (PLAN.md's own resilience
 * principle): our Postgres ledger is always the source of truth, and every
 * call here is wrapped in a timeout so a slow or absent Odoo can never hang
 * a request, let alone block a ledger post.
 *
 * Odoo 19 gotcha, found the hard way while testing this against a real
 * instance: its domain parser is now strict about nesting depth. A domain
 * argument must be `[[field, op, value], ...]` — passing an extra wrapper
 * list (`[[[...]]]`) or an unwrapped bare list where a domain is expected
 * throws `Domain() invalid item in domain`. `executeKw`'s `args` is always
 * the FLAT list of positional arguments to the target method, so for
 * `search_count(domain)` that's `args: [domain]`, not `args: [[domain]]`.
 */

const ODOO_URL = process.env.ERP_BASE_URL || process.env.ODOO_URL || 'http://localhost:8069'
const ODOO_DB = process.env.ERP_DB || process.env.ODOO_DB || 'urban_erp'
const ODOO_USER = process.env.ERP_USER || process.env.ODOO_USER || 'admin'
const ODOO_PASSWORD = process.env.ERP_PASSWORD || process.env.ODOO_PASSWORD || 'admin'
const ERP_TIMEOUT_MS = Number(process.env.ERP_TIMEOUT_MS || 5000)

let commonClient = null
let objectClient = null

function getClients() {
  if (!commonClient) {
    commonClient = xmlrpc.createClient({ url: `${ODOO_URL}/xmlrpc/2/common` })
    objectClient = xmlrpc.createClient({ url: `${ODOO_URL}/xmlrpc/2/object` })
  }
  return { commonClient, objectClient }
}

let cachedUid = null
let cachedAt = 0
const UID_TTL_MS = 5 * 60 * 1000

const methodCall = (client, method, params) => new Promise((resolve, reject) => {
  let settled = false
  const timer = setTimeout(() => {
    if (settled) return
    settled = true
    reject(Object.assign(new Error(`Odoo request timed out after ${ERP_TIMEOUT_MS}ms`), { status: 504, odoo: true }))
  }, ERP_TIMEOUT_MS)

  client.methodCall(method, params, (err, value) => {
    if (settled) return
    settled = true
    clearTimeout(timer)
    if (err) return reject(Object.assign(err, { odoo: true }))
    resolve(value)
  })
})

export async function odooAuthenticate({ force = false } = {}) {
  const now = Date.now()
  if (!force && cachedUid && now - cachedAt < UID_TTL_MS) return cachedUid

  const { commonClient } = getClients()
  const uid = await methodCall(commonClient, 'authenticate', [ODOO_DB, ODOO_USER, ODOO_PASSWORD, {}])
  if (!uid) throw Object.assign(new Error('Odoo authentication failed — check ERP_USER/ERP_PASSWORD/ERP_DB'), { status: 502, odoo: true })

  cachedUid = uid
  cachedAt = now
  return uid
}

/**
 * @param {string} model   e.g. 'account.account'
 * @param {string} method  e.g. 'search_read', 'create', 'write', 'action_post'
 * @param {Array}  args    FLAT positional args to the method — for search-family
 *                         calls this is `[domain]`, for create it's `[values]`.
 * @param {object} kwargs  e.g. { fields: [...], limit: 10 }
 */
export async function executeKw(model, method, args = [], kwargs = {}) {
  const uid = await odooAuthenticate()
  const { objectClient } = getClients()
  try {
    return await methodCall(objectClient, 'execute_kw', [ODOO_DB, uid, ODOO_PASSWORD, model, method, args, kwargs])
  } catch (err) {
    // a stale cached uid (Odoo restarted) — retry once with a fresh login
    if (err.faultString?.includes('session') || err.faultString?.includes('Access Denied')) {
      await odooAuthenticate({ force: true })
      return methodCall(objectClient, 'execute_kw', [ODOO_DB, await odooAuthenticate(), ODOO_PASSWORD, model, method, args, kwargs])
    }
    throw err
  }
}

/** Cheap reachability check for /health — a real round trip, not just a socket probe. */
export async function odooPing() {
  const t0 = Date.now()
  try {
    await odooAuthenticate()
    return { reachable: true, latencyMs: Date.now() - t0 }
  } catch (err) {
    return { reachable: false, error: err.message }
  }
}

export const odooConfig = { url: ODOO_URL, db: ODOO_DB }
