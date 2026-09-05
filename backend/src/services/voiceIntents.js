/**
 * VOICE ASSISTANT — INTENT CATALOG (the allowlist)
 *
 * This file is the reason the assistant cannot hallucinate.
 *
 * The language model's only job is to pick one `id` from this catalog and
 * suggest parameters. Whatever it returns is validated against this table
 * before anything is sent back to the browser: an unknown id, a parameter the
 * intent doesn't accept, or a date that doesn't parse is rejected outright and
 * turned into a clarifying question. The model never authors a route, a filter
 * value, or a number — it only chooses from what is written here.
 *
 * The assistant never changes data. Some routes below are blank "new document"
 * forms — opening one creates nothing; the user still fills it in and presses
 * save themselves. So a misheard command can only ever open the wrong screen.
 */

/** Parameter kinds an intent may accept. Anything else is dropped. */
const PARAM = Object.freeze({
  AS_OF: 'asOf',           // single point in time  → ?asOf=YYYY-MM-DD
  RANGE: 'range',          // period                → ?from=…&to=…
  PARTNER: 'partner',      // resolved to a real contact id → ?partnerId=…
  SETTLE_STATE: 'settleState', // not_paid | partial | paid
  DOC_STATE: 'state',      // draft | posted | confirmed | cancelled
})

/**
 * Every screen the assistant is allowed to open.
 *
 * `label` is spoken/shown back to the user as confirmation of what was
 * understood, so it must describe the screen plainly.
 */
