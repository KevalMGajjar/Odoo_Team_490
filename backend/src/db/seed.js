import 'dotenv/config'
import { prisma } from '../lib/prisma.js'
import { seedMasters } from './seedMasters.js'
import { generateActivity } from './seedActivity.js'
import { postEntry } from '../services/ledger.js'
import { postVendorBill } from '../services/bill.js'
import { postCustomerInvoice } from '../services/invoice.js'
import { postPayment } from '../services/payment.js'
import { postVoucher } from '../services/voucher.js'
import { nextNumber } from '../services/sequence.js'
import { D, money, lineTax } from '../lib/money.js'

/**
 * Full demo seed.
 *
 *   npm run seed
 *
 * Wipes and reloads everything, then books ~4 months of realistic trading through
 * the SAME service layer the application uses — no hand-written journal entries.
 * If the seed runs clean, the posting engine works end to end.
 *
 * Idempotent and fast: you will run this live, mid-demo, more than once.
 */

const log = (m) => console.log(m)
const money2 = (v) => money(v).toFixed(2)

/**
 * Demo data is anchored to the CURRENT Indian financial year (April–March), so
 * reports open on a populated window whatever day the seed is run. Dates below
 * are written as a reference year and shifted; nothing is ever future-dated.
 */
const TODAY = new Date()

/**
 * Every date is shifted by whole months so the newest lands on the month the
 * seed is run in, which keeps reports opening on a populated window whatever
 * day that is.
 *
 * The previous version rewrote the year outright, to the start of the current
 * financial year. That works for data confined to one April-to-December run,
 * which the hand-written seed was — but it collapses anything longer: eighteen
 * months of generated trading all landed in a single year, out of order, with
 * January to March appearing before the April they follow.
 */
const REFERENCE_END = { y: 2026, m: 9 }
const MONTH_SHIFT =
  (TODAY.getUTCFullYear() - REFERENCE_END.y) * 12 + (TODAY.getUTCMonth() + 1 - REFERENCE_END.m)

const day = (s) => {
  const [y, m, d] = s.split('-').map(Number)
  const shifted = m - 1 + MONTH_SHIFT
  const date = new Date(Date.UTC(y + Math.floor(shifted / 12), ((shifted % 12) + 12) % 12, 1))
  // Clamp the day so the 31st of a shifted month never rolls into the next one.
  const lastDay = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0)).getUTCDate()
  date.setUTCDate(Math.min(d, lastDay))
  return date > TODAY ? TODAY : date
}

async function truncateAll() {
  const rows = await prisma.$queryRaw`
    SELECT tablename FROM pg_tables
    WHERE schemaname = 'public' AND tablename <> '_prisma_migrations'
  `
  const list = rows.map((r) => `"${r.tablename}"`).join(', ')
  if (list) await prisma.$executeRawUnsafe(`TRUNCATE TABLE ${list} RESTART IDENTITY CASCADE`)
}

/** Build a document line with tax computed consistently. */
const mkLine = (product, quantity, unitPrice, accountId, analyticId = null) => {
  const subtotal = money(D(unitPrice).times(quantity))
  return {
    productId: product.id,
    accountId,
    description: product.name,
    quantity: String(quantity),
    unitPrice: money2(unitPrice),
    taxRate: String(product.gstRate),
    subtotal: subtotal.toFixed(2),
    analyticAccountId: analyticId,
  }
}

/** Net-30, computed rather than spelled. Bumping the month in the string gave
 *  a thirteenth month for every December bill, which Prisma rejected outright. */
