import bcrypt from 'bcryptjs'

/**
 * Master data for Urban Furniture.
 *
 * Realistic, furniture-flavoured, and deliberately NOT "Test 1 / asdf" — seed
 * quality is the difference between a demo that looks real and one that doesn't.
 *
 * Exported as a function so both the full seed and the test harnesses can reuse it.
 */

export const BASE_CURRENCY = 'INR'

// ── chart of accounts ───────────────────────────────────────────────────
// `cb` marks real cash/bank ledgers — the receipt/payment voucher screens
// filter the bank side of the entry to these.
export const ACCOUNTS = [
  { code: '1000', name: 'Cash',                     type: 'asset',     cb: true },
  { code: '1010', name: 'Bank — HDFC Current',      type: 'asset',     cb: true },
  { code: '1011', name: 'Bank — ICICI Savings',     type: 'asset',     cb: true },
  { code: '1100', name: 'Debtors (Accounts Receivable)', type: 'asset' },
  { code: '1200', name: 'Input GST (Receivable)',   type: 'asset' },
  { code: '1300', name: 'Inventory',                type: 'asset' },
  { code: '2000', name: 'Creditors (Accounts Payable)',  type: 'liability' },
  { code: '2100', name: 'Output GST (Payable)',     type: 'liability' },
  { code: '3000', name: "Owner's Capital",          type: 'capital' },
  { code: '3100', name: 'Retained Earnings',        type: 'capital' },
  { code: '4000', name: 'Sales Income',             type: 'income' },
  { code: '4100', name: 'Other Income',             type: 'income' },
  { code: '4200', name: 'Foreign Exchange Gain',    type: 'income' },
  { code: '5000', name: 'Purchase Expense',         type: 'expense' },
  { code: '5050', name: 'Cost of Goods Sold',       type: 'expense' },
  { code: '5100', name: 'Rent Expense',             type: 'expense' },
  { code: '5200', name: 'Salary Expense',           type: 'expense' },
  { code: '5300', name: 'Freight & Delivery',       type: 'expense' },
  { code: '5400', name: 'Foreign Exchange Loss',    type: 'expense' },
  { code: '5500', name: 'Inventory Adjustment',     type: 'expense' },
]

export const JOURNALS = [
  { code: 'INV',  name: 'Sales Journal',      type: 'sales',         debit: '1100', credit: '4000' },
  { code: 'BILL', name: 'Purchase Journal',   type: 'purchase',      debit: '5000', credit: '2000' },
  { code: 'BNK',  name: 'Bank Journal',       type: 'bank',          debit: '1010', credit: '1010' },
  { code: 'CSH',  name: 'Cash Journal',       type: 'cash',          debit: '1000', credit: '1000' },
  { code: 'MISC', name: 'Miscellaneous Journal', type: 'miscellaneous' },
]

export const TAXES = [
  { name: 'GST 0%',  rate: 0 },
  { name: 'GST 5%',  rate: 5 },
  { name: 'GST 12%', rate: 12 },
  { name: 'GST 18%', rate: 18 },
  { name: 'GST 28%', rate: 28 },
]

export const CURRENCIES = [
  { code: 'INR', name: 'Indian Rupee',  symbol: '₹', isBase: true,  rate: 1 },
  { code: 'USD', name: 'US Dollar',     symbol: '$', isBase: false, rate: 83.5 },
  { code: 'EUR', name: 'Euro',          symbol: '€', isBase: false, rate: 90.25 },
  { code: 'AED', name: 'UAE Dirham',    symbol: 'د.إ', isBase: false, rate: 22.7 },
]

export const CATEGORIES = ['Seating', 'Tables', 'Storage', 'Bedroom', 'Services']

