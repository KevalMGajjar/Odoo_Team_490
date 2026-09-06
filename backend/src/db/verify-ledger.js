import 'dotenv/config'
import { prisma } from '../lib/prisma.js'
import { postEntry, reverseEntry, checkBalance, assertMutable } from '../services/ledger.js'
import { applyStockIn, applyStockOut, applyStockAdjustment, valuationAsOf } from '../services/inventory.js'
import { D, money, qty, cost } from '../lib/money.js'

/**
 * Ledger + inventory correctness harness.
 *
 * Runs entirely inside ONE interactive transaction that is deliberately rolled
 * back at the end, so the database is left exactly as it was found.
 *
 *   npm run verify
 */

let pass = 0
let fail = 0

const ok = (name) => { pass++; console.log(`  \x1b[32m✓\x1b[0m ${name}`) }
const bad = (name, detail) => { fail++; console.log(`  \x1b[31m✗\x1b[0m ${name}\n      ${detail}`) }

const assert = (cond, name, detail = '') => (cond ? ok(name) : bad(name, detail))

const assertEq = (actual, expected, name) => {
  const a = D(actual).toString()
  const e = D(expected).toString()
  return a === e ? ok(`${name}  (${a})`) : bad(name, `expected ${e}, got ${a}`)
}

/** Assert that `fn` throws with the given HTTP status. */
const assertThrows = async (fn, status, name) => {
  try {
    await fn()
    bad(name, `expected a ${status} but nothing was thrown`)
  } catch (err) {
    if (err.status === status) ok(`${name}  → ${status}: "${err.message.slice(0, 70)}"`)
    else bad(name, `expected status ${status}, got ${err.status ?? '?'}: ${err.message}`)
  }
}

const section = (title) => console.log(`\n\x1b[1m${title}\x1b[0m`)

class Rollback extends Error {}

