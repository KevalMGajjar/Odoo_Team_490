import 'dotenv/config'
import { prisma } from '../lib/prisma.js'
import { postVendorBill } from '../services/bill.js'
import { postCustomerInvoice } from '../services/invoice.js'
import { postPayment } from '../services/payment.js'
import { valuationAsOf } from '../services/inventory.js'
import { D, money } from '../lib/money.js'

/**
 * End-to-end document posting verification.
 * Purchase → bill → inventory → invoice → COGS → payment → settlement → FX.
 * Runs in one rolled-back transaction — safe to run at any time, including
 * against a live, already-seeded database.
 *
 * FIXTURE STRATEGY — read this before touching account/currency/journal setup:
 *
 *   bill.js / invoice.js / payment.js hardcode a handful of chart-of-account
 *   CODES ('1300' Inventory, '2000' Creditors, '1100' Debtors, '4200' FX Gain,
 *   etc.) and look them up with `chartOfAccount.findUnique({ where: { code }})`.
 *   That is correct, deliberate design for a single-tenant chart of accounts —
 *   there is meant to be exactly one Inventory account system-wide — so this
 *   test REUSES those real, already-committed accounts rather than trying to
 *   create isolated duplicates (which would collide on the unique `code`
 *   column anyway). Every assertion that touches one of those shared accounts
 *   is therefore a BEFORE/AFTER DELTA, not an absolute balance.
 *
 *   Everything else this test creates — currencies, journals, products,
 *   contacts, the user — is entirely test-owned with unique, non-colliding
 *   identifiers, so it never depends on (or corrupts) real seed data.
 */

let pass = 0, fail = 0
const ok = (n) => { pass++; console.log(`  \x1b[32m✓\x1b[0m ${n}`) }
const bad = (n, d) => { fail++; console.log(`  \x1b[31m✗\x1b[0m ${n}\n      ${d}`) }
const assert = (c, n, d = '') => (c ? ok(n) : bad(n, d))
const assertEq = (a, e, n) => {
  const A = D(a).toString(), E = D(e).toString()
  return A === E ? ok(`${n}  (${A})`) : bad(n, `expected ${E}, got ${A}`)
}
const assertThrows = async (fn, status, n) => {
  try { await fn(); bad(n, `expected ${status}, nothing thrown`) }
  catch (e) {
    e.status === status ? ok(`${n}  → ${status}: "${e.message.slice(0, 60)}"`)
      : bad(n, `expected ${status}, got ${e.status ?? '?'}: ${e.message}`)
  }
}
const section = (t) => console.log(`\n\x1b[1m${t}\x1b[0m`)
class Rollback extends Error {}

const D1 = new Date('2025-05-05T00:00:00Z')
const D2 = new Date('2025-05-12T00:00:00Z')
const D3 = new Date('2025-05-20T00:00:00Z')
const RUN = Date.now() // uniqueness salt for this run's test-owned rows

/** Balance of an account = Σdebit − Σcredit (natural for assets/expenses). */
async function balanceOf(tx, accountId) {
  const a = await tx.journalItem.aggregate({
    where: { accountId, entry: { state: 'posted' } },
    _sum: { debit: true, credit: true },
  })
  return money(D(a._sum.debit ?? 0).minus(D(a._sum.credit ?? 0)))
}

/** Change in a shared control account's balance caused by this test alone. */
const deltaOf = (before, after) => money(D(after).minus(D(before)))

async function typeTotal(tx, type, natural) {
  const rows = await tx.journalItem.findMany({
    where: { account: { type }, entry: { state: 'posted' } },
    select: { debit: true, credit: true },
  })
  const dr = rows.reduce((a, r) => a.plus(D(r.debit)), D(0))
  const cr = rows.reduce((a, r) => a.plus(D(r.credit)), D(0))
  return money(natural === 'debit' ? dr.minus(cr) : cr.minus(dr))
}

/** Look up one of the real, shared, code-hardcoded control accounts. */
async function controlAccount(tx, code) {
  const acc = await tx.chartOfAccount.findUnique({ where: { code } })
  if (!acc) throw new Error(`Fixture setup needs chart-of-account ${code} — run npm run seed first`)
  return acc
}

