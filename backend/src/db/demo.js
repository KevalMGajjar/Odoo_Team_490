import { pbkdf2Sync } from 'node:crypto'
import { prisma } from '../lib/prisma.js'

/**
 * Live proof that the caching layer and the Odoo integration do what they
 * claim — written to be run in front of someone who has no reason to believe
 * the README.
 *
 * The rule throughout: never let the system grade its own homework. The Odoo
 * section reads its results back over raw JSON-RPC, bypassing our API
 * entirely, so the confirmation comes from Odoo rather than from us. The cache
 * section proves the negative too — that a write drops the cache — because a
 * cache that is merely fast is not the interesting claim.
 *
 *   npm run demo          both
 *   npm run demo cache
 *   npm run demo odoo
 */

const API = process.env.DEMO_API_URL || `http://localhost:${process.env.PORT || 4000}`
const ODOO_BASE = process.env.ERP_BASE_URL || 'http://localhost:8069'
const ODOO_DB = process.env.ERP_DB || 'urban_erp'
const ODOO_USER = process.env.ERP_USER || 'admin'
const ODOO_PW = process.env.ERP_PASSWORD || 'admin'

const C = { dim: '\x1b[2m', b: '\x1b[1m', g: '\x1b[32m', r: '\x1b[31m', c: '\x1b[36m', x: '\x1b[0m' }
const h1 = (t) => console.log(`\n${C.b}${'='.repeat(68)}\n  ${t}\n${'='.repeat(68)}${C.x}`)
const h2 = (t) => console.log(`\n${C.b}${C.c}> ${t}${C.x}`)
const say = (l, v) => console.log(`   ${String(l).padEnd(36)} ${v}`)
const ok = (t) => console.log(`   ${C.g}[PASS]${C.x} ${t}`)
const no = (t) => console.log(`   ${C.r}[FAIL]${C.x} ${t}`)
const note = (t) => console.log(`   ${C.dim}${t}${C.x}`)

const derive = (id, pw) => pbkdf2Sync(pw, String(id).trim().toLowerCase(), 100_000, 32, 'sha256').toString('hex')

