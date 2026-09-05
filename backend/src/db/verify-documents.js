import 'dotenv/config'
import { prisma } from '../lib/prisma.js'
import { seedMasters } from './seedMasters.js'
import { postEntry } from '../services/ledger.js'
import { postVendorBill } from '../services/bill.js'
import { postCustomerInvoice } from '../services/invoice.js'
import { postPayment } from '../services/payment.js'
import { valuationAsOf } from '../services/inventory.js'
import { D, money } from '../lib/money.js'

/**
 * End-to-end document posting verification.
 * Purchase → bill → inventory → invoice → COGS → payment → settlement → FX.
 * Runs in one rolled-back transaction.
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

/** Balance of an account = Σdebit − Σcredit (natural for assets/expenses). */
async function balanceOf(tx, accountId) {
  const a = await tx.journalItem.aggregate({
    where: { accountId, entry: { state: 'posted' } },
    _sum: { debit: true, credit: true },
  })
  return money(D(a._sum.debit ?? 0).minus(D(a._sum.credit ?? 0)))
}

async function typeTotal(tx, type, natural) {
  const rows = await tx.journalItem.findMany({
    where: { account: { type }, entry: { state: 'posted' } },
    select: { debit: true, credit: true },
  })
  const dr = rows.reduce((a, r) => a.plus(D(r.debit)), D(0))
  const cr = rows.reduce((a, r) => a.plus(D(r.credit)), D(0))
  return money(natural === 'debit' ? dr.minus(cr) : cr.minus(dr))
}