// gst = GST %, track = perpetual inventory, sale/cost in INR
export const PRODUCTS = [
  { name: 'Office Chair',           cat: 'Seating',  sale: 4500,  cost: 2800,  gst: 18, track: true },
  { name: 'Ergonomic Mesh Chair',   cat: 'Seating',  sale: 8900,  cost: 5600,  gst: 18, track: true },
  { name: 'Bar Stool',              cat: 'Seating',  sale: 2900,  cost: 1700,  gst: 18, track: true },
  { name: '3-Seater Fabric Sofa',   cat: 'Seating',  sale: 32000, cost: 21000, gst: 18, track: true },
  { name: 'Wooden Dining Table',    cat: 'Tables',   sale: 18000, cost: 11500, gst: 18, track: true },
  { name: 'Study Desk',             cat: 'Tables',   sale: 7200,  cost: 4400,  gst: 18, track: true },
  { name: 'Coffee Table',           cat: 'Tables',   sale: 5400,  cost: 3200,  gst: 18, track: true },
  { name: 'Bookshelf (5 Tier)',     cat: 'Storage',  sale: 6800,  cost: 4100,  gst: 12, track: true },
  { name: 'Shoe Cabinet',           cat: 'Storage',  sale: 4200,  cost: 2500,  gst: 12, track: true },
  { name: 'Wardrobe (3 Door)',      cat: 'Bedroom',  sale: 24500, cost: 16000, gst: 18, track: true },
  { name: 'Queen Bed Frame',        cat: 'Bedroom',  sale: 21000, cost: 13800, gst: 18, track: true },
  { name: 'Bedside Table',          cat: 'Bedroom',  sale: 3600,  cost: 2100,  gst: 12, track: true },
  // services are never stock-tracked and expense immediately
  { name: 'Assembly Service',       cat: 'Services', sale: 800,   cost: 350,   gst: 18, track: false, type: 'service' },
  { name: 'Delivery Service',       cat: 'Services', sale: 1200,  cost: 600,   gst: 5,  track: false, type: 'service' },
  { name: 'Extended Warranty (2Y)', cat: 'Services', sale: 2500,  cost: 0,     gst: 18, track: false, type: 'service' },
]

export const CONTACTS = [
  { name: 'Azure Furniture Pvt Ltd', type: 'vendor',   email: 'accounts@azurefurniture.in', mobile: '9824011223', city: 'Ahmedabad', state: 'Gujarat',     pincode: '380015' },
  { name: 'Rahul Sharma Timber',     type: 'vendor',   email: 'rahul@sharmatimber.in',      mobile: '9824055667', city: 'Surat',     state: 'Gujarat',     pincode: '395003' },
  { name: 'Kishan Auto Parts',       type: 'vendor',   email: 'kishan@kishanauto.in',       mobile: '9825199887', city: 'Rajkot',    state: 'Gujarat',     pincode: '360001' },
  { name: 'Nimesh Pathak',           type: 'customer', email: 'nimesh.pathak@gmail.com',    mobile: '9898012345', city: 'Ahmedabad', state: 'Gujarat',     pincode: '380006' },
  { name: 'Meera Joshi',             type: 'customer', email: 'meera.joshi@outlook.com',    mobile: '9737045612', city: 'Vadodara',  state: 'Gujarat',     pincode: '390007' },
  { name: 'Skyline Interiors LLP',   type: 'customer', email: 'po@skylineinteriors.co.in',  mobile: '9909087766', city: 'Mumbai',    state: 'Maharashtra', pincode: '400053' },
  { name: 'Gateway Hotels Ltd',      type: 'customer', email: 'purchase@gatewayhotels.com', mobile: '9820033445', city: 'Pune',      state: 'Maharashtra', pincode: '411001' },
  { name: 'Vertex Trading FZE',      type: 'both',     email: 'finance@vertextrading.ae',   mobile: '9714455667', city: 'Dubai',     state: 'Dubai',       pincode: '00000' },
]

export const ANALYTIC_ACCOUNTS = [
  { name: 'Showroom Operations', type: 'expense' },
  { name: 'Workshop',            type: 'expense' },
  { name: 'Logistics',           type: 'expense' },
  { name: 'Retail Channel',      type: 'income' },
  { name: 'Online Channel',      type: 'income' },
]

/**
 * Seed all master data. Assumes tables are empty (the caller truncates first).
 * @returns a lookup bag the transaction seeder builds on.
 */