function plusDays(isoDate, days) {
  const d = new Date(`${isoDate}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + days)
  return d
}

async function main() {
  const started = Date.now()
  log('\n\x1b[1m═══ Urban Furniture — seeding ═══\x1b[0m\n')

  log('  wiping…')
  await truncateAll()

  // Master data and opening balances run in one transaction so a failure
  // leaves an empty database rather than a half-built one.
  const ctx = await prisma.$transaction(async (tx) => {
    log('  master data:')
    const m = await seedMasters(tx, { log })

    await postEntry(tx, {
      journalId: m.journals.MISC.id,
      kind: 'opening',
      date: day('2025-04-01'),
      reference: 'OPENING',
      narration: 'Opening balances as at 01 April 2025',
      userId: m.users.admin.id,
      items: [
        { accountId: m.accounts['1000'].id, label: 'Cash in hand', debit: 150000, credit: 0 },
        { accountId: m.accounts['1010'].id, label: 'HDFC current account', debit: 1850000, credit: 0 },
        { accountId: m.accounts['1011'].id, label: 'ICICI savings account', debit: 400000, credit: 0 },
        { accountId: m.accounts['3000'].id, label: "Owner's capital", debit: 0, credit: 2400000 },
      ],
    })
    log('  opening balances  ₹24,00,000')
    return m
  }, { timeout: 120000, maxWait: 20000 })

  const { accounts: A, products: P, contacts: C, users: U, journals: J, currencies: CUR, analytics: AN } = ctx
  const INV_ACC = A['1300'].id
  const INCOME_ACC = A['4000'].id
  const EXPENSE_ACC = A['5000'].id

  // ─────────────── generated activity ───────────────
  // Eighteen months of trading, generated deterministically so every run
  // produces the same books. See seedActivity.js for why it is generated
  // rather than listed.
  const { purchases, sales, vouchers } = generateActivity()

  // ─────────────── purchases ───────────────
  let n = 0
  for (const [date, vendorName, lines] of purchases) {
    n += 1
    await prisma.$transaction(async (tx) => {
      const bill = await tx.vendorBill.create({
        data: {
          number: await nextNumber(tx, { code: 'BILL', prefix: 'BILL', date: day(date) }),
          vendorId: C[vendorName].id,
          billDate: day(date),
          dueDate: plusDays(date, 30),
          currencyId: CUR.INR.id,
          lines: { create: lines.map(([p, q, r]) => mkLine(P[p], q, r, INV_ACC, AN['Workshop'].id)) },
        },
      })
      await postVendorBill(tx, { billId: bill.id, userId: U.accountant.id })
    }, { timeout: 60000 })
  }
  log(`  vendor bills      ${purchases.length}  (stock received, moving-average cost built)`)

  // ─────────────── sales ───────────────
  const invoiceIds = []
  n = 0
  for (const [date, customerName, lines] of sales) {
    n += 1
    await prisma.$transaction(async (tx) => {
      const inv = await tx.customerInvoice.create({
        data: {
          number: await nextNumber(tx, { code: 'INV', prefix: 'INV', date: day(date) }),
          customerId: C[customerName].id,
          invoiceDate: day(date),
          dueDate: day(date),
          currencyId: CUR.INR.id,
          lines: {
            create: lines.map(([p, q]) =>
              mkLine(P[p], q, P[p].salesPrice, INCOME_ACC, AN['Retail Channel'].id)),
          },
        },
      })
      const posted = await postCustomerInvoice(tx, { invoiceId: inv.id, userId: U.accountant.id })
      invoiceIds.push({ id: posted.id, number: posted.number, total: posted.total, customerId: posted.customerId, date })
    }, { timeout: 60000 })
  }
  log(`  customer invoices ${sales.length}  (revenue + COGS entries)`)

  // ─────────────── an export sale in USD ───────────────
  await prisma.$transaction(async (tx) => {
    await tx.currencyRate.create({
      data: { currencyId: CUR.USD.id, date: day('2025-08-01'), rate: '84.60' },
    })
    const inv = await tx.customerInvoice.create({
      data: {
        number: await nextNumber(tx, { code: 'INV', prefix: 'INV', date: day('2025-07-20') }),
        customerId: C['Vertex Trading FZE'].id,
        invoiceDate: day('2025-07-20'),
        dueDate: day('2025-08-19'),
        currencyId: CUR.USD.id,
        lines: { create: [mkLine(P['3-Seater Fabric Sofa'], 2, 420, INCOME_ACC, AN['Online Channel'].id)] },
      },
    })
    const posted = await postCustomerInvoice(tx, { invoiceId: inv.id, userId: U.accountant.id })

    // settled later at a better rate → realised exchange gain
    const pay = await tx.payment.create({
      data: {
        number: await nextNumber(tx, { code: 'PAY', prefix: 'PAY', date: day('2025-08-12') }), direction: 'inbound', partnerId: C['Vertex Trading FZE'].id,
        journalId: J.BNK.id, paymentDate: day('2025-08-12'), currencyId: CUR.USD.id,
        amount: posted.total.toString(),
        allocations: { create: [{ invoiceId: posted.id, amount: posted.total.toString() }] },
      },
    })
    await postPayment(tx, { paymentId: pay.id, userId: U.accountant.id })
  }, { timeout: 60000 })
  log('  export invoice    1  (USD, settled at a gain — realised FX)')

  // ─────────────── customer receipts: most paid, some open ───────────────
  let paid = 0, partial = 0
  n = 0
  for (const inv of invoiceIds) {
    const idx = invoiceIds.indexOf(inv)
    if (idx >= invoiceIds.length - 2) continue // leave the last two outstanding
    const isPartial = idx % 3 === 2
    const amount = isPartial ? money(D(inv.total).times('0.4')) : money(inv.total)
    n += 1
    await prisma.$transaction(async (tx) => {
      const pay = await tx.payment.create({
        data: {
          number: await nextNumber(tx, { code: 'PAY', prefix: 'PAY', date: day(inv.date) }),
          direction: 'inbound', partnerId: inv.customerId,
          journalId: idx % 2 === 0 ? J.BNK.id : J.CSH.id,
          paymentDate: day(inv.date), currencyId: CUR.INR.id,
          amount: amount.toFixed(2),
          allocations: { create: [{ invoiceId: inv.id, amount: amount.toFixed(2) }] },
        },
      })
      await postPayment(tx, { paymentId: pay.id, userId: U.accountant.id })
    }, { timeout: 60000 })
    isPartial ? (partial += 1) : (paid += 1)
  }
  log(`  customer receipts ${n}  (${paid} settled, ${partial} part-paid, 2 left outstanding)`)

  // ─────────────── vendor payments ───────────────
  // Settle all but the most recent few, so payables carries a realistic
  // balance instead of either nothing or everything.
  const allBills = await prisma.vendorBill.findMany({
    where: { state: 'posted' }, orderBy: { billDate: 'asc' },
  })
  const openBills = allBills.slice(0, Math.max(0, allBills.length - 4))
  n = 0
  for (const bill of openBills) {
    n += 1
    await prisma.$transaction(async (tx) => {
      const pay = await tx.payment.create({
        data: {
          number: await nextNumber(tx, { code: 'PAY', prefix: 'PAY', date: bill.dueDate ?? bill.billDate }),
          direction: 'outbound', partnerId: bill.vendorId,
          journalId: J.BNK.id, paymentDate: bill.dueDate ?? bill.billDate,
          currencyId: CUR.INR.id, amount: bill.total.toString(),
          allocations: { create: [{ billId: bill.id, amount: bill.total.toString() }] },
        },
      })
      await postPayment(tx, { paymentId: pay.id, userId: U.accountant.id })
    }, { timeout: 60000 })
  }
  log(`  vendor payments   ${n}`)

  // ─────────────── vouchers (the five entry screens) ───────────────
  for (const [type, date, cashBankId, partyAccId, amount, ref, narration, analytic] of vouchers) {
    await prisma.$transaction(async (tx) => {
      await postVoucher(tx, {
        voucherType: type, date: day(date), cashBankAccountId: A[cashBankId].id,
        lines: [{ accountId: A[partyAccId].id, amount, analyticAccountId: analytic ? AN[analytic].id : null }],
        reference: ref, narration, userId: U.accountant.id,
      })
    }, { timeout: 60000 })
  }

  await prisma.$transaction(async (tx) => {
    await postVoucher(tx, {
      voucherType: 'Journal', date: day('2025-07-31'),
      debitAccountId: A['5100'].id, creditAccountId: A['2000'].id, amount: 15000,
      reference: 'JV-01', narration: 'Rent accrual for August', userId: U.admin.id,
    })
  }, { timeout: 60000 })
  log(`  vouchers          ${vouchers.length + 1}  (bank/cash receipts, payments, journal)`)

  // ─────────────── report ───────────────
  const agg = await prisma.journalItem.aggregate({ _sum: { debit: true, credit: true } })
  const dr = money(agg._sum.debit ?? 0)
  const cr = money(agg._sum.credit ?? 0)
  const entries = await prisma.journalEntry.count()
  const balanced = dr.equals(cr)

  // Sum the valuation layers, not quantity times average cost.
  //
  // `avgCost` is a stored rounding of a running average — 13,800.3333 for a
  // product bought at three different prices — so multiplying it back by the
  // quantity reintroduces exactly the rounding the layers were keeping out.
  // At sixty entries that residue happened to land on zero; at three hundred
  // it showed up as a two-paisa mismatch against a ledger that was in fact
  // correct. The layers are what the inventory valuation report totals, and
  // they tie to the control account to the paisa.
  const layers = await prisma.stockValuationLayer.aggregate({ _sum: { value: true } })
  const stockValue = D(layers._sum.value ?? 0)

  const invBal = await prisma.journalItem.aggregate({
    where: { accountId: INV_ACC, entry: { state: 'posted' } },
    _sum: { debit: true, credit: true },
  })
  const invLedger = money(D(invBal._sum.debit ?? 0).minus(D(invBal._sum.credit ?? 0)))

  log('\n\x1b[1m  ── checks ──\x1b[0m')
  log(`  journal entries    ${entries}`)
  log(`  Σ debit            ${dr.toFixed(2)}`)
  log(`  Σ credit           ${cr.toFixed(2)}`)
  log(`  trial balance      ${balanced ? '\x1b[32mBALANCED ✓\x1b[0m' : '\x1b[31mOUT BY ' + dr.minus(cr).toFixed(2) + ' ✗\x1b[0m'}`)
  log(`  stock value        ${money(stockValue).toFixed(2)}`)
  log(`  Inventory account  ${invLedger.toFixed(2)}  ${money(stockValue).equals(invLedger) ? '\x1b[32mTIES ✓\x1b[0m' : '\x1b[31mMISMATCH ✗\x1b[0m'}`)

  log('\n\x1b[1m  ── sign in (by Login ID, not email) ──\x1b[0m')
  log('  admin01       demo123   (Admin)')
  log('  accountant1   demo123   (Accountant)')
  log('  nimesh01      demo123   (Portal User)')
  log(`\n  done in ${((Date.now() - started) / 1000).toFixed(1)}s\n`)

  await prisma.$disconnect()
  if (!balanced || !money(stockValue).equals(invLedger)) process.exit(1)
}

main().catch(async (e) => {
  console.error('\n\x1b[31mSEED FAILED\x1b[0m', e)
  await prisma.$disconnect()
  process.exit(1)
})