async function main() {
  console.log('\n\x1b[1m═══ Urban Furniture — ledger & inventory verification ═══\x1b[0m')

  try {
    await prisma.$transaction(async (tx) => {
      // ─────────── fixtures ───────────
      const inr = await tx.currency.create({
        data: { code: 'XTS', name: 'Test Rupee', symbol: '₹', isBase: true },
      })

      const mk = (code, name, type) =>
        tx.chartOfAccount.create({ data: { code, name, type } })

      const cash = await mk('T1000', 'Cash', 'asset')
      const debtors = await mk('T1100', 'Debtors', 'asset')
      const inventory = await mk('T1300', 'Inventory', 'asset')
      const creditors = await mk('T2000', 'Creditors', 'liability')
      const capital = await mk('T3000', 'Capital', 'capital')
      const sales = await mk('T4000', 'Sales Income', 'income')
      const cogsAcc = await mk('T5000', 'COGS', 'expense')

      const salesJournal = await tx.journal.create({
        data: { name: 'Test Sales', type: 'sales', code: 'TINV' },
      })
      const miscJournal = await tx.journal.create({
        data: { name: 'Test Misc', type: 'miscellaneous', code: 'TMISC' },
      })

      const chair = await tx.product.create({
        data: {
          name: 'Test Office Chair', type: 'goods', trackInventory: true,
          salesPrice: '4500.00', cost: '2800.00',
        },
      })

      const today = new Date('2026-03-15')

      // ─────────── 1. balance rule ───────────
      section('1. Balance enforcement')

      const balanced = checkBalance([{ debit: '100.00', credit: 0 }, { debit: 0, credit: '100.00' }])
      assert(balanced.balanced === true, 'checkBalance() accepts a balanced pair')

      const off = checkBalance([{ debit: '100.00', credit: 0 }, { debit: 0, credit: '99.99' }])
      assertEq(off.difference, '0.01', 'checkBalance() reports the exact difference')
      assert(off.balanced === false, 'checkBalance() rejects a 1-paisa imbalance')

      await assertThrows(() => postEntry(tx, {
        journalId: miscJournal.id, date: today, items: [
          { accountId: cash.id, debit: '100.00', credit: 0 },
          { accountId: capital.id, debit: 0, credit: '99.99' },
        ],
      }), 422, 'postEntry rejects an unbalanced entry')

      await assertThrows(() => postEntry(tx, {
        journalId: miscJournal.id, date: today, items: [
          { accountId: cash.id, debit: '50.00', credit: '50.00' },
        ],
      }), 422, 'postEntry rejects a line with both debit and credit')

      await assertThrows(() => postEntry(tx, {
        journalId: miscJournal.id, date: today, items: [
          { accountId: cash.id, debit: '-100.00', credit: 0 },
          { accountId: capital.id, debit: 0, credit: '-100.00' },
        ],
      }), 422, 'postEntry rejects negative amounts')

      await assertThrows(() => postEntry(tx, {
        journalId: miscJournal.id, date: today, items: [],
      }), 422, 'postEntry rejects an entry with no lines')

      // ─────────── 2. posting + numbering ───────────
      section('2. Posting and sequence allocation')

      const opening = await postEntry(tx, {
        journalId: miscJournal.id, kind: 'opening', date: today,
        narration: 'Opening balance',
        items: [
          { accountId: cash.id, debit: '1000000.00', credit: 0 },
          { accountId: capital.id, debit: 0, credit: '1000000.00' },
        ],
      })
      assert(opening.state === 'posted', 'entry is created in posted state')
      assertEq(opening.items.length, 2, 'entry has both lines')
      assert(opening.number === 'TMISC/2026/0001', `first number is TMISC/2026/0001 (got ${opening.number})`)

      const second = await postEntry(tx, {
        journalId: miscJournal.id, date: today,
        items: [
          { accountId: cash.id, debit: '500.00', credit: 0 },
          { accountId: capital.id, debit: 0, credit: '500.00' },
        ],
      })
      assert(second.number === 'TMISC/2026/0002', `sequence increments gaplessly (got ${second.number})`)

      const otherJournal = await postEntry(tx, {
        journalId: salesJournal.id, kind: 'revenue', date: today,
        items: [
          { accountId: debtors.id, debit: '26550.00', credit: 0, partnerId: null },
          { accountId: sales.id, debit: 0, credit: '26550.00' },
        ],
      })
      assert(otherJournal.number === 'TINV/2026/0001', `sequences are per-journal (got ${otherJournal.number})`)

      // ─────────── 3. immutability + reversal ───────────
      section('3. Immutability and reversal')

      assertThrowsSync(() => assertMutable(opening, 'entry'), 409, 'assertMutable blocks editing a posted entry')

      const reversal = await reverseEntry(tx, {
        entryId: second.id, date: today, reason: 'Keyed in error',
      })
      assert(reversal.kind === 'reversal', 'reversal is tagged as kind=reversal')
      assert(reversal.reversalOfId === second.id, 'reversal links back to the original')

      const origLine = second.items.find((i) => D(i.debit).greaterThan(0))
      const revLine = reversal.items.find((i) => i.accountId === origLine.accountId)
      assertEq(revLine.credit, origLine.debit, 'reversal mirrors debit into credit')

      await assertThrows(() => reverseEntry(tx, { entryId: second.id, date: today }),
        409, 'a second reversal of the same entry is refused')

      // ─────────── 4. trial balance ───────────
      section('4. Trial balance')

      const agg = await tx.journalItem.aggregate({ _sum: { debit: true, credit: true } })
      const td = money(agg._sum.debit ?? 0)
      const tc = money(agg._sum.credit ?? 0)
      assertEq(td, tc, 'Σ debit == Σ credit across every posted line')

      // ─────────── 5. moving-average inventory ───────────
      section('5. Perpetual inventory — moving average')

      const in1 = await applyStockIn(tx, {
        productId: chair.id, quantity: 10, unitCost: 100, date: today, reference: 'TEST-1',
      })
      assertEq(in1.qtyAfter, '10', 'receipt 1: quantity on hand')
      assertEq(in1.avgCostAfter, '100', 'receipt 1: average cost')

      const in2 = await applyStockIn(tx, {
        productId: chair.id, quantity: 10, unitCost: 120, date: today, reference: 'TEST-2',
      })
      assertEq(in2.qtyAfter, '20', 'receipt 2: quantity on hand')
      assertEq(in2.avgCostAfter, '110', 'receipt 2: (10×100 + 10×120) / 20 = 110')

      const out1 = await applyStockOut(tx, {
        productId: chair.id, quantity: 5, date: today, reference: 'TEST-3',
      })
      assertEq(out1.unitCost, '110', 'delivery consumes at the current average')
      assertEq(out1.value, '550', 'delivery COGS value = 5 × 110')
      assertEq(out1.qtyAfter, '15', 'delivery reduces quantity')

      const afterOut = await tx.product.findUnique({
        where: { id: chair.id }, select: { avgCost: true, onHandQty: true },
      })
      assertEq(afterOut.avgCost, '110', 'average cost is UNCHANGED by an outward move')

      await assertThrows(() => applyStockOut(tx, {
        productId: chair.id, quantity: 1000, date: today,
      }), 422, 'delivery beyond stock on hand is blocked')

      // ─────────── 6. valuation ties to the ledger ───────────
      section('6. Valuation ties out')

      const val = await valuationAsOf(tx, { asOf: today })
      const line = val.lines.find((l) => l.productId === chair.id)
      assertEq(line.quantity, '15', 'valuation rebuilt from layers: quantity')
      // This product's own line, not the whole valuation. Asserting the global
      // total meant asserting the rest of the database was empty, which only
      // held while the seed happened to date every layer after this harness's
      // `asOf`. It is the per-product figure this section is actually testing.
      assertEq(line.value, '1650', 'valuation rebuilt from layers: value (15 × 110)')
      assertEq(line.maintainedQty, line.quantity,
        'maintained product.onHandQty matches the recomputed layer history')

      // post the matching ledger entries and prove the control account agrees
      await postEntry(tx, {
        journalId: miscJournal.id, kind: 'bill', date: today, reference: 'TEST-IN',
        items: [
          { accountId: inventory.id, debit: '2200.00', credit: 0 },
          { accountId: creditors.id, debit: 0, credit: '2200.00' },
        ],
      })
      await postEntry(tx, {
        journalId: miscJournal.id, kind: 'cogs', date: today, reference: 'TEST-OUT',
        items: [
          { accountId: cogsAcc.id, debit: '550.00', credit: 0 },
          { accountId: inventory.id, debit: 0, credit: '550.00' },
        ],
      })

      // This harness posts to its own T1300, not the real Inventory account,
      // so the comparison has to be against this product's valuation line
      // rather than the whole company's. Comparing a private test account to a
      // global total only balances on an empty database — which is what this
      // assertion was quietly relying on, and stopped being true the moment
      // the seed carried a year and a half of stock.
      const invAgg = await tx.journalItem.aggregate({
        where: { accountId: inventory.id, entry: { state: 'posted', date: { lte: today } } },
        _sum: { debit: true, credit: true },
      })
      const invBalance = money(D(invAgg._sum.debit ?? 0).minus(D(invAgg._sum.credit ?? 0)))
      assertEq(invBalance, line.value,
        "test inventory account balance == that product's valuation")

      // ─────────── 7. stock adjustment ───────────
      section('7. Stock adjustment')

      const adj = await applyStockAdjustment(tx, {
        productId: chair.id, countedQty: 12, date: today, reference: 'COUNT-1',
      })
      assertEq(adj.delta, '-3', 'shortage of 3 detected against system quantity')
      assertEq(adj.qtyAfter, '12', 'counted quantity becomes the new on-hand')

      const noop = await applyStockAdjustment(tx, {
        productId: chair.id, countedQty: 12, date: today,
      })
      assert(noop.skipped === true, 'a zero-delta count writes no move')

      // ─────────── 8. append-only audit ───────────
      section('8. Append-only valuation history')

      const layers = await tx.stockValuationLayer.findMany({
        where: { productId: chair.id }, orderBy: { createdAt: 'asc' },
        select: { quantity: true, unitCost: true, value: true, qtyAfter: true, avgCostAfter: true },
      })
      assertEq(layers.length, 4, 'every move left a valuation layer (2 in, 1 out, 1 adjustment)')
      const layerQty = layers.reduce((a, l) => a.plus(D(l.quantity)), D(0))
      assertEq(layerQty, '12', 'Σ layer quantities == current on-hand')

      const auditCount = await tx.auditLog.count()
      assert(auditCount >= 6, `audit log recorded every posting (${auditCount} rows)`)

      throw new Rollback()
    }, { timeout: 60000, maxWait: 10000 })
  } catch (err) {
    if (!(err instanceof Rollback)) {
      console.error('\n\x1b[31mHARNESS ERROR\x1b[0m', err)
      fail++
    }
  }

  const left = await prisma.journalEntry.count()
  console.log(`\n\x1b[2mtransaction rolled back — journal_entries in database: ${left}\x1b[0m`)

  console.log(`\n\x1b[1m${'─'.repeat(56)}\x1b[0m`)
  console.log(`\x1b[1m  ${pass} passed, ${fail} failed\x1b[0m`)
  console.log(`\x1b[1m${'─'.repeat(56)}\x1b[0m\n`)

  await prisma.$disconnect()
  process.exit(fail === 0 ? 0 : 1)
}

/** Synchronous variant of assertThrows for non-async guards. */
function assertThrowsSync(fn, status, name) {
  try {
    fn()
    bad(name, `expected a ${status} but nothing was thrown`)
  } catch (err) {
    if (err.status === status) ok(`${name}  → ${status}`)
    else bad(name, `expected status ${status}, got ${err.status ?? '?'}: ${err.message}`)
  }
}

main()