async function login(loginId) {
  const r = await fetch(`${API}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ loginId, password: derive(loginId, 'demo123') }),
  })
  const j = await r.json()
  if (!j.token) throw new Error(`could not sign in as ${loginId}: ${j.message ?? JSON.stringify(j)}`)
  return j.token
}

/** A GET that reports what the cache did and how long it took. */
async function timed(path, token) {
  const t0 = Date.now()
  const res = await fetch(`${API}${path}`, { headers: { Authorization: `Bearer ${token}` } })
  await res.text()
  return { cache: res.headers.get('x-cache'), ms: Date.now() - t0, status: res.status }
}

const cacheEntries = async () => (await fetch(`${API}/health`).then((r) => r.json())).checks.cache

// ------------------------------- caching -------------------------------

async function demoCache() {
  h1('1. Response caching')
  note('Reports aggregate the whole ledger. Repeating that work for an answer')
  note('that cannot have changed is waste - but serving a stale trial balance')
  note('is worse than a slow one, so "it is fast" is not the interesting claim.')

  const admin = await login('admin01')
  const acct = await login('accountant1')
  const REPORT = '/reports/trial-balance'

  h2('A cached answer skips the database entirely')
  const cold = await timed(REPORT, admin)
  say('1st request', `X-Cache: ${cold.cache}   ${cold.ms}ms`)
  const warm = await timed(REPORT, admin)
  say('2nd request', `X-Cache: ${warm.cache}   ${warm.ms}ms`)
  if (cold.cache === 'MISS' && warm.cache === 'HIT') {
    ok(`served from cache, ${(cold.ms / Math.max(warm.ms, 1)).toFixed(0)}x faster - no ledger scan`)
  } else {
    no(`expected MISS then HIT, got ${cold.cache} then ${warm.cache}`)
  }

  h2("One role never receives another role's cached answer")
  note('The key is namespace:role:url. Caching before authentication would have')
  note('made this a disclosure bug rather than merely a stale read.')
  const other = await timed(REPORT, acct)
  say('same URL, different role', `X-Cache: ${other.cache}`)
  if (other.cache === 'MISS') ok('a separate cache entry - no cross-role leak')
  else no("an accountant was served the admin's cached copy")

  h2('A write invalidates the cache - the claim that actually matters')
  const reports = [
    '/reports/trial-balance',
    '/reports/balance-sheet?asOf=2026-03-31',
    '/reports/profit-loss?from=2025-04-01&to=2026-03-31',
  ]
  for (const p of reports) { await timed(p, admin); await timed(p, admin) }
  say('3 reports warmed', JSON.stringify(await cacheEntries()))

  const H = { Authorization: `Bearer ${admin}`, 'Content-Type': 'application/json' }
  const journals = (await fetch(`${API}/journals`, { headers: H }).then((r) => r.json())).rows
  const accounts = (await fetch(`${API}/accounts?pageSize=200`, { headers: H }).then((r) => r.json())).rows
  const post = await fetch(`${API}/journal-entries`, {
    method: 'POST',
    headers: H,
    body: JSON.stringify({
      journalId: journals.find((j) => j.type === 'miscellaneous').id,
      date: new Date().toISOString().slice(0, 10),
      narration: 'cache invalidation demo',
      items: [
        { accountId: accounts.find((a) => a.code === '1000').id, debit: '100.00', credit: '0.00' },
        { accountId: accounts.find((a) => a.code === '4100').id, debit: '0.00', credit: '100.00' },
      ],
    }),
  })
  say('posted a journal entry', `HTTP ${post.status}`)
  const after = await cacheEntries()
  say('cache immediately after', JSON.stringify(after))

  const recheck = await timed(reports[0], admin)
  say('re-read a report', `X-Cache: ${recheck.cache}`)
  if (after.entries === 0 && recheck.cache === 'MISS') {
    ok('every cached report was dropped - a report cannot outlive a write')
  } else {
    no('the cache survived a write; a stale report could be served')
  }

  note('')
  note('TTL is 30s, so even a missed invalidation self-heals within 30 seconds.')
  note('Watch it live:  curl -s localhost:4000/health')
}

// -------------------------------- odoo ---------------------------------

/** Raw JSON-RPC to Odoo. Deliberately does NOT go through our backend — the
 *  point is that the confirmation comes from Odoo, not from us. */
async function odooRpc(service, method, args) {
  const r = await fetch(`${ODOO_BASE}/jsonrpc`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', method: 'call', params: { service, method, args } }),
  })
  const j = await r.json()
  if (j.error) throw new Error(JSON.stringify(j.error.data?.message ?? j.error).slice(0, 300))
  return j.result
}

async function demoOdoo() {
  h1('2. Odoo integration')
  note('Claiming "it synced" from our own database proves nothing. Everything')
  note('below is read back out of Odoo over raw JSON-RPC, not through our API.')

  h2('There is a real Odoo on the other end')
  const version = await odooRpc('common', 'version', [])
  const dbs = await fetch(`${ODOO_BASE}/web/database/list`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', method: 'call', params: {} }),
  }).then((r) => r.json()).then((j) => j.result)
  say('server version', version.server_version)
  say('databases', dbs.join(', '))

  const uid = await odooRpc('common', 'login', [ODOO_DB, ODOO_USER, ODOO_PW])
  if (!uid) { no('could not authenticate to Odoo - check ERP_* in .env'); return }
  ok(`authenticated as uid ${uid}`)

  const kw = (model, method, args, opts = {}) =>
    odooRpc('object', 'execute_kw', [ODOO_DB, uid, ODOO_PW, model, method, args, opts])

  h2('Pick an unsynced entry from our ledger')
  const entry = await prisma.journalEntry.findFirst({
    where: { state: 'posted', odooSyncStatus: { in: ['not_synced', 'failed'] } },
    include: { items: { include: { account: true } } },
    orderBy: { number: 'asc' },
  })
  if (!entry) { note('every posted entry is already synced - nothing left to show'); return }

  say('entry', `${entry.number}   ${entry.narration ?? ''}`)
  let ourDr = 0
  let ourCr = 0
  for (const i of entry.items) {
    ourDr += Number(i.debit)
    ourCr += Number(i.credit)
    console.log(`      ${i.account.code}  ${i.account.name.slice(0, 30).padEnd(32)} Dr ${String(i.debit).padStart(11)}  Cr ${String(i.credit).padStart(11)}`)
  }
  say('sync status before', entry.odooSyncStatus)

  h2('Push it')
  const token = await login('admin01')
  const res = await fetch(`${API}/odoo/sync-entry/${entry.id}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
  })
  const body = await res.json()
  say('POST /odoo/sync-entry/:id', `HTTP ${res.status}   ${JSON.stringify(body)}`)
  if (!body.odooMoveId) { no('sync failed'); return }

  h2('Now read it back OUT of Odoo')
  const [move] = await kw('account.move', 'read', [[body.odooMoveId]], {
    fields: ['name', 'ref', 'date', 'state', 'journal_id'],
  })
  say('account.move id', body.odooMoveId)
  say('name in Odoo', move.name)
  say('ref (points back at us)', move.ref)
  say('state', move.state)
  say('journal', move.journal_id[1])

  const lines = await kw('account.move.line', 'search_read', [[['move_id', '=', body.odooMoveId]]], {
    fields: ['account_id', 'debit', 'credit'],
  })
  let dr = 0
  let cr = 0
  for (const l of lines) {
    dr += l.debit
    cr += l.credit
    console.log(`      ${l.account_id[1].slice(0, 38).padEnd(40)} Dr ${String(l.debit).padStart(11)}  Cr ${String(l.credit).padStart(11)}`)
  }
  console.log(`      ${''.padEnd(40)}    ${String(dr).padStart(11)}     ${String(cr).padStart(11)}`)

  if (dr === cr) ok('the move balances inside Odoo')
  else no(`unbalanced in Odoo: ${dr} vs ${cr}`)

  if (dr === ourDr && cr === ourCr) ok(`totals match our ledger exactly (${ourDr})`)
  else no(`totals differ - ours ${ourDr}/${ourCr}, Odoo ${dr}/${cr}`)

  if (move.state === 'posted') ok('posted in Odoo, not left sitting as a draft')
  if (move.ref === entry.number) ok(`traceable both ways: ${entry.number} <-> account.move ${body.odooMoveId}`)

  h2('And data comes back the other way')
  const tb = await fetch(`${API}/odoo/trial-balance`, {
    headers: { Authorization: `Bearer ${token}` },
  }).then((r) => r.json())
  say('GET /odoo/trial-balance', `${tb.rows?.length ?? 0} accounts pulled from Odoo`)
  for (const row of (tb.rows ?? []).slice(0, 4)) {
    console.log(`      ${row.account.slice(0, 34).padEnd(36)} Dr ${String(row.debit).padStart(12)}  Cr ${String(row.credit).padStart(12)}`)
  }
  if (tb.rows?.length) ok('the two ledgers can be reconciled against each other')

  h2('What this does NOT do')
  note('Sync is manual and admin-only. Posting an invoice does not push to')
  note('Odoo on its own - someone calls /odoo/sync-all-entries.')
  const status = await fetch(`${API}/odoo/status`, {
    headers: { Authorization: `Bearer ${token}` },
  }).then((r) => r.json())
  say('current sync state', JSON.stringify(status.counts))
  note('Reseeding our database mints new UUIDs, which orphans whatever is')
  note('already in Odoo - expect duplicates there unless Odoo is reset too.')
}

// -------------------------------- main ---------------------------------

const which = (process.argv[2] || 'all').toLowerCase()
try {
  if (which === 'all' || which === 'cache') await demoCache()
  if (which === 'all' || which === 'odoo') await demoOdoo()
  console.log()
} catch (err) {
  console.error(`\n${C.r}demo failed:${C.x} ${err.message}`)
  console.error(`${C.dim}is the API running on ${API}, and Odoo on ${ODOO_BASE}?${C.x}\n`)
  process.exitCode = 1
} finally {
  await prisma.$disconnect()
}