export const INTENTS = Object.freeze({
  BALANCE_SHEET: {
    route: '/reports/balance-sheet',
    label: 'Balance Sheet',
    params: [PARAM.AS_OF],
    describes: 'assets, liabilities and equity at a point in time',
  },
  PROFIT_LOSS: {
    route: '/reports/profit-loss',
    label: 'Profit & Loss',
    params: [PARAM.RANGE],
    describes: 'income, expenses and profit over a period — also called P&L or income statement',
  },
  TRIAL_BALANCE: {
    route: '/reports/trial-balance',
    label: 'Trial Balance',
    params: [PARAM.AS_OF],
    describes: 'every account with its debit and credit totals at a point in time',
  },
  BUDGET_REPORT: {
    route: '/reports/budget',
    label: 'Budget Report',
    params: [PARAM.RANGE],
    describes: 'budgeted versus actual spend per analytic account',
  },
  INVENTORY_VALUATION: {
    route: '/reports/inventory-valuation',
    label: 'Inventory Valuation',
    params: [PARAM.AS_OF],
    describes: 'stock on hand and its value',
  },
  GENERAL_LEDGER: {
    route: '/reports/general-ledger',
    label: 'General Ledger',
    params: [PARAM.RANGE],
    describes: 'line-by-line ledger movements for an account',
  },
  TRANSACTIONS: {
    route: '/reports/transactions',
    label: 'Transactions',
    params: [PARAM.RANGE],
    describes: 'a list of all voucher transactions',
  },

  // ── document lists ──
  INVOICES: {
    route: '/invoices',
    label: 'Customer Invoices',
    params: [PARAM.PARTNER, PARAM.SETTLE_STATE, PARAM.DOC_STATE],
    describes: 'customer invoices / sales invoices, what customers owe us',
  },
  BILLS: {
    route: '/bills',
    label: 'Vendor Bills',
    params: [PARAM.PARTNER, PARAM.SETTLE_STATE, PARAM.DOC_STATE],
    describes: 'vendor bills / purchase bills, what we owe suppliers',
  },
  PURCHASE_ORDERS: {
    route: '/purchase-orders',
    label: 'Purchase Orders',
    params: [PARAM.PARTNER, PARAM.DOC_STATE],
    describes: 'purchase orders raised to vendors',
  },
  SALES_ORDERS: {
    route: '/sales-orders',
    label: 'Sales Orders',
    params: [PARAM.PARTNER, PARAM.DOC_STATE],
    describes: 'sales orders received from customers',
  },
  // Received and made are separate screens in this app, so they are separate
  // intents — the direction is the route, not a filter.
  PAYMENTS_RECEIVED: {
    route: '/payments-received',
    label: 'Payments Received',
    params: [PARAM.PARTNER],
    describes: 'money received from customers — receipts',
  },
  PAYMENTS_MADE: {
    route: '/payments-made',
    label: 'Payments Made',
    params: [PARAM.PARTNER],
    describes: 'money paid out to vendors',
  },
  JOURNAL_ENTRIES: {
    route: '/journal-entries',
    label: 'Journal Entries',
    params: [PARAM.DOC_STATE],
    describes: 'accounting journal entries in the ledger',
  },
  BUDGETS: {
    route: '/budgets',
    label: 'Budgets',
    params: [],
    describes: 'the list of analytical budgets',
  },

  // ── master data ──
  CONTACTS: { route: '/contacts', label: 'Contacts', params: [], describes: 'customers and vendors' },
  PRODUCTS: { route: '/products', label: 'Products', params: [], describes: 'the product catalogue' },
  PRODUCT_CATEGORIES: { route: '/product-categories', label: 'Product Categories', params: [], describes: 'product categories' },
  CHART_OF_ACCOUNTS: { route: '/accounts', label: 'Chart of Accounts', params: [], describes: 'the chart of accounts / ledger accounts' },
  JOURNALS: { route: '/journals', label: 'Journals', params: [], describes: 'accounting journals' },
  TAXES: { route: '/taxes', label: 'Taxes', params: [], describes: 'tax rates / GST rates' },
  CURRENCIES: { route: '/currencies', label: 'Currencies', params: [], describes: 'currencies and exchange rates' },
  ANALYTIC_ACCOUNTS: { route: '/analytic-accounts', label: 'Analytic Accounts', params: [], describes: 'analytic / analytical accounts used for budgets' },
  STOCK_MOVES: { route: '/stock-moves', label: 'Stock Moves', params: [], describes: 'stock movements in and out' },
  STOCK_ADJUSTMENTS: { route: '/stock-adjustments', label: 'Stock Adjustments', params: [], describes: 'stock adjustment documents' },
  DASHBOARD: { route: '/dashboard', label: 'Dashboard', params: [], describes: 'the home dashboard overview' },

  /**
   * Blank entry forms — for "how do I make a…" questions.
   *
   * `creates: true` only means the form is where a record gets made; opening
   * it saves nothing. It marks these so the confirmation says "here's the
   * form" rather than implying something was created.
   */
  NEW_SALES_INVOICE: { route: '/invoices/new', label: 'New Customer Invoice', params: [], creates: true, describes: 'make/create a new sales invoice or customer invoice' },
  NEW_VENDOR_BILL: { route: '/bills/new', label: 'New Vendor Bill', params: [], creates: true, describes: 'make/create a new vendor bill or purchase bill' },
  NEW_PURCHASE_ORDER: { route: '/purchase-orders/new', label: 'New Purchase Order', params: [], creates: true, describes: 'make/create a new purchase order' },
  NEW_SALES_ORDER: { route: '/sales-orders/new', label: 'New Sales Order', params: [], creates: true, describes: 'make/create a new sales order' },
  NEW_CONTACT: { route: '/contacts/new', label: 'New Contact', params: [], creates: true, describes: 'add a new customer, vendor or contact' },
  NEW_PRODUCT: { route: '/products/new', label: 'New Product', params: [], creates: true, describes: 'add a new product or item' },
  NEW_JOURNAL_ENTRY: { route: '/journal-entries/new', label: 'New Journal Entry', params: [], creates: true, describes: 'make a new manual journal entry' },
  NEW_BUDGET: { route: '/budgets/new', label: 'New Budget', params: [], creates: true, describes: 'create a new budget' },
  NEW_ANALYTIC_ACCOUNT: { route: '/analytic-accounts/new', label: 'New Analytic Account', params: [], creates: true, describes: 'create a new analytic account' },
  NEW_ACCOUNT: { route: '/accounts/new', label: 'New Account', params: [], creates: true, describes: 'add a new ledger account to the chart of accounts' },
  NEW_STOCK_ADJUSTMENT: { route: '/stock-adjustments/new', label: 'New Stock Adjustment', params: [], creates: true, describes: 'make a stock adjustment' },
  NEW_BANK_RECEIPT: { route: '/vouchers/bank-receipt', label: 'Bank Receipt Voucher', params: [], creates: true, describes: 'record money received into the bank' },
  NEW_BANK_PAYMENT: { route: '/vouchers/bank-payment', label: 'Bank Payment Voucher', params: [], creates: true, describes: 'record money paid out of the bank' },
  NEW_CASH_RECEIPT: { route: '/vouchers/cash-receipt', label: 'Cash Receipt Voucher', params: [], creates: true, describes: 'record cash received' },
  NEW_CASH_PAYMENT: { route: '/vouchers/cash-payment', label: 'Cash Payment Voucher', params: [], creates: true, describes: 'record cash paid out' },
  NEW_JOURNAL_VOUCHER: { route: '/vouchers/journal', label: 'Journal Voucher', params: [], creates: true, describes: 'make a journal voucher' },

  // ── admin-only screens ──
  USERS: { route: '/users', label: 'Users', params: [], requiresRole: 'admin', describes: 'user accounts and access' },
  NEW_USER: { route: '/users/new', label: 'New User', params: [], creates: true, requiresRole: 'admin', describes: 'create a new user account' },
  AUDIT_LOG: { route: '/audit', label: 'Audit Log', params: [], requiresRole: 'admin', describes: 'the audit trail of who changed what' },
  ODOO_SYNC: { route: '/odoo-sync', label: 'Odoo Sync', params: [], requiresRole: 'admin', describes: 'Odoo synchronisation status' },
  HEALTH: { route: '/health', label: 'System Health', params: [], requiresRole: 'admin', describes: 'system health checks' },

  /** Answered in the panel instead of navigating anywhere. */
  HELP: { route: null, label: 'Help', params: [], describes: 'what the assistant can do / what can I ask' },
})

