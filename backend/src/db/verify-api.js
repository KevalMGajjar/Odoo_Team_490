import 'dotenv/config'
import { derivePassword } from '../lib/password.js'

/**
 * End-to-end API verification against a running server.
 *
 *   npm run dev          (in one terminal)
 *   npm run verify:api   (in another)
 *
 * Drives the real HTTP surface exactly as a client would: purchase order →
 * bill → stock → invoice → COGS → payment → settlement, plus vouchers, manual
 * entries, reversal, permissions and the reporting identities.
 *
 * It writes to the database. Re-run `npm run seed` afterwards for a clean demo.
 */

const BASE = process.env.API_URL || `http://localhost:${process.env.PORT || 4000}`

let pass = 0, fail = 0
const ok = (n) => { pass++; console.log(`  \x1b[32m✓\x1b[0m ${n}`) }
const bad = (n, d) => { fail++; console.log(`  \x1b[31m✗\x1b[0m ${n}\n      ${d}`) }
const assert = (c, n, d = '') => (c ? ok(n) : bad(n, d))
const assertEq = (a, e, n) =>
  String(a) === String(e) ? ok(`${n}  (${a})`) : bad(n, `expected ${e}, got ${a}`)
/** Money crosses the wire as an exact decimal string — '13688' and '13688.00'
 *  are the same value, so compare numerically rather than by text. */
const assertMoney = (a, e, n) =>
  Number(a) === Number(e) ? ok(`${n}  (${a})`) : bad(n, `expected ${e}, got ${a}`)
const section = (t) => console.log(`\n\x1b[1m${t}\x1b[0m`)

const tokens = {}

async function api(path, { method = 'GET', body, as = 'admin', raw = false } = {}) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(tokens[as] ? { Authorization: `Bearer ${tokens[as]}` } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  })
  const text = await res.text()
  let json = null
  try { json = JSON.parse(text) } catch { /* csv or html */ }
  if (raw) return { status: res.status, text, json }
  return { status: res.status, ...json }
}

const status = async (path, opts) => (await api(path, { ...opts, raw: true })).status

/** Assert an HTTP status, showing the server's message when it doesn't match. */
async function assertStatus(path, opts, expected, name) {
  const r = await api(path, { ...opts, raw: true })
  if (r.status === expected) return ok(`${name}  (${expected})`)
  return bad(name, `expected ${expected}, got ${r.status}: ${r.json?.message ?? r.text.slice(0, 120)}`)
}

async function login(as, loginId) {
  // Mirrors the browser: the raw password never goes over the wire.
  const r = await api('/auth/login', {
    method: 'POST',
    body: { loginId, password: derivePassword(loginId, 'demo123') },
    as: null,
  })
  if (!r.token) throw new Error(`login failed for ${loginId}: ${r.message}`)
  tokens[as] = r.token
  return r.user
}