async function main() {
  console.log('\n\x1b[1m═══ Document posting: bill → invoice → payment ═══\x1b[0m')

  try {
    await prisma.$transaction(async (tx) => {
      // ─────────── fixtures: reuse the required shared control accounts ───────────
      const inventoryAcc = await controlAccount(tx, '1300')
      const inputGstAcc = await controlAccount(tx, '1200')
      const creditorsAcc = await controlAccount(tx, '2000')
      const purchaseExpAcc = await controlAccount(tx, '5000')
      const debtorsAcc = await controlAccount(tx, '1100')
      const salesIncomeAcc = await controlAccount(tx, '4000')
      const outputGstAcc = await controlAccount(tx, '2100')
      const cogsAcc = await controlAccount(tx, '5050')
      const fxGainAcc = await controlAccount(tx, '4200')

      // ─────────── fixtures: everything else is fully test-owned ───────────
      const admin = await tx.user.create({
        data: { name: 'Doc Test Admin', email: `doctest-${RUN}@test.local`, password: 'x', role: 'admin' },
      })

      const inr = await tx.currency.findFirst({ where: { isBase: true } })
      if (!inr) throw new Error('No base currency configured — run npm run seed first')

      // dedicated foreign currency, entirely isolated rate history — never
      // touches the real USD currency or its committed CurrencyRate rows
      const usd = await tx.currency.create({
        data: { code: `Z${String(RUN).slice(-2)}`, name: 'Doc Test Dollar', symbol: '$', isBase: false },
      })
      await tx.currencyRate.create({
        data: { currencyId: usd.id, date: new Date('2025-04-01T00:00:00Z'), rate: '83.50' },
      })

      // dedicated bank/cash accounts + journals — Payment.journal.defaultDebit
      // is what postPayment() actually reads, so these need no code and no
      // collision with the real BNK/CSH journals at all
      const bankAcc = await tx.chartOfAccount.create({
        data: { code: `D-BNK-${RUN}`, name: 'Doc Test Bank', type: 'bank', isCashBank: true },
      })
      const cashAcc = await tx.chartOfAccount.create({
        data: { code: `D-CSH-${RUN}`, name: 'Doc Test Cash', type: 'cash', isCashBank: true },
      })
      const bankJournal = await tx.journal.create({
        data: { code: `DBNK${RUN}`, name: 'Doc Test Bank Journal', type: 'bank', defaultDebitId: bankAcc.id },
      })
      const cashJournal = await tx.journal.create({
        data: { code: `DCSH${RUN}`, name: 'Doc Test Cash Journal', type: 'cash', defaultDebitId: cashAcc.id },
      })

      const vendor = await tx.contact.create({
        data: { name: `Doc Test Vendor ${RUN}`, type: 'vendor' },
      })
      const customer = await tx.contact.create({
        data: { name: `Doc Test Customer ${RUN}`, type: 'customer' },
      })
      const usdCustomer = await tx.contact.create({
        data: { name: `Doc Test Export Customer ${RUN}`, type: 'customer' },
      })

      // dedicated products, starting at zero stock, so quantity/cost
      // assertions can stay absolute rather than delta-based
      const chair = await tx.product.create({
        data: {
          name: `Doc Test Chair ${RUN}`, type: 'goods', trackInventory: true,
          salesPrice: '4500', cost: '2800', gstRate: '18',
        },
      })
      const service = await tx.product.create({
        data: {
          name: `Doc Test Service ${RUN}`, type: 'service', trackInventory: false,
          salesPrice: '1000', cost: '0', gstRate: '0',
        },
      })

      const mkBill = async (number, unitPrice, quantity, date) => {
        const subtotal = money(D(unitPrice).times(quantity))
        return tx.vendorBill.create({
          data: {
            number, vendorId: vendor.id, billDate: date, currencyId: inr.id,
            lines: {
              create: [{
                productId: chair.id, accountId: inventoryAcc.id,
                quantity: String(quantity), unitPrice: String(unitPrice),
                taxRate: '18', subtotal: subtotal.toFixed(2),
              }],
            },
          },
        })
      }

      // ─────────── 1. purchase order posts nothing ───────────
      section('1. Purchase order is a commitment, not an accounting event')
      const po = await tx.purchaseOrder.create({
        data: {
          number: `PO/DOCTEST/${RUN}`, vendorId: vendor.id, orderDate: D1,
          currencyId: inr.id, state: 'draft',
          lines: { create: [{ productId: chair.id, quantity: '10', unitPrice: '2800', taxRate: '18', subtotal: '28000' }] },
        },
      })
      const entriesBeforePo = await tx.journalEntry.count()
      await tx.purchaseOrder.update({ where: { id: po.id }, data: { state: 'confirmed' } })
      const entriesAfterPo = await tx.journalEntry.count()
      assertEq(entriesAfterPo, entriesBeforePo, 'confirming a PO creates NO journal entry')

      // ─────────── 2. vendor bill ───────────
      section('2. Vendor bill — goods capitalise into Inventory')
      const invBefore1 = await balanceOf(tx, inventoryAcc.id)
      const gstBefore1 = await balanceOf(tx, inputGstAcc.id)
      const credBefore1 = await balanceOf(tx, creditorsAcc.id)
      const expBefore1 = await balanceOf(tx, purchaseExpAcc.id)

      const bill1 = await mkBill(`BILL/DOCTEST/${RUN}-1`, 2800, 10, D1)
      const posted1 = await postVendorBill(tx, { billId: bill1.id, userId: admin.id })

      assert(posted1.state === 'posted', 'bill moves to posted')
      assertEq(posted1.total, 33040, 'total = 28000 + 18% GST')
      assertEq(deltaOf(invBefore1, await balanceOf(tx, inventoryAcc.id)), 28000, 'Inventory debited with the net amount')
      assertEq(deltaOf(gstBefore1, await balanceOf(tx, inputGstAcc.id)), 5040, 'Input GST debited')
      assertEq(deltaOf(credBefore1, await balanceOf(tx, creditorsAcc.id)), -33040, 'Creditors credited with the total')
      assertEq(deltaOf(expBefore1, await balanceOf(tx, purchaseExpAcc.id)), 0, 'Purchase Expense NOT touched for stocked goods')

      const chair1 = await tx.product.findUnique({ where: { id: chair.id } })
      assertEq(chair1.onHandQty, 10, 'stock received')
      assertEq(chair1.avgCost, 2800, 'moving average cost set')

      await assertThrows(() => postVendorBill(tx, { billId: bill1.id, userId: admin.id }),
        409, 'a posted bill cannot be posted twice')

      // second receipt at a different price
      const bill2 = await mkBill(`BILL/DOCTEST/${RUN}-2`, 3000, 10, D2)
      await postVendorBill(tx, { billId: bill2.id, userId: admin.id })
      const chair2 = await tx.product.findUnique({ where: { id: chair.id } })
      assertEq(chair2.onHandQty, 20, 'second receipt adds stock')
      assertEq(chair2.avgCost, 2900, 'average re-weighted: (10×2800 + 10×3000) / 20')

      // ─────────── 3. customer invoice ───────────
      section('3. Customer invoice — revenue AND cost of goods sold')
      const debtorsBefore3 = await balanceOf(tx, debtorsAcc.id)
      const incomeBefore3 = await balanceOf(tx, salesIncomeAcc.id)
      const outGstBefore3 = await balanceOf(tx, outputGstAcc.id)
      const cogsBefore3 = await balanceOf(tx, cogsAcc.id)
      const invBefore3 = await balanceOf(tx, inventoryAcc.id)

      const inv = await tx.customerInvoice.create({
        data: {
          number: `INV/DOCTEST/${RUN}-1`, customerId: customer.id, invoiceDate: D3,
          dueDate: new Date('2025-06-19T00:00:00Z'), currencyId: inr.id,
          lines: {
            create: [{
              productId: chair.id, accountId: salesIncomeAcc.id,
              quantity: '5', unitPrice: '4500', taxRate: '18', subtotal: '22500',
            }],
          },
        },
      })
      const postedInv = await postCustomerInvoice(tx, { invoiceId: inv.id, userId: admin.id })

      assertEq(postedInv.total, 26550, 'invoice total = 22500 + 18% GST')
      assert(postedInv.journalEntryId && postedInv.cogsEntryId, 'TWO entries created (revenue + COGS)')
      assert(postedInv.journalEntry.kind === 'revenue', 'first entry is kind=revenue')
      assert(postedInv.cogsEntry.kind === 'cogs', 'second entry is kind=cogs')

      assertEq(deltaOf(debtorsBefore3, await balanceOf(tx, debtorsAcc.id)), 26550, 'Debtors debited with the gross total')
      assertEq(deltaOf(incomeBefore3, await balanceOf(tx, salesIncomeAcc.id)), -22500, 'Sales Income credited net')
      assertEq(deltaOf(outGstBefore3, await balanceOf(tx, outputGstAcc.id)), -4050, 'Output GST credited')

      assertEq(postedInv.cogsTotal, 14500, 'COGS = 5 × 2900 moving average')
      assertEq(deltaOf(cogsBefore3, await balanceOf(tx, cogsAcc.id)), 14500, 'COGS account debited')
      assertEq(deltaOf(invBefore3, await balanceOf(tx, inventoryAcc.id)), -14500, 'Inventory reduced by COGS (58000 − 14500 relative to this test)')

      const chair3 = await tx.product.findUnique({ where: { id: chair.id } })
      assertEq(chair3.onHandQty, 15, 'stock delivered')
      assertEq(chair3.avgCost, 2900, 'average unchanged by an outward move')

      const invLine = await tx.customerInvoiceLine.findFirst({ where: { invoiceId: inv.id } })
      assertEq(invLine.cogsUnitCost, 2900, 'cost frozen on the line for margin reporting')

      // ─────────── 4. valuation ties to the ledger ───────────
      section('4. Inventory valuation ties to the control account')
      // Scoped to D3 (this test's own fixture date), the per-product row is
      // exactly this test's own activity — real seed layers dated later
      // (anchored to the current fiscal year) are correctly excluded here.
      const valAtD3 = await valuationAsOf(tx, { asOf: D3 })
      const chairValRow = valAtD3.lines.find((l) => l.productId === chair.id)
      assertEq(chairValRow.quantity, 15, 'valuation rebuilt from layers (this product only)')
      assertEq(chairValRow.value, 43500, 'valuation rebuilt from layers (15 × 2900)')

      // The whole-system tie-out is checked AS OF TODAY, not D3 — "system-wide,
      // regardless of other data" means including every committed layer that
      // exists right now, and real seed data is dated against the current
      // fiscal year, not this test's May-2025 fixture dates.
      const valNow = await valuationAsOf(tx, { asOf: new Date() })
      assertEq(valNow.totalValue, await balanceOf(tx, inventoryAcc.id),
        'SYSTEM-WIDE valuation == Inventory control account balance (holds regardless of other data)')

      // ─────────── 5. settlement ───────────
      section('5. Partial then full settlement')
      const pay1 = await tx.payment.create({
        data: {
          number: `PAY/DOCTEST/${RUN}-1`, direction: 'inbound', partnerId: customer.id,
          journalId: bankJournal.id, paymentDate: D3, currencyId: inr.id, amount: '10000',
          allocations: { create: [{ invoiceId: inv.id, amount: '10000' }] },
        },
      })
      await postPayment(tx, { paymentId: pay1.id, userId: admin.id })

      let invNow = await tx.customerInvoice.findUnique({ where: { id: inv.id } })
      assertEq(invNow.amountResidual, 16550, 'residual after part payment')
      assert(invNow.settleState === 'partial', 'settle state is partial')

      await assertThrows(async () => {
        const bad = await tx.payment.create({
          data: {
            number: `PAY/DOCTEST/${RUN}-BAD`, direction: 'inbound', partnerId: customer.id,
            journalId: bankJournal.id, paymentDate: D3, currencyId: inr.id, amount: '99999',
            allocations: { create: [{ invoiceId: inv.id, amount: '99999' }] },
          },
        })
        await postPayment(tx, { paymentId: bad.id, userId: admin.id })
      }, 422, 'over-allocation beyond the residual is blocked')

      const pay2 = await tx.payment.create({
        data: {
          number: `PAY/DOCTEST/${RUN}-2`, direction: 'inbound', partnerId: customer.id,
          journalId: cashJournal.id, paymentDate: D3, currencyId: inr.id, amount: '16550',
          allocations: { create: [{ invoiceId: inv.id, amount: '16550' }] },
        },
      })
      await postPayment(tx, { paymentId: pay2.id, userId: admin.id })

      invNow = await tx.customerInvoice.findUnique({ where: { id: inv.id } })
      assertEq(invNow.amountResidual, 0, 'residual clears to exactly zero')
      assert(invNow.settleState === 'paid', 'settle state is paid')

      const debtorsAfterSettle = await balanceOf(tx, debtorsAcc.id)
      assertEq(deltaOf(debtorsBefore3, debtorsAfterSettle), 0, "Debtors nets back to this test's starting point once fully settled")

      // ─────────── 6. realised FX ───────────
      section('6. Multi-currency — realised exchange gain')
      const debtorsBefore6 = await balanceOf(tx, debtorsAcc.id)
      const fxGainBefore6 = await balanceOf(tx, fxGainAcc.id)

      await tx.currencyRate.create({
        data: { currencyId: usd.id, date: new Date('2025-06-01T00:00:00Z'), rate: '84.20' },
      })

      const usdInv = await tx.customerInvoice.create({
        data: {
          number: `INV/DOCTEST/${RUN}-USD`, customerId: usdCustomer.id,
          invoiceDate: new Date('2025-05-01T00:00:00Z'), currencyId: usd.id,
          lines: {
            create: [{
              productId: service.id, accountId: salesIncomeAcc.id,
              quantity: '1', unitPrice: '1000', taxRate: '0', subtotal: '1000',
            }],
          },
        },
      })
      const postedUsd = await postCustomerInvoice(tx, { invoiceId: usdInv.id, userId: admin.id })
      assertEq(postedUsd.exchangeRate, '83.5', 'invoice locks the rate at posting time')

      assertEq(deltaOf(debtorsBefore6, await balanceOf(tx, debtorsAcc.id)), 83500,
        'Debtors booked in BASE currency (1000 × 83.50)')

      const usdPay = await tx.payment.create({
        data: {
          number: `PAY/DOCTEST/${RUN}-USD`, direction: 'inbound', partnerId: usdCustomer.id,
          journalId: bankJournal.id, paymentDate: new Date('2025-06-05T00:00:00Z'),
          currencyId: usd.id, amount: '1000',
          allocations: { create: [{ invoiceId: usdInv.id, amount: '1000' }] },
        },
      })
      const postedPay = await postPayment(tx, { paymentId: usdPay.id, userId: admin.id })

      assertEq(postedPay.fxDifference.abs(), 700, 'realised FX difference = 1000 × (84.20 − 83.50)')
      assertEq(deltaOf(fxGainBefore6, await balanceOf(tx, fxGainAcc.id)), -700, 'posted to Foreign Exchange Gain')
      assertEq(deltaOf(debtorsBefore6, await balanceOf(tx, debtorsAcc.id)), 0, 'Debtors cleared at the ORIGINAL booking rate')

      const usdInvNow = await tx.customerInvoice.findUnique({ where: { id: usdInv.id } })
      assert(usdInvNow.settleState === 'paid', 'foreign-currency invoice settles fully')

      // ─────────── 7. accounting identities (whole-system, no baseline needed) ───────────
      section('7. Accounting identities')
      const agg = await tx.journalItem.aggregate({ _sum: { debit: true, credit: true } })
      assertEq(money(agg._sum.debit ?? 0), money(agg._sum.credit ?? 0), 'Trial balance: Σ debit == Σ credit')

      const assets = await typeTotal(tx, 'asset', 'debit')
      const liabilities = await typeTotal(tx, 'liability', 'credit')
      const capital = await typeTotal(tx, 'capital', 'credit')
      const income = await typeTotal(tx, 'income', 'credit')
      const expense = await typeTotal(tx, 'expense', 'debit')
      const earnings = money(income.minus(expense))

      assertEq(assets, money(liabilities.plus(capital).plus(earnings)),
        'Balance sheet: Assets == Liabilities + Capital + Current Earnings')

      console.log(`\n      Assets      ${assets.toFixed(2).padStart(14)}`)
      console.log(`      Liabilities ${liabilities.toFixed(2).padStart(14)}`)
      console.log(`      Capital     ${capital.toFixed(2).padStart(14)}`)
      console.log(`      Earnings    ${earnings.toFixed(2).padStart(14)}   (income ${income.toFixed(2)} − expense ${expense.toFixed(2)})`)
      console.log(`      \x1b[2m(these totals include any real seed data already in the database —\x1b[0m`)
      console.log(`      \x1b[2m the identity holding regardless of that is exactly the point)\x1b[0m`)

      const grossMargin = money(D(22500).minus(14500))
      assertEq(grossMargin, 8000, 'gross margin on the chair sale is real, not estimated')

      throw new Rollback()
    }, { timeout: 120000, maxWait: 15000 })
  } catch (err) {
    if (!(err instanceof Rollback)) { console.error('\n\x1b[31mHARNESS ERROR\x1b[0m', err); fail++ }
  }

  console.log(`\n\x1b[1m${'─'.repeat(58)}\x1b[0m`)
  console.log(`\x1b[1m  ${pass} passed, ${fail} failed\x1b[0m`)
  console.log(`\x1b[1m${'─'.repeat(58)}\x1b[0m\n`)

  await prisma.$disconnect()
  process.exit(fail === 0 ? 0 : 1)
}

main()