export const INTENT_IDS = Object.freeze(Object.keys(INTENTS))

/** Values a filter param is permitted to take. Anything else is dropped. */
const ENUMS = Object.freeze({
  settleState: ['not_paid', 'partial', 'paid'],
  state: ['draft', 'posted', 'confirmed', 'cancelled'],
})

const pad = (n) => String(n).padStart(2, '0')
const iso = (d) => `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`

const utc = (y, m, d) => new Date(Date.UTC(y, m, d))

/** Indian financial year containing `d`: 1 April → 31 March. */
function fyOf(d) {
  return d.getUTCMonth() >= 3 ? d.getUTCFullYear() : d.getUTCFullYear() - 1
}

/**
 * Resolve a period phrase to a concrete { from, to } — deterministically, here
 * on the server. The model is asked for a phrase like "last month" or
 * "fy:2025-2026", never for dates it computed itself, because a model doing
 * date arithmetic is exactly where silent errors creep in.
 *
 * Returns null when the phrase isn't understood, which becomes a clarifying
 * question rather than a guess.
 */
export function resolveRange(phrase, now = new Date()) {
  if (!phrase || typeof phrase !== 'string') return null
  const p = phrase.trim().toLowerCase()

  // Explicit ISO range the caller already pinned down: "2026-04-01..2026-06-30"
  const explicit = p.match(/^(\d{4}-\d{2}-\d{2})\s*(?:\.\.|to)\s*(\d{4}-\d{2}-\d{2})$/)
  if (explicit) return { from: explicit[1], to: explicit[2] }

  // Financial year: "fy:2025-2026" or "fy:2025"
  const fy = p.match(/^fy:(\d{4})(?:-(\d{2,4}))?$/)
  if (fy) {
    const start = Number(fy[1])
    return { from: iso(utc(start, 3, 1)), to: iso(utc(start + 1, 2, 31)) }
  }

  // Calendar year: "year:2025"
  const yr = p.match(/^year:(\d{4})$/)
  if (yr) {
    const y = Number(yr[1])
    return { from: iso(utc(y, 0, 1)), to: iso(utc(y, 11, 31)) }
  }

  const y = now.getUTCFullYear()
  const m = now.getUTCMonth()

  switch (p) {
    case 'today':
      return { from: iso(now), to: iso(now) }
    case 'yesterday': {
      const d = new Date(now); d.setUTCDate(d.getUTCDate() - 1)
      return { from: iso(d), to: iso(d) }
    }
    case 'this_week': {
      const d = new Date(now); d.setUTCDate(d.getUTCDate() - d.getUTCDay())
      return { from: iso(d), to: iso(now) }
    }
    case 'last_7_days': {
      const d = new Date(now); d.setUTCDate(d.getUTCDate() - 6)
      return { from: iso(d), to: iso(now) }
    }
    case 'this_month':
      return { from: iso(utc(y, m, 1)), to: iso(now) }
    case 'last_month':
      return { from: iso(utc(y, m - 1, 1)), to: iso(utc(y, m, 0)) }
    case 'last_30_days': {
      const d = new Date(now); d.setUTCDate(d.getUTCDate() - 29)
      return { from: iso(d), to: iso(now) }
    }
    case 'this_quarter': {
      const q = Math.floor(m / 3) * 3
      return { from: iso(utc(y, q, 1)), to: iso(now) }
    }
    case 'last_quarter': {
      const q = Math.floor(m / 3) * 3
      return { from: iso(utc(y, q - 3, 1)), to: iso(utc(y, q, 0)) }
    }
    case 'this_year':
      return { from: iso(utc(y, 0, 1)), to: iso(now) }
    case 'last_year':
      return { from: iso(utc(y - 1, 0, 1)), to: iso(utc(y - 1, 11, 31)) }
    case 'this_fy': {
      const s = fyOf(now)
      return { from: iso(utc(s, 3, 1)), to: iso(now) }
    }
    case 'last_fy': {
      const s = fyOf(now) - 1
      return { from: iso(utc(s, 3, 1)), to: iso(utc(s + 1, 2, 31)) }
    }
    default:
      return null
  }
}