async function main() {
  console.log('\n\x1b[1m═══ API end-to-end verification ═══\x1b[0m')
  console.log(`\x1b[2m${BASE}\x1b[0m`)

  // ─────────── auth ───────────
  section('1. Authentication')
  const admin = await login('admin', 'admin01')
  await login('acct', 'accountant1')
  await login('portal', 'nimesh01')
  assertEq(admin.role, 'admin', 'admin signs in and receives a bearer token')
  assertEq(await status('/auth/me', { as: 'acct' }), 200, 'bearer token authenticates')
  assertEq(await status('/auth/me', { as: null }), 401, 'no token is rejected')

  // ─────────── fixtures ───────────
  const { rows: vendors } = await api('/contacts?q=Azure')
  const { rows: customers } = await api('/contacts?q=Meera')
  const { rows: products } = await api('/products?q=Bar Stool')
  const { rows: journals } = await api('/journals')
  const { rows: accounts } = await api('/accounts?pageSize=200')

  const vendor = vendors[0]
  const customer = customers[0]
  const product = products[0]
  const bank = journals.find((j) => j.type === 'bank')
  const misc = journals.find((j) => j.type === 'miscellaneous')
  const acc = (code) => accounts.find((a) => a.code === code)

  const today = new Date().toISOString().slice(0, 10)
  const stockBefore = Number(product.onHandQty)

  // ─────────── purchase chain ───────────
  section('2. Purchase order → bill → stock')
  const po = await api('/purchase-orders', {
    method: 'POST',
    body: {
      vendorId: vendor.id, orderDate: today,
      lines: [{ productId: product.id, quantity: 10, unitPrice: 1800 }],
    },
  })
  assertEq(po.status, 201, 'purchase order created')
  assertMoney(po.untaxed, 18000, 'subtotal computed server-side (10 × 1800)')
  assertMoney(po.total, 21240, 'total includes 18% GST from the product master')

  const entriesBeforePo = (await api('/journal-entries?pageSize=1')).total
  await api(`/purchase-orders/${po.id}/confirm`, { method: 'POST' })
  const entriesAfterPo = (await api('/journal-entries?pageSize=1')).total
  assertEq(entriesAfterPo, entriesBeforePo, 'confirming a PO posts NOTHING to the ledger')

  const draftBill = await api(`/purchase-orders/${po.id}/create-bill`, { method: 'POST' })
  assertEq(draftBill.status, 201, 'bill created from the purchase order')
  assertEq(draftBill.state, 'draft', 'bill starts as a draft')

  const bill = await api(`/bills/${draftBill.id}/post`, { method: 'POST' })
  assertEq(bill.status, 200, 'bill posted')
  assertEq(bill.state, 'posted', 'bill state is posted')
  assert(Boolean(bill.journalEntryId), 'bill is linked to a journal entry')

  const afterReceipt = await api(`/products/${product.id}`)
  assertEq(Number(afterReceipt.onHandQty), stockBefore + 10, 'stock received into inventory')

  await assertStatus(`/bills/${bill.id}/post`, { method: 'POST' }, 409, 'posting an already-posted bill is refused')

  // ─────────── sales chain ───────────
  section('3. Invoice → revenue + COGS → settlement')
  const inv = await api('/invoices', {
    method: 'POST',
    body: {
      customerId: customer.id, invoiceDate: today, dueDate: today,
      lines: [{ productId: product.id, quantity: 4, unitPrice: 2900 }],
    },
  })
  assertEq(inv.status, 201, 'invoice created')
  assertMoney(inv.total, 13688, 'invoice total = 11600 + 18% GST')

  const posted = await api(`/invoices/${inv.id}/post`, { method: 'POST' })
  assert(Boolean(posted.journalEntryId), 'revenue entry created')
  assert(Boolean(posted.cogsEntryId), 'separate COGS entry created')
  assertEq(posted.settleState, 'not_paid', 'invoice starts unpaid')

  const afterSale = await api(`/products/${product.id}`)
  assertEq(Number(afterSale.onHandQty), stockBefore + 6, 'stock delivered out')

  const half = await api(`/invoices/${inv.id}/register-payment`, {
    method: 'POST',
    body: { journalId: bank.id, paymentDate: today, amount: 5000 },
  })
  assertEq(half.status, 201, 'partial payment registered')

  let invNow = await api(`/invoices/${inv.id}`)
  assertEq(invNow.settleState, 'partial', 'invoice is part-paid')
  assertMoney(invNow.amountResidual, 8688, 'residual after part payment')

  await assertStatus(`/invoices/${inv.id}/register-payment`, {
    method: 'POST', body: { journalId: bank.id, paymentDate: today, amount: 999999 },
  }, 422, 'payment beyond the residual is refused')

  await api(`/invoices/${inv.id}/register-payment`, {
    method: 'POST', body: { journalId: bank.id, paymentDate: today, amount: 8688 },
  })
  invNow = await api(`/invoices/${inv.id}`)
  assertEq(invNow.settleState, 'paid', 'invoice fully settled')
  assertMoney(invNow.amountResidual, 0, 'residual clears to exactly zero')

  // ─────────── vouchers ───────────
  section('4. Voucher entry')
  const cb = await api('/vouchers/cash-bank-accounts?voucherType=BReceipt')
  assert(cb.accounts.length > 0, `cash/bank filter returns only flagged accounts (${cb.accounts.length})`)
  assert(cb.accounts.every((a) => ['bank', 'cash'].includes(a.type)), 'all are bank or cash accounts')

  const peek = await api('/vouchers/next-number?voucherType=BReceipt')
  const expectedNo = peek.voucherNo

  const voucher = await api('/vouchers', {
    method: 'POST',
    body: {
      voucherType: 'BReceipt', date: today,
      cashBankAccountId: cb.accounts[0].id,
      lines: [{ accountId: acc('1100').id, amount: 7500, partnerId: customer.id }],
      reference: 'NEFT-TEST-01', narration: 'Test bank receipt',
    },
  })
  assertEq(voucher.status, 201, 'bank receipt voucher posted')
  assertEq(voucher.voucherNo, expectedNo, 'voucher number matches the peeked value')

  const tx = await api(`/reports/transactions?voucherType=BReceipt&limit=200`)
  const mine = tx.rows.filter((r) => r.reference === 'NEFT-TEST-01')
  assertEq(mine.length, 2, 'voucher produced two transaction rows')
  const party = mine.find((r) => r.accountid === acc('1100').id)
  const bankRow = mine.find((r) => r.accountid === cb.accounts[0].id)
  assertMoney(party.amount, 7500, 'party row is POSITIVE (credit)')
  assertMoney(bankRow.amount, -7500, 'bank row is NEGATIVE (debit)')

  const lastUsed = await api('/vouchers/cash-bank-accounts?voucherType=BReceipt')
  assertEq(lastUsed.lastUsed?.id, cb.accounts[0].id, 'last account used is remembered')

  // ─────────── manual entry + reversal ───────────
  section('5. Manual journal entry and reversal')
  const preview = await api('/journal-entries/check-balance', {
    method: 'POST', body: { items: [{ debit: 100, credit: 0 }, { debit: 0, credit: 99.99 }] },
  })
  assertEq(preview.balanced, false, 'live balance check rejects a 1-paisa gap')
  assertEq(preview.difference, '0.01', 'and reports the exact difference')

  const unbalanced = await status('/journal-entries', {
    method: 'POST',
    body: {
      journalId: misc.id, date: today, narration: 'Should fail',
      items: [
        { accountId: acc('5100').id, debit: 100, credit: 0 },
        { accountId: acc('2000').id, debit: 0, credit: 99 },
      ],
    },
  })
  assertEq(unbalanced, 422, 'posting an unbalanced entry is refused')

  const entry = await api('/journal-entries', {
    method: 'POST',
    body: {
      journalId: misc.id, date: today, reference: 'JV-TEST', narration: 'Accrue test expense',
      items: [
        { accountId: acc('5100').id, debit: 2500, credit: 0 },
        { accountId: acc('2000').id, debit: 0, credit: 2500 },
      ],
    },
  })
  assertEq(entry.status, 201, 'balanced manual entry posts')

  assertEq(await status(`/journal-entries/${entry.id}/reverse`, { method: 'POST', body: {}, as: 'acct' }),
    403, 'an accountant may NOT reverse an entry')

  const rev = await api(`/journal-entries/${entry.id}/reverse`, {
    method: 'POST', body: { reason: 'Keyed in error' },
  })
  assertEq(rev.status, 201, 'admin reverses the entry')
  assertEq(rev.kind, 'reversal', 'reversal is tagged as such')
  assertEq(await status(`/journal-entries/${entry.id}/reverse`, { method: 'POST', body: {} }), 409,
    'the same entry cannot be reversed twice')

  // ─────────── permissions ───────────
  section('6. Permissions')
  assertEq(await status('/users', { as: 'acct' }), 403,
    'accountant cannot manage users')
  assertEq(await status('/reports/balance-sheet', { as: 'acct' }), 200,
    'accountant CAN read reports')
  assertEq(await status('/reports/balance-sheet', { as: 'portal' }), 403,
    'portal user cannot read reports')
  assertEq(await status('/invoices', { as: 'portal' }), 403,
    'portal user cannot list all invoices')

  // ─────────── identities still hold ───────────
  section('7. Accounting identities after all that activity')
  const tb = await api('/reports/trial-balance', { as: 'acct' })
  assert(tb.balanced === true, `trial balance still balanced (Σ ${tb.totals.debit})`)

  const bs = await api('/reports/balance-sheet', { as: 'acct' })
  assert(bs.balanced === true,
    `balance sheet balanced — assets ${bs.totals.assets} = L+E ${bs.totals.liabilitiesAndEquity}`)

  const val = await api('/reports/inventory-valuation', { as: 'acct' })
  assert(val.tiesOut === true,
    `inventory valuation ${val.totals.value} ties to control account ${val.totals.ledgerBalance}`)

  const csv = await api('/reports/trial-balance?format=csv', { as: 'acct', raw: true })
  assert(csv.text.startsWith('Code,Account,Type,Debit,Credit'), 'CSV export returns a proper header')

  console.log(`\n\x1b[1m${'─'.repeat(58)}\x1b[0m`)
  console.log(`\x1b[1m  ${pass} passed, ${fail} failed\x1b[0m`)
  console.log(`\x1b[2m  database was modified — run \`npm run seed\` to reset\x1b[0m`)
  console.log(`\x1b[1m${'─'.repeat(58)}\x1b[0m\n`)
  process.exit(fail === 0 ? 0 : 1)
}

main().catch((e) => {
  console.error('\n\x1b[31mHARNESS ERROR\x1b[0m', e)
  process.exit(1)
})