async function main() {
  console.log('\n\x1b[1m═══ Document posting: bill → invoice → payment ═══\x1b[0m')

  try {
    await prisma.$transaction(async (tx) => {
      const m = await seedMasters(tx, { log: () => {} })
      const A = m.accounts, P = m.products, C = m.contacts, U = m.users
      const inr = m.currencies.INR, usd = m.currencies.USD

      // opening balances so the balance sheet isn't empty
      await postEntry(tx, {
        journalId: m.journals.MISC.id, kind: 'opening', date: new Date('2025-04-01T00:00:00Z'),
        narration: 'Opening balance', userId: U.admin.id,
        items: [
          { accountId: A['1000'].id, debit: 150000, credit: 0 },
          { accountId: A['1010'].id, debit: 850000, credit: 0 },
          { accountId: A['3000'].id, debit: 0, credit: 1000000 },
        ],
      })

      const chair = P['Office Chair']
      const vendor = C['Azure Furniture Pvt Ltd']
      const customer = C['Nimesh Pathak']

      const mkBill = async (number, unitPrice, quantity, date) => {
        const subtotal = money(D(unitPrice).times(quantity))
        return tx.vendorBill.create({
          data: {
            number, vendorId: vendor.id, billDate: date, currencyId: inr.id,
            lines: {
              create: [{
                productId: chair.id, accountId: A['1300'].id,
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
          number: 'PO/2025/0001', vendorId: vendor.id, orderDate: D1,
          currencyId: inr.id, state: 'draft',
          lines: { create: [{ productId: chair.id, quantity: '10', unitPrice: '2800', taxRate: '18', subtotal: '28000' }] },
        },
      })
      await tx.purchaseOrder.update({ where: { id: po.id }, data: { state: 'confirmed' } })
      const afterPo = await tx.journalEntry.count({ where: { kind: { in: ['bill', 'revenue'] } } })
      assertEq(afterPo, 0, 'confirming a PO creates NO journal entry')

      // ─────────── 2. vendor bill ───────────
      section('2. Vendor bill — goods capitalise into Inventory')
      const bill1 = await mkBill('BILL/2025/0001', 2800, 10, D1)
      const posted1 = await postVendorBill(tx, { billId: bill1.id, userId: U.admin.id })

      assert(posted1.state === 'posted', 'bill moves to posted')
      assertEq(posted1.total, 33040, 'total = 28000 + 18% GST')
      assertEq(await balanceOf(tx, A['1300'].id), 28000, 'Inventory debited with the net amount')
      assertEq(await balanceOf(tx, A['1200'].id), 5040, 'Input GST debited')
      assertEq(money(D(await balanceOf(tx, A['2000'].id)).negated()), 33040, 'Creditors credited with the total')
      assertEq(await balanceOf(tx, A['5000'].id), 0, 'Purchase Expense NOT touched for stocked goods')

      const chair1 = await tx.product.findUnique({ where: { id: chair.id } })
      assertEq(chair1.onHandQty, 10, 'stock received')
      assertEq(chair1.avgCost, 2800, 'moving average cost set')

      await assertThrows(() => postVendorBill(tx, { billId: bill1.id, userId: U.admin.id }),
        409, 'a posted bill cannot be posted twice')

      // second receipt at a different price
      const bill2 = await mkBill('BILL/2025/0002', 3000, 10, D2)
      await postVendorBill(tx, { billId: bill2.id, userId: U.admin.id })
      const chair2 = await tx.product.findUnique({ where: { id: chair.id } })
      assertEq(chair2.onHandQty, 20, 'second receipt adds stock')
      assertEq(chair2.avgCost, 2900, 'average re-weighted: (10×2800 + 10×3000) / 20')

      // ─────────── 3. customer invoice ───────────
      section('3. Customer invoice — revenue AND cost of goods sold')
      const inv = await tx.customerInvoice.create({
        data: {
          number: 'INV/2025/0001', customerId: customer.id, invoiceDate: D3,
          dueDate: new Date('2025-06-19T00:00:00Z'), currencyId: inr.id,
          lines: {
            create: [{
              productId: chair.id, accountId: A['4000'].id,
              quantity: '5', unitPrice: '4500', taxRate: '18', subtotal: '22500',
            }],
          },
        },
      })
      const postedInv = await postCustomerInvoice(tx, { invoiceId: inv.id, userId: U.admin.id })

      assertEq(postedInv.total, 26550, 'invoice total = 22500 + 18% GST')
      assert(postedInv.journalEntryId && postedInv.cogsEntryId, 'TWO entries created (revenue + COGS)')
      assert(postedInv.journalEntry.kind === 'revenue', 'first entry is kind=revenue')
      assert(postedInv.cogsEntry.kind === 'cogs', 'second entry is kind=cogs')

      assertEq(await balanceOf(tx, A['1100'].id), 26550, 'Debtors debited with the gross total')
      assertEq(money(D(await balanceOf(tx, A['4000'].id)).negated()), 22500, 'Sales Income credited net')
      assertEq(money(D(await balanceOf(tx, A['2100'].id)).negated()), 4050, 'Output GST credited')

      assertEq(postedInv.cogsTotal, 14500, 'COGS = 5 × 2900 moving average')
      assertEq(await balanceOf(tx, A['5050'].id), 14500, 'COGS account debited')
      assertEq(await balanceOf(tx, A['1300'].id), 43500, 'Inventory reduced: 58000 − 14500')

      const chair3 = await tx.product.findUnique({ where: { id: chair.id } })
      assertEq(chair3.onHandQty, 15, 'stock delivered')
      assertEq(chair3.avgCost, 2900, 'average unchanged by an outward move')

      const invLine = await tx.customerInvoiceLine.findFirst({ where: { invoiceId: inv.id } })
      assertEq(invLine.cogsUnitCost, 2900, 'cost frozen on the line for margin reporting')

      // ─────────── 4. valuation ties to the ledger ───────────
      section('4. Inventory valuation ties to the control account')
      const val = await valuationAsOf(tx, { asOf: D3 })
      assertEq(val.totalValue, 43500, 'valuation rebuilt from layers (15 × 2900)')
      assertEq(val.totalValue, await balanceOf(tx, A['1300'].id),
        'valuation == Inventory control account balance')

      // ─────────── 5. settlement ───────────
      section('5. Partial then full settlement')
      const pay1 = await tx.payment.create({
        data: {
          number: 'PAY/2025/0001', direction: 'inbound', partnerId: customer.id,
          journalId: m.journals.BNK.id, paymentDate: D3, currencyId: inr.id, amount: '10000',
          allocations: { create: [{ invoiceId: inv.id, amount: '10000' }] },
        },
      })
      await postPayment(tx, { paymentId: pay1.id, userId: U.admin.id })

      let invNow = await tx.customerInvoice.findUnique({ where: { id: inv.id } })
      assertEq(invNow.amountResidual, 16550, 'residual after part payment')
      assert(invNow.settleState === 'partial', 'settle state is partial')

      await assertThrows(async () => {
        const bad = await tx.payment.create({
          data: {
            number: 'PAY/2025/0009', direction: 'inbound', partnerId: customer.id,
            journalId: m.journals.BNK.id, paymentDate: D3, currencyId: inr.id, amount: '99999',
            allocations: { create: [{ invoiceId: inv.id, amount: '99999' }] },
          },
        })
        await postPayment(tx, { paymentId: bad.id, userId: U.admin.id })
      }, 422, 'over-allocation beyond the residual is blocked')

      const pay2 = await tx.payment.create({
        data: {
          number: 'PAY/2025/0002', direction: 'inbound', partnerId: customer.id,
          journalId: m.journals.CSH.id, paymentDate: D3, currencyId: inr.id, amount: '16550',
          allocations: { create: [{ invoiceId: inv.id, amount: '16550' }] },
        },
      })
      await postPayment(tx, { paymentId: pay2.id, userId: U.admin.id })

      invNow = await tx.customerInvoice.findUnique({ where: { id: inv.id } })
      assertEq(invNow.amountResidual, 0, 'residual clears to exactly zero')
      assert(invNow.settleState === 'paid', 'settle state is paid')
      assertEq(await balanceOf(tx, A['1100'].id), 0, 'Debtors nets to zero once fully settled')

      // ─────────── 6. realised FX ───────────
      section('6. Multi-currency — realised exchange gain')
      await tx.currencyRate.create({
        data: { currencyId: usd.id, date: new Date('2025-06-01T00:00:00Z'), rate: '84.20' },
      })

      const usdInv = await tx.customerInvoice.create({
        data: {
          number: 'INV/2025/0002', customerId: C['Vertex Trading FZE'].id,
          invoiceDate: new Date('2025-05-01T00:00:00Z'), currencyId: usd.id,
          lines: {
            create: [{
              productId: P['Assembly Service'].id, accountId: A['4000'].id,
              quantity: '1', unitPrice: '1000', taxRate: '0', subtotal: '1000',
            }],
          },
        },
      })
      const postedUsd = await postCustomerInvoice(tx, { invoiceId: usdInv.id, userId: U.admin.id })
      assertEq(postedUsd.exchangeRate, '83.5', 'invoice locks the rate at posting time')

      const debtorsBefore = await balanceOf(tx, A['1100'].id)
      assertEq(debtorsBefore, 83500, 'Debtors booked in BASE currency (1000 × 83.50)')

      const usdPay = await tx.payment.create({
        data: {
          number: 'PAY/2025/0003', direction: 'inbound', partnerId: C['Vertex Trading FZE'].id,
          journalId: m.journals.BNK.id, paymentDate: new Date('2025-06-05T00:00:00Z'),
          currencyId: usd.id, amount: '1000',
          allocations: { create: [{ invoiceId: usdInv.id, amount: '1000' }] },
        },
      })
      const postedPay = await postPayment(tx, { paymentId: usdPay.id, userId: U.admin.id })

      assertEq(postedPay.fxDifference.abs(), 700, 'realised FX difference = 1000 × (84.20 − 83.50)')
      assertEq(money(D(await balanceOf(tx, A['4200'].id)).negated()), 700, 'posted to Foreign Exchange Gain')
      assertEq(await balanceOf(tx, A['1100'].id), 0, 'Debtors cleared at the ORIGINAL booking rate')

      const usdInvNow = await tx.customerInvoice.findUnique({ where: { id: usdInv.id } })
      assert(usdInvNow.settleState === 'paid', 'foreign-currency invoice settles fully')

      // ─────────── 7. accounting identities ───────────
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

      console.log(`\n      Assets      ${assets.toFixed(2).padStart(12)}`)
      console.log(`      Liabilities ${liabilities.toFixed(2).padStart(12)}`)
      console.log(`      Capital     ${capital.toFixed(2).padStart(12)}`)
      console.log(`      Earnings    ${earnings.toFixed(2).padStart(12)}   (income ${income.toFixed(2)} − expense ${expense.toFixed(2)})`)

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