/**
 * Resolve a point-in-time phrase to a single YYYY-MM-DD. A period phrase is
 * accepted too and collapses to its end date, since "balance sheet for last
 * month" means "as at the end of last month".
 */
export function resolveAsOf(phrase, now = new Date()) {
  if (!phrase) return iso(now)
  const p = String(phrase).trim().toLowerCase()
  if (/^\d{4}-\d{2}-\d{2}$/.test(p)) return p
  const range = resolveRange(p, now)
  return range ? range.to : null
}

/**
 * Validate a raw model suggestion against the catalog.
 *
 * Returns { ok: true, intent, route, label, params } or
 * { ok: false, reason } — the caller turns a failure into a clarifying
 * question. Nothing unvalidated ever reaches the browser.
 */
export function validateIntent(raw, { now = new Date(), role = null } = {}) {
  const id = typeof raw?.intent === 'string' ? raw.intent.trim().toUpperCase() : ''
  const spec = INTENTS[id]
  if (!spec) return { ok: false, reason: 'unknown_intent' }

  // Never route someone to a screen their role can't load — they'd land on a
  // 403 with no idea why.
  if (spec.requiresRole && role !== spec.requiresRole) {
    return { ok: false, reason: 'forbidden_intent', label: spec.label }
  }

  const params = {}

  if (spec.params.includes(PARAM.AS_OF) && raw.period) {
    const asOf = resolveAsOf(raw.period, now)
    if (!asOf) return { ok: false, reason: 'unparseable_period' }
    params.asOf = asOf
  }

  if (spec.params.includes(PARAM.RANGE) && raw.period) {
    const range = resolveRange(raw.period, now)
    if (!range) return { ok: false, reason: 'unparseable_period' }
    params.from = range.from
    params.to = range.to
  }

  for (const key of ['settleState', 'state']) {
    if (!spec.params.includes(key)) continue
    const value = typeof raw[key] === 'string' ? raw[key].trim().toLowerCase() : ''
    if (value && ENUMS[key].includes(value)) params[key] = value
  }

  return {
    ok: true,
    intent: id,
    route: spec.route,
    label: spec.label,
    creates: Boolean(spec.creates),
    params,
  }
}

/** Intent ids this role is allowed to reach. */
export function intentIdsForRole(role) {
  return INTENT_IDS.filter((id) => !INTENTS[id].requiresRole || INTENTS[id].requiresRole === role)
}

/** Compact catalog text injected into the prompt, generated from the table
 *  above so the prompt can never drift out of sync with the allowlist.
 *  Filtered by role so the model is never even shown screens this user
 *  couldn't open. */
export function catalogForPrompt(role) {
  return intentIdsForRole(role)
    .map((id) => `- ${id}: ${INTENTS[id].label} — ${INTENTS[id].describes}`)
    .join('\n')
}