export async function seedMasters(tx, { log = () => {} } = {}) {
  // ── currencies ──
  const currencies = {}
  for (const c of CURRENCIES) {
    currencies[c.code] = await tx.currency.create({
      data: { code: c.code, name: c.name, symbol: c.symbol, isBase: c.isBase },
    })
    // one rate row per currency, effective from the start of the fiscal year
    await tx.currencyRate.create({
      data: {
        currencyId: currencies[c.code].id,
        date: new Date('2025-04-01T00:00:00Z'),
        rate: String(c.rate),
      },
    })
  }
  log(`  currencies        ${CURRENCIES.length}`)

  // ── chart of accounts ──
  const accounts = {}
  for (const a of ACCOUNTS) {
    accounts[a.code] = await tx.chartOfAccount.create({
      data: { code: a.code, name: a.name, type: a.type, isCashBank: Boolean(a.cb) },
    })
  }
  log(`  accounts          ${ACCOUNTS.length}`)

  // ── journals ──
  const journals = {}
  for (const j of JOURNALS) {
    journals[j.code] = await tx.journal.create({
      data: {
        code: j.code, name: j.name, type: j.type,
        defaultDebitId: j.debit ? accounts[j.debit].id : null,
        defaultCreditId: j.credit ? accounts[j.credit].id : null,
      },
    })
  }
  log(`  journals          ${JOURNALS.length}`)

  // ── taxes ──
  const taxes = {}
  for (const t of TAXES) {
    taxes[t.rate] = await tx.tax.create({ data: { name: t.name, rate: String(t.rate) } })
  }
  log(`  taxes             ${TAXES.length}`)

  // ── categories + products ──
  const categories = {}
  for (const name of CATEGORIES) {
    categories[name] = await tx.productCategory.create({ data: { name } })
  }

  const products = {}
  for (const p of PRODUCTS) {
    products[p.name] = await tx.product.create({
      data: {
        name: p.name,
        type: p.type ?? 'goods',
        categoryId: categories[p.cat].id,
        salesPrice: String(p.sale),
        cost: String(p.cost),
        gstRate: String(p.gst),
        taxId: taxes[p.gst]?.id ?? null,
        trackInventory: p.track,
        incomeAccountId: accounts['4000'].id,
        expenseAccountId: accounts['5000'].id,
        inventoryAccountId: p.track ? accounts['1300'].id : null,
        cogsAccountId: p.track ? accounts['5050'].id : null,
      },
    })
  }
  log(`  categories        ${CATEGORIES.length}`)
  log(`  products          ${PRODUCTS.length}  (${PRODUCTS.filter((p) => p.track).length} stock-tracked)`)

  // ── contacts ──
  const contacts = {}
  for (const c of CONTACTS) {
    contacts[c.name] = await tx.contact.create({ data: c })
  }
  log(`  contacts          ${CONTACTS.length}`)

  // ── analytic accounts ──
  const analytics = {}
  for (const a of ANALYTIC_ACCOUNTS) {
    analytics[a.name] = await tx.analyticAccount.create({ data: a })
  }
  log(`  analytic accounts ${ANALYTIC_ACCOUNTS.length}`)

  // ── users (all demo123, surfaced as quick-login buttons) ──
  const hash = await bcrypt.hash('demo123', 10)
  const users = {}
  users.admin = await tx.user.create({
    data: { name: 'Keval Gajjar', email: 'admin@urbanfurniture.com', password: hash, role: 'admin' },
  })
  users.accountant = await tx.user.create({
    data: { name: 'Priya Desai', email: 'accountant@urbanfurniture.com', password: hash, role: 'invoicing_user' },
  })
  // read-only account for the companion view-only app
  users.viewer = await tx.user.create({
    data: { name: 'Companion App', email: 'viewer@urbanfurniture.com', password: hash, role: 'viewer' },
  })
  users.portal = await tx.user.create({
    data: {
      name: 'Nimesh Pathak', email: 'nimesh@example.com', password: hash,
      role: 'contact', contactId: contacts['Nimesh Pathak'].id,
    },
  })
  log(`  users             4  (admin / invoicing_user / viewer / contact)`)

  // ── budgets ──
  const budgets = []
  for (const [name, analyticName, planned, start, end] of [
    ['Q1 FY26 — Showroom Operations', 'Showroom Operations', 250000, '2025-04-01', '2025-06-30'],
    ['Q1 FY26 — Workshop',            'Workshop',            180000, '2025-04-01', '2025-06-30'],
    ['FY26 — Logistics',              'Logistics',           420000, '2025-04-01', '2026-03-31'],
  ]) {
    budgets.push(await tx.budget.create({
      data: {
        name,
        analyticAccountId: analytics[analyticName].id,
        plannedAmount: String(planned),
        startDate: new Date(`${start}T00:00:00Z`),
        endDate: new Date(`${end}T00:00:00Z`),
        responsibleId: users.admin.id,
      },
    }))
  }
  log(`  budgets           ${budgets.length}`)

  return { currencies, accounts, journals, taxes, categories, products, contacts, analytics, users, budgets }
}
