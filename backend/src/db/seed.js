import 'dotenv/config'
import { prisma } from '../lib/prisma.js'
import { seedMasters } from './seedMasters.js'
import { postEntry } from '../services/ledger.js'
import { postVendorBill } from '../services/bill.js'
import { postCustomerInvoice } from '../services/invoice.js'
import { postPayment } from '../services/payment.js'
import { postVoucher } from '../services/voucher.js'
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
const FY_START_YEAR = TODAY.getUTCMonth() >= 3 ? TODAY.getUTCFullYear() : TODAY.getUTCFullYear() - 1

const day = (s) => {
  const d = new Date(`${s.replace(/^\d{4}/, String(FY_START_YEAR))}T00:00:00Z`)
  return d > TODAY ? TODAY : d
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

  // ─────────────── purchases ───────────────
  const purchases = [
    ['2025-04-08', 'Azure Furniture Pvt Ltd', [['Office Chair', 40, 2750], ['Study Desk', 32, 4300]]],
    ['2025-04-22', 'Rahul Sharma Timber',     [['Wooden Dining Table', 12, 11200], ['Coffee Table', 25, 3100]]],
    ['2025-05-09', 'Azure Furniture Pvt Ltd', [['Office Chair', 30, 2900], ['Ergonomic Mesh Chair', 15, 5500]]],
    ['2025-05-27', 'Kishan Auto Parts',       [['Bookshelf (5 Tier)', 30, 4050], ['Shoe Cabinet', 20, 2450]]],
    ['2025-06-11', 'Rahul Sharma Timber',     [['Wardrobe (3 Door)', 8, 15800], ['Queen Bed Frame', 10, 13500]]],
    ['2025-06-24', 'Azure Furniture Pvt Ltd', [['3-Seater Fabric Sofa', 6, 20500], ['Bar Stool', 40, 1650]]],
    ['2025-07-07', 'Kishan Auto Parts',       [['Bedside Table', 35, 2050], ['Coffee Table', 20, 3250]]],
  ]

  let n = 0
  for (const [date, vendorName, lines] of purchases) {
    n += 1
    await prisma.$transaction(async (tx) => {
      const bill = await tx.vendorBill.create({
        data: {
          number: `BILL/${FY_START_YEAR}/${String(n).padStart(4, '0')}`,
          vendorId: C[vendorName].id,
          billDate: day(date),
          dueDate: day(date.replace(/^(\d{4})-(\d{2})/, (_, y, mth) => `${y}-${String(Number(mth) + 1).padStart(2, '0')}`)),
          currencyId: CUR.INR.id,
          lines: { create: lines.map(([p, q, r]) => mkLine(P[p], q, r, INV_ACC, AN['Workshop'].id)) },
        },
      })
      await postVendorBill(tx, { billId: bill.id, userId: U.accountant.id })
    }, { timeout: 60000 })
  }
  log(`  vendor bills      ${purchases.length}  (stock received, moving-average cost built)`)

  // ─────────────── sales ───────────────
  // Sales volume is set so the business is genuinely profitable across the year —
  // a demo that opens on a loss invites the wrong question.
  const sales = [
    ['2025-05-02', 'Nimesh Pathak',         [['Office Chair', 4], ['Delivery Service', 1]]],
    ['2025-05-18', 'Skyline Interiors LLP', [['Study Desk', 8], ['Office Chair', 8], ['Assembly Service', 1]]],
    ['2025-05-29', 'Gateway Hotels Ltd',    [['Bedside Table', 15], ['Study Desk', 6]]],
    ['2025-06-05', 'Meera Joshi',           [['Wooden Dining Table', 2], ['Bar Stool', 8]]],
    ['2025-06-19', 'Gateway Hotels Ltd',    [['Bedside Table', 12], ['Queen Bed Frame', 6], ['Delivery Service', 1]]],
    ['2025-06-27', 'Skyline Interiors LLP', [['Office Chair', 14], ['Coffee Table', 8], ['Assembly Service', 1]]],
    ['2025-07-02', 'Skyline Interiors LLP', [['Ergonomic Mesh Chair', 10], ['Coffee Table', 6]]],
    ['2025-07-15', 'Nimesh Pathak',         [['Bookshelf (5 Tier)', 4], ['Shoe Cabinet', 3]]],
    ['2025-07-24', 'Gateway Hotels Ltd',    [['Wooden Dining Table', 4], ['Bar Stool', 16], ['Delivery Service', 1]]],
    ['2025-07-28', 'Meera Joshi',           [['3-Seater Fabric Sofa', 2], ['Assembly Service', 1]]],
    ['2025-08-06', 'Gateway Hotels Ltd',    [['Wardrobe (3 Door)', 3], ['Office Chair', 12]]],
    ['2025-08-14', 'Skyline Interiors LLP', [['Bookshelf (5 Tier)', 12], ['Study Desk', 6], ['Assembly Service', 1]]],
    ['2025-08-22', 'Meera Joshi',           [['Coffee Table', 5], ['Bedside Table', 6]]],
  ]

  const invoiceIds = []
  n = 0
  for (const [date, customerName, lines] of sales) {
    n += 1
    await prisma.$transaction(async (tx) => {
      const inv = await tx.customerInvoice.create({
        data: {
          number: `INV/${FY_START_YEAR}/${String(n).padStart(4, '0')}`,
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
        number: `INV/${FY_START_YEAR}/0099`,
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
        number: `PAY/${FY_START_YEAR}/0090`, direction: 'inbound', partnerId: C['Vertex Trading FZE'].id,
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
          number: `PAY/${FY_START_YEAR}/${String(n).padStart(4, '0')}`,
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
  const openBills = await prisma.vendorBill.findMany({
    where: { state: 'posted' }, orderBy: { billDate: 'asc' }, take: 5,
  })
  n = 0
  for (const bill of openBills) {
    n += 1
    await prisma.$transaction(async (tx) => {
      const pay = await tx.payment.create({
        data: {
          number: `PAY/${FY_START_YEAR}/${String(100 + n).padStart(4, '0')}`,
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
  const vouchers = [
    ['BPayment', '2025-05-31', A['1010'].id, A['5100'].id, 45000,  'RENT-05', 'Showroom rent — May 2025',       AN['Showroom Operations'].id],
    ['BPayment', '2025-06-30', A['1010'].id, A['5100'].id, 45000,  'RENT-06', 'Showroom rent — June 2025',      AN['Showroom Operations'].id],
    ['BPayment', '2025-07-31', A['1010'].id, A['5100'].id, 45000,  'RENT-07', 'Showroom rent — July 2025',      AN['Showroom Operations'].id],
    ['BPayment', '2025-05-31', A['1010'].id, A['5200'].id, 140000, 'SAL-05',  'Staff salaries — May 2025',      AN['Showroom Operations'].id],
    ['BPayment', '2025-06-30', A['1010'].id, A['5200'].id, 140000, 'SAL-06',  'Staff salaries — June 2025',     AN['Showroom Operations'].id],
    ['CPayment', '2025-06-14', A['1000'].id, A['5300'].id, 8600,   'FRT-11',  'Local delivery charges',         AN['Logistics'].id],
    ['CPayment', '2025-07-09', A['1000'].id, A['5300'].id, 12400,  'FRT-12',  'Outstation freight — Mumbai',    AN['Logistics'].id],
    ['CReceipt', '2025-07-18', A['1000'].id, A['4100'].id, 15000,  'MISC-01', 'Scrap timber sale',              null],
  ]

  for (const [type, date, cashBankId, partyAccId, amount, ref, narration, analytic] of vouchers) {
    await prisma.$transaction(async (tx) => {
      await postVoucher(tx, {
        voucherType: type, date: day(date), cashBankAccountId: cashBankId,
        lines: [{ accountId: partyAccId, amount, analyticAccountId: analytic }],
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

  const stock = await prisma.product.findMany({
    where: { trackInventory: true }, select: { onHandQty: true, avgCost: true },
  })
  const stockValue = stock.reduce((a, p) => a.plus(D(p.onHandQty).times(D(p.avgCost))), D(0))

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

  log('\n\x1b[1m  ── sign in ──\x1b[0m')
  log('  admin@urbanfurniture.com       demo123   (Admin)')
  log('  accountant@urbanfurniture.com  demo123   (Invoicing User)')
  log('  nimesh@example.com             demo123   (Contact / portal)')
  log(`\n  done in ${((Date.now() - started) / 1000).toFixed(1)}s\n`)

  await prisma.$disconnect()
  if (!balanced || !money(stockValue).equals(invLedger)) process.exit(1)
}

main().catch(async (e) => {
  console.error('\n\x1b[31mSEED FAILED\x1b[0m', e)
  await prisma.$disconnect()
  process.exit(1)
})
