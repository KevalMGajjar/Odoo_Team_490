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
 * The assistant is READ-ONLY by construction: every route below is a screen
 * that displays existing data. There is no intent that creates, edits or posts
 * anything, so a misheard command can only ever open the wrong report.
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
export function validateIntent(raw, { now = new Date() } = {}) {
  const id = typeof raw?.intent === 'string' ? raw.intent.trim().toUpperCase() : ''
  const spec = INTENTS[id]
  if (!spec) return { ok: false, reason: 'unknown_intent' }

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

  return { ok: true, intent: id, route: spec.route, label: spec.label, params }
}

/** Compact catalog text injected into the prompt, generated from the table
 *  above so the prompt can never drift out of sync with the allowlist. */
export function catalogForPrompt() {
  return INTENT_IDS
    .map((id) => `- ${id}: ${INTENTS[id].label} — ${INTENTS[id].describes}`)
    .join('\n')
}
