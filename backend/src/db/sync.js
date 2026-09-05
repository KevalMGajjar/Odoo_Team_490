import { pbkdf2Sync } from 'node:crypto'
import { prisma } from '../lib/prisma.js'

/**
 * Push everything to Odoo, in the right order.
 *
 * Exists because the /odoo/* routes need an admin bearer token, which makes
 * them awkward to drive from a shell — and the one-liner people reach for
 * (`curl -X POST ...`) is not even valid in PowerShell, where `curl` is an
 * alias for Invoke-WebRequest.
 *
 * Masters go first. A journal entry references accounts and partners, so
 * pushing entries against an Odoo that has not seen the masters yet fails on
 * every line.
 *
 *   npm run sync
 */

const API = process.env.DEMO_API_URL || `http://localhost:${process.env.PORT || 4000}`
const FORCE = process.argv.includes('--force')

const C = { dim: '\x1b[2m', b: '\x1b[1m', g: '\x1b[32m', y: '\x1b[33m', r: '\x1b[31m', x: '\x1b[0m' }
const say = (l, v) => console.log(`  ${String(l).padEnd(24)} ${v}`)
const ok = (t) => console.log(`  ${C.g}OK${C.x}   ${t}`)
const warn = (t) => console.log(`  ${C.y}!${C.x}    ${t}`)
const note = (t) => console.log(`  ${C.dim}${t}${C.x}`)

const derive = (id, pw) => pbkdf2Sync(pw, String(id).trim().toLowerCase(), 100_000, 32, 'sha256').toString('hex')

/**
 * Ask Odoo how many journal entries it actually holds, and compare.
 *
 * Returns a description of the disagreement, or null when the two sides agree.
 * Talks to Odoo directly rather than through our API on purpose: the question
 * is precisely whether our own record of the sync can still be trusted.
 */
async function odooIsMissingEntries(weThinkSynced) {
  if (!weThinkSynced) return null
  try {
    const rpc = async (service, method, args) => {
      const r = await fetch(`${process.env.ERP_BASE_URL || 'http://localhost:8069'}/jsonrpc`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jsonrpc: '2.0', method: 'call', params: { service, method, args } }),
      })
      const j = await r.json()
      if (j.error) throw new Error('rpc failed')
      return j.result
    }
    const db = process.env.ERP_DB || 'urban_erp'
    const pw = process.env.ERP_PASSWORD || 'admin'
    const uid = await rpc('common', 'login', [db, process.env.ERP_USER || 'admin', pw])
    if (!uid) return null
    const held = await rpc('object', 'execute_kw', [db, uid, pw, 'account.move', 'search_count', [[]]])
    if (held >= weThinkSynced) return null
    return `we record ${weThinkSynced} entries as synced, but Odoo holds only ${held}. ` +
      'Odoo was probably reset; our status flags are stale.'
  } catch {
    return null // Odoo unreachable is reported elsewhere; do not fail the run here
  }
}

async function main() {
  console.log(`\n${C.b}=== Sync to Odoo ===${C.x}\n`)

  const login = await fetch(`${API}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ loginId: 'admin01', password: derive('admin01', 'demo123') }),
  }).then((r) => r.json())
  if (!login.token) throw new Error(`sign-in failed: ${login.message ?? JSON.stringify(login)}`)
  const H = { Authorization: `Bearer ${login.token}` }

  const before = await fetch(`${API}/odoo/status`, { headers: H }).then((r) => r.json())
  if (before.reachable === false) throw new Error('Odoo is not reachable — is the container running?')
  say('to sync', `${before.counts.unsynced} unsynced, ${before.counts.failed} previously failed`)

  // Sync state lives on our rows alone, so it describes what we *sent*, never
  // what Odoo still *holds*. Wipe Odoo and we go on believing everything is
  // synced, and push nothing — the entries silently never come back. Comparing
  // the two sides is the only way to notice.
  const drift = await odooIsMissingEntries(before.counts.synced)
  if (drift) {
    warn(drift)
    if (!FORCE) {
      note('Re-run with --force to mark them unsynced and push again:')
      note('   npm run sync -- --force')
      note('')
    }
  }

  if (FORCE) {
    const { count } = await prisma.journalEntry.updateMany({
      where: { state: 'posted' },
      data: { odooSyncStatus: 'not_synced', odooMoveId: null, odooSyncError: null },
    })
    say('forced', `${count} entries marked unsynced`)
  }

  // Warn before making a mess that is tedious to clean up. Odoo records are
  // matched on our UUIDs, so a reseed since the last sync means the records
  // already in Odoo can never be matched again — syncing now adds a second
  // copy of everything rather than updating what is there.
  const stale = await prisma.contact.count({ where: { odooId: { not: null } } })
  const total = await prisma.contact.count()
  if (stale === 0 && total > 0) {
    warn('no contact here has ever been synced from this database.')
    note('If Odoo already holds data from a previous seed, this run will ADD a')
    note('second copy rather than update it — the old rows point at UUIDs that')
    note('no longer exist. To avoid that, reset Odoo first:')
    note('   cd erp-microservice && docker compose down -v && docker compose up -d')
    note('')
  }

  console.log(`${C.b}masters${C.x}`)
  const m = await fetch(`${API}/odoo/sync-masters`, { method: 'POST', headers: H }).then((r) => r.json())
  if (!m.ok) throw new Error(`master sync failed: ${m.message ?? JSON.stringify(m)}`)
  say('accounts', m.counts.accounts)
  say('contacts', m.counts.contacts)
  say('products', m.counts.products)
  say('journals', m.counts.journals)
  ok('masters pushed')

  console.log(`\n${C.b}journal entries${C.x}`)
  note('one Odoo write per entry — this takes a while')
  const t0 = Date.now()
  const e = await fetch(`${API}/odoo/sync-all-entries`, { method: 'POST', headers: H }).then((r) => r.json())
  const failures = (e.results ?? []).filter((r) => !r.ok)
  say('attempted', e.total ?? 0)
  say('succeeded', e.succeeded ?? 0)
  say('took', `${((Date.now() - t0) / 1000).toFixed(1)}s`)
  for (const f of failures.slice(0, 5)) console.log(`  ${C.r}x${C.x}    ${f.number}: ${f.error}`)
  if (failures.length > 5) note(`…and ${failures.length - 5} more`)

  const after = await fetch(`${API}/odoo/status`, { headers: H }).then((r) => r.json())
  console.log()
  say('final state', JSON.stringify(after.counts))
  if (after.counts.failed > 0) {
    warn(`${after.counts.failed} entries failed — inspect them with GET /odoo/entries`)
  } else if (after.counts.unsynced === 0) {
    // Re-check rather than trusting the flags we just wrote: claiming success
    // on the strength of our own bookkeeping is the very thing that hid the
    // drift in the first place.
    const stillMissing = await odooIsMissingEntries(after.counts.synced)
    if (stillMissing) warn(stillMissing)
    else ok('every posted entry is now in Odoo')
  }
  console.log(`\n${C.dim}Verify independently:  npm run demo odoo${C.x}\n`)
}

main()
  .catch((err) => {
    console.error(`\n${C.r}sync failed:${C.x} ${err.message}`)
    console.error(`${C.dim}is the API running on ${API}?${C.x}\n`)
    process.exitCode = 1
  })
  .finally(() => prisma.$disconnect())
