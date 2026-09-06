import { executeKw } from './odooClient.js'
import { prisma } from '../lib/prisma.js'

/**
 * Mirrors our ledger into a live Odoo instance. One-directional: our
 * Postgres tables are always the source of truth, Odoo is a best-effort
 * read-only-from-our-side mirror. Every sync call here is triggered
 * manually (a route, called from the UI) — never automatically after a
 * post — so a demo can show the exact moment data lands in Odoo, and a
 * slow/absent Odoo instance can never affect our own posting path.
 *
 * Master data (accounts/contacts/products/journals) is matched idempotently
 * by a stable natural key stored on our side (`code`, or our own row id),
 * never by name, so re-running a sync is always safe and never duplicates
 * records in Odoo.
 */

function toOdooDate(d) {
  return new Date(d).toISOString().slice(0, 10)
}

function mapAccountType(account) {
  if (account.isCashBank) return 'asset_cash'
  if (account.code === '1100') return 'asset_receivable'
  if (account.code === '2000') return 'liability_payable'
  switch (account.type) {
    case 'asset': return 'asset_current'
    case 'liability': return 'liability_current'
    // Odoo has no separate bank-vs-cash account_type — both are asset_cash;
    // the bank/cash distinction lives at the journal level in Odoo, not here.
    case 'bank': return 'asset_cash'
    case 'cash': return 'asset_cash'
    case 'capital': return 'equity'
    case 'income': return 'income'
    case 'expense': return 'expense'
    case 'other_expense': return 'expense'
    default: return 'asset_current'
  }
}

const JOURNAL_TYPE_MAP = {
  sales: 'sale',
  purchase: 'purchase',
  bank: 'bank',
  cash: 'cash',
  miscellaneous: 'general',
}

/** Find an account.account by code, or create it. Returns the Odoo id. */
export async function syncAccount(accountId) {
  const account = await prisma.chartOfAccount.findUniqueOrThrow({ where: { id: accountId } })

  const existing = await executeKw('account.account', 'search_read', [[['code', '=', account.code]]], { fields: ['id'], limit: 1 })
  let odooId
  if (existing.length) {
    odooId = existing[0].id
    await executeKw('account.account', 'write', [[odooId], { name: account.name, account_type: mapAccountType(account) }])
  } else {
    odooId = await executeKw('account.account', 'create', [{
      code: account.code,
      name: account.name,
      account_type: mapAccountType(account),
    }])
  }

  await prisma.chartOfAccount.update({ where: { id: account.id }, data: { odooId, odooSyncedAt: new Date() } })
  return odooId
}

/** Find a res.partner by our stable `ref`, or create it. Returns the Odoo id. */
export async function syncContact(contactId) {
  const contact = await prisma.contact.findUniqueOrThrow({ where: { id: contactId } })

  const existing = await executeKw('res.partner', 'search_read', [[['ref', '=', contact.id]]], { fields: ['id'], limit: 1 })
  const values = {
    name: contact.name,
    ref: contact.id,
    email: contact.email || false,
    phone: contact.mobile || false,
    city: contact.city || false,
    customer_rank: contact.type === 'customer' || contact.type === 'both' ? 1 : 0,
    supplier_rank: contact.type === 'vendor' || contact.type === 'both' ? 1 : 0,
  }

  let odooId
  if (existing.length) {
    odooId = existing[0].id
    await executeKw('res.partner', 'write', [[odooId], values])
  } else {
    odooId = await executeKw('res.partner', 'create', [values])
  }

  await prisma.contact.update({ where: { id: contact.id }, data: { odooId, odooSyncedAt: new Date() } })
  return odooId
}

/** Find a product.product by our stable `default_code`, or create it. Returns the Odoo id. */
export async function syncProduct(productId) {
  const product = await prisma.product.findUniqueOrThrow({ where: { id: productId } })

  const existing = await executeKw('product.product', 'search_read', [[['default_code', '=', product.id]]], { fields: ['id'], limit: 1 })
  const values = {
    name: product.name,
    default_code: product.id,
    list_price: Number(product.salesPrice),
    standard_price: Number(product.cost),
    type: product.trackInventory ? 'consu' : 'service',
  }

  let odooId
  if (existing.length) {
    odooId = existing[0].id
    await executeKw('product.product', 'write', [[odooId], values])
  } else {
    odooId = await executeKw('product.product', 'create', [values])
  }

  await prisma.product.update({ where: { id: product.id }, data: { odooId, odooSyncedAt: new Date() } })
  return odooId
}

/** Find an account.journal by code, or create it. Returns the Odoo id. */
export async function syncJournal(journalId) {
  const journal = await prisma.journal.findUniqueOrThrow({ where: { id: journalId } })
  const odooType = JOURNAL_TYPE_MAP[journal.type] || 'general'

  const existing = await executeKw('account.journal', 'search_read', [[['code', '=', journal.code]]], { fields: ['id'], limit: 1 })
  let odooId
  if (existing.length) {
    odooId = existing[0].id
    await executeKw('account.journal', 'write', [[odooId], { name: journal.name }])
  } else {
    odooId = await executeKw('account.journal', 'create', [{
      name: journal.name,
      code: journal.code,
      type: odooType,
    }])
  }

  await prisma.journal.update({ where: { id: journal.id }, data: { odooId, odooSyncedAt: new Date() } })
  return odooId
}

/**
 * Control accounts, by code.
 *
 * Odoo derives an invoice's receivable/payable line from the *partner*, and a
 * tax line from the *tax record* — not from anything the caller passes. So for
 * a synced invoice to reproduce our journal entry, these four accounts have to
 * be wired into the partner and the tax before the invoice is created.
 *
 * Codes rather than ids because that is already how mapAccountType identifies
 * them, and a seeded chart always has them.
 */
const CONTROL = { receivable: '1100', payable: '2000', outputTax: '2100', inputTax: '1200' }

/**
 * Make Odoo's company keep its books in our base currency.
 *
 * A fresh Odoo with no country set defaults to USD. Nothing complains: our
 * rupee figures were pushed as bare numbers and booked as dollars with the
 * right digits, so the trial balances "matched" while Odoo's entire ledger was
 * labelled in the wrong currency — and the one genuinely foreign invoice was
 * out by the exchange rate, because we sent 991.20 USD and Odoo stored 991.20
 * of its own USD.
 *
 * Also publishes our exchange rates, so a foreign-currency invoice converts to
 * the same base amount Odoo that our ledger already recorded rather than to
 * whatever rate Odoo would otherwise assume (1.0).
 */
export async function syncCompanyCurrency() {
  const base = await prisma.currency.findFirst({ where: { isBase: true } })
  if (!base) throw new Error('No base currency is configured')

  // active_test:false — Odoo ships every currency but leaves all except the
  // company's own deactivated, and a plain search silently returns nothing.
  const [baseInOdoo] = await executeKw('res.currency', 'search_read', [[['name', '=', base.code]]],
    { fields: ['id', 'active'], limit: 1, context: { active_test: false } })
  if (!baseInOdoo) throw new Error(`Odoo has no ${base.code} currency`)
  if (!baseInOdoo.active) await executeKw('res.currency', 'write', [[baseInOdoo.id], { active: true }])

  const [company] = await executeKw('res.company', 'search_read', [[]], { fields: ['id', 'currency_id'], limit: 1 })
  const changed = company.currency_id[0] !== baseInOdoo.id
  if (changed) await executeKw('res.company', 'write', [[company.id], { currency_id: baseInOdoo.id }])

  // Rates for everything else. Odoo stores "how many units of this currency
  // per one unit of company currency" — the reciprocal of how we hold it.
  const others = await prisma.currency.findMany({ where: { isBase: false, status: 'active' } })
  let rates = 0
  for (const currency of others) {
    // Every rate, not just the newest. Both systems resolve a rate as "the
    // most recent one on or before this date", so publishing only the latest
    // silently revalues history: our USD invoice of 2026-07-20 belongs at
    // 83.5, and with only the 2026-08-01 rate of 84.6 present Odoo booked it
    // 1,090.32 higher — exactly the realised FX gain, now counted twice.
    const history = await prisma.currencyRate.findMany({
      where: { currencyId: currency.id }, orderBy: { date: 'asc' },
    })
    if (!history.length) continue

    const [inOdoo] = await executeKw('res.currency', 'search_read', [[['name', '=', currency.code]]],
      { fields: ['id', 'active'], limit: 1, context: { active_test: false } })
    if (!inOdoo) continue
    if (!inOdoo.active) await executeKw('res.currency', 'write', [[inOdoo.id], { active: true }])

    for (const point of history) {
      if (!Number(point.rate)) continue
      const odooRate = 1 / Number(point.rate)
      const date = toOdooDate(point.date)
      const [existing] = await executeKw('res.currency.rate', 'search_read',
        [[['currency_id', '=', inOdoo.id], ['name', '=', date]]], { fields: ['id'], limit: 1 })
      if (existing) await executeKw('res.currency.rate', 'write', [[existing.id], { rate: odooRate }])
      else await executeKw('res.currency.rate', 'create', [{ currency_id: inOdoo.id, name: date, rate: odooRate }])
      rates += 1
    }
  }

  return { baseCurrency: base.code, changed, rates }
}

/** The Odoo id of one of our accounts, syncing it first if it has never been pushed. */
async function odooAccountByCode(code) {
  const account = await prisma.chartOfAccount.findFirst({ where: { code } })
  if (!account) throw new Error(`Chart of accounts has no ${code} — cannot map it into Odoo`)
  return account.odooId || (await syncAccount(account.id))
}

/**
 * An Odoo tax for one of our GST rates, created on demand.
 *
 * Odoo's own default taxes (15%, 0% exports) are not ours, and matching by
 * rate alone would silently attach the wrong one. Each tax is created with
 * explicit repartition lines so its tax amount lands in OUR GST account —
 * without them Odoo posts to its default, and the trial balances stop
 * agreeing even though every invoice looks right.
 *
 * Cached per process: a 62-entry sync would otherwise ask Odoo for the same
 * handful of taxes hundreds of times.
 */
const taxCache = new Map()

async function syncTax(rate, use) {
  const amount = Number(rate)
  if (!amount) return null // 0% — no tax line at all, rather than a zero one

  const key = `${use}:${amount}`
  if (taxCache.has(key)) return taxCache.get(key)

  const name = `GST ${amount}%`
  const found = await executeKw('account.tax', 'search_read',
    [[['name', '=', name], ['type_tax_use', '=', use], ['amount', '=', amount]]], { fields: ['id'], limit: 1 })

  let id
  if (found.length) {
    id = found[0].id
  } else {
    const taxAccount = await odooAccountByCode(use === 'sale' ? CONTROL.outputTax : CONTROL.inputTax)
    const repartition = [
      [0, 0, { repartition_type: 'base', factor_percent: 100 }],
      [0, 0, { repartition_type: 'tax', factor_percent: 100, account_id: taxAccount }],
    ]
    id = await executeKw('account.tax', 'create', [{
      name,
      amount,
      amount_type: 'percent',
      type_tax_use: use,
      invoice_repartition_line_ids: repartition,
      refund_repartition_line_ids: repartition,
    }])
  }

  taxCache.set(key, id)
  return id
}

/**
 * Point a partner at our receivable/payable accounts.
 *
 * Odoo assigns every new partner its own default AR/AP account. Leave that in
 * place and a synced invoice debits Odoo's "Account Receivable" while our
 * ledger debits Debtors (1100) — both internally consistent, neither
 * reconcilable against the other.
 */
async function alignPartnerAccounts(partnerOdooId) {
  await executeKw('res.partner', 'write', [[partnerOdooId], {
    property_account_receivable_id: await odooAccountByCode(CONTROL.receivable),
    property_account_payable_id: await odooAccountByCode(CONTROL.payable),
  }])
}

/** Odoo's id for a currency code, activating it if Odoo has it switched off. */
const currencyCache = new Map()
async function odooCurrencyId(code) {
  if (currencyCache.has(code)) return currencyCache.get(code)
  const [found] = await executeKw('res.currency', 'search_read', [[['name', '=', code]]],
    { fields: ['id', 'active'], limit: 1, context: { active_test: false } })
  if (!found) throw new Error(`Odoo has no ${code} currency`)
  if (!found.active) await executeKw('res.currency', 'write', [[found.id], { active: true }])
  currencyCache.set(code, found.id)
  return found.id
}

/** An account.move already carrying this reference, or null. Guards against a
 *  re-run creating a second copy of a document that is already in Odoo. */
async function findMoveByRef(ref) {
  const found = await executeKw('account.move', 'search_read', [[['ref', '=', ref]]], { fields: ['id'], limit: 1 })
  return found.length ? found[0].id : null
}

/**
 * Push a customer invoice or vendor bill as a real Odoo *document* —
 * out_invoice / in_invoice — rather than a bare journal entry.
 *
 * This is what makes it appear under Customers > Invoices with a partner, a
 * due date and a payment state, instead of only in the Journal Entries list.
 * Odoo derives the accounting itself from the lines, the partner and the
 * taxes, which is the point: the resulting move is a genuine Odoo invoice, not
 * a picture of one.
 *
 * Because Odoo recomputes the totals, they are checked against ours afterwards
 * and a mismatch fails the sync loudly. A silently-different total would mean
 * the two ledgers disagree, which is worse than not syncing at all.
 */
async function syncDocument({ doc, kind }) {
  const isSale = kind === 'out_invoice'
  const partner = isSale ? doc.customer : doc.vendor
  const entry = doc.journalEntry

  if (doc.state !== 'posted') {
    throw Object.assign(new Error('Only posted documents can be synced to Odoo'), { status: 400 })
  }

  const existing = await findMoveByRef(doc.number)
  if (existing) return { odooMoveId: existing, reused: true }

  const partnerOdooId = partner.odooId || (await syncContact(partner.id))
  await alignPartnerAccounts(partnerOdooId)

  const journalOdooId = entry.journal.odooId || (await syncJournal(entry.journalId))

  const lines = []
  for (const line of doc.lines) {
    const taxId = await syncTax(line.taxRate, isSale ? 'sale' : 'purchase')
    lines.push([0, 0, {
      product_id: line.product.odooId || (await syncProduct(line.productId)),
      name: line.description || line.product.name,
      quantity: Number(line.quantity),
      price_unit: Number(line.unitPrice),
      account_id: line.account.odooId || (await syncAccount(line.accountId)),
      tax_ids: [[6, 0, taxId ? [taxId] : []]],
    }])
  }

  const docDate = toOdooDate(isSale ? doc.invoiceDate : doc.billDate)

  // A foreign-currency document has to say so, or Odoo reads its figures as
  // base currency: our USD export invoice went in as 991.20 and was booked as
  // ₹991.20 against the ₹82,765.20 our own ledger holds.
  const currencyOdooId = doc.currency && !doc.currency.isBase
    ? await odooCurrencyId(doc.currency.code)
    : null

  const moveId = await executeKw('account.move', 'create', [{
    move_type: kind,
    partner_id: partnerOdooId,
    journal_id: journalOdooId,
    invoice_date: docDate,
    date: docDate,
    ...(doc.dueDate ? { invoice_date_due: toOdooDate(doc.dueDate) } : {}),
    ...(currencyOdooId ? { currency_id: currencyOdooId } : {}),
    ref: doc.number,
    invoice_line_ids: lines,
  }])

  await executeKw('account.move', 'action_post', [[moveId]])

  // amount_total is in the *document's* currency, so compare it against our
  // document total; the base-currency check that matters is the trial balance,
  // which `npm run demo odoo` reconciles account by account.
  const [posted] = await executeKw('account.move', 'read', [[moveId]], { fields: ['amount_total'] })
  const ours = Number(doc.total)
  if (Math.abs(posted.amount_total - ours) > 0.01) {
    throw new Error(
      `Odoo computed a different total for ${doc.number}: ${posted.amount_total} vs our ${ours}. ` +
      'Refusing to leave the two ledgers disagreeing.',
    )
  }

  return { odooMoveId: moveId }
}

/** Sync every master record that has never been synced. Returns per-table counts. */
export async function syncAllMasters() {
  const counts = { accounts: 0, contacts: 0, products: 0, journals: 0 }

  // First: everything below is denominated in this. Getting it wrong does not
  // fail, it just silently books the whole ledger in the wrong currency.
  counts.currency = await syncCompanyCurrency()

  const accounts = await prisma.chartOfAccount.findMany({ where: { status: 'active' } })
  for (const a of accounts) { await syncAccount(a.id); counts.accounts++ }

  const journals = await prisma.journal.findMany({ where: { status: 'active' } })
  for (const j of journals) { await syncJournal(j.id); counts.journals++ }

  const contacts = await prisma.contact.findMany({ where: { status: 'active' } })
  for (const c of contacts) { await syncContact(c.id); counts.contacts++ }

  const products = await prisma.product.findMany({ where: { status: 'active' } })
  for (const p of products) { await syncProduct(p.id); counts.products++ }

  return counts
}

/**
 * Push one posted JournalEntry to Odoo, as whatever kind of record it really is.
 *
 * An entry raised by an invoice or a bill is synced as an Odoo *document*
 * (out_invoice / in_invoice) and not as a journal entry, because posting that
 * document in Odoo generates the same ledger lines itself. Syncing both would
 * post the money twice — the trial balances would drift by the value of every
 * invoice, which is the single worst thing this integration could do quietly.
 *
 * Everything else — COGS, payments, vouchers, manual entries — has no document
 * counterpart in Odoo and is mirrored as a plain move_type 'entry' carrying our
 * already-computed debits and credits verbatim.
 *
 * Failures are recorded on the row and rethrown. This always runs after our own
 * postEntry() has committed, so a failure here never means the ledger write
 * failed — only that Odoo does not yet reflect it.
 */
/** Odoo's wording when an id points at something that is no longer there. */
const STALE_REFERENCE = /does not exist or has been deleted/i

/**
 * Forget every Odoo id we are holding.
 *
 * Called when Odoo tells us a reference is dead, which in practice means the
 * database was dropped and rebuilt underneath a running backend. When that
 * happens ids are not individually stale — every one of them is void at once,
 * including the taxes cached in this process and the odooId columns on every
 * master. Re-syncing then recreates each on demand.
 */
async function forgetOdooIds() {
  taxCache.clear()
  currencyCache.clear()
  await prisma.$transaction([
    prisma.contact.updateMany({ data: { odooId: null } }),
    prisma.product.updateMany({ data: { odooId: null } }),
    prisma.chartOfAccount.updateMany({ data: { odooId: null } }),
    prisma.journal.updateMany({ data: { odooId: null } }),
  ])
}

/**
 * Push one entry, recovering once if Odoo has been rebuilt under us.
 *
 * The tax ids were cached for the life of the process and the master ids are
 * stored in our own columns, so neither notices that the instance they refer
 * to has been replaced. Every invoice then failed with "record does not exist"
 * while the masters themselves re-synced happily, because those are matched by
 * reference rather than by id.
 */
export async function syncJournalEntry(entryId) {
  try {
    return await pushJournalEntry(entryId)
  } catch (err) {
    if (!STALE_REFERENCE.test(err.message ?? '')) throw err
    await forgetOdooIds()
    return pushJournalEntry(entryId)
  }
}

async function pushJournalEntry(entryId) {
  const entry = await prisma.journalEntry.findUniqueOrThrow({
    where: { id: entryId },
    include: {
      journal: true,
      items: { include: { account: true, partner: true } },
      invoice: { include: { customer: true, currency: true, lines: { include: { product: true, account: true } } } },
      bill: { include: { vendor: true, currency: true, lines: { include: { product: true, account: true } } } },
    },
  })

  if (entry.state !== 'posted') {
    throw Object.assign(new Error('Only posted entries can be synced to Odoo'), { status: 400 })
  }

  try {
    await prisma.journalEntry.update({ where: { id: entryId }, data: { odooSyncStatus: 'pending', odooSyncError: null } })

    // A document, if this entry came from one — otherwise a plain entry below.
    if (entry.invoice || entry.bill) {
      const { odooMoveId } = entry.invoice
        ? await syncDocument({ doc: { ...entry.invoice, journalEntry: entry }, kind: 'out_invoice' })
        : await syncDocument({ doc: { ...entry.bill, journalEntry: entry }, kind: 'in_invoice' })

      await prisma.journalEntry.update({
        where: { id: entryId },
        data: { odooSyncStatus: 'synced', odooMoveId, odooSyncedAt: new Date(), odooSyncError: null },
      })
      return { odooMoveId }
    }

    // Re-running must not create a second copy of an entry Odoo already holds.
    const already = await findMoveByRef(entry.number)
    if (already) {
      await prisma.journalEntry.update({
        where: { id: entryId },
        data: { odooSyncStatus: 'synced', odooMoveId: already, odooSyncedAt: new Date(), odooSyncError: null },
      })
      return { odooMoveId: already }
    }

    const journalOdooId = entry.journal.odooId || await syncJournal(entry.journalId)

    const lineValues = []
    for (const item of entry.items) {
      const accountOdooId = item.account.odooId || await syncAccount(item.accountId)
      const partnerOdooId = item.partnerId ? (item.partner?.odooId || await syncContact(item.partnerId)) : false

      lineValues.push([0, 0, {
        account_id: accountOdooId,
        partner_id: partnerOdooId,
        name: item.label || entry.narration || entry.number,
        debit: Number(item.debit),
        credit: Number(item.credit),
      }])
    }

    const moveId = await executeKw('account.move', 'create', [{
      journal_id: journalOdooId,
      date: toOdooDate(entry.date),
      ref: entry.number,
      move_type: 'entry',
      line_ids: lineValues,
    }])

    await executeKw('account.move', 'action_post', [[moveId]])

    await prisma.journalEntry.update({
      where: { id: entryId },
      data: { odooSyncStatus: 'synced', odooMoveId: moveId, odooSyncedAt: new Date(), odooSyncError: null },
    })

    return { odooMoveId: moveId }
  } catch (err) {
    const message = err.faultString || err.message || String(err)
    await prisma.journalEntry.update({
      where: { id: entryId },
      data: { odooSyncStatus: 'failed', odooSyncError: message.slice(0, 500) },
    })
    throw Object.assign(new Error(message), { status: 502, odoo: true })
  }
}

/** Pulls Odoo's own trial balance (sum of debit/credit per account) for the demo comparison. */
export async function fetchOdooTrialBalance() {
  const lines = await executeKw('account.move.line', 'search_read', [[['parent_state', '=', 'posted']]], {
    fields: ['account_id', 'debit', 'credit'],
    limit: 5000,
  })

  const byAccount = new Map()
  for (const line of lines) {
    const [, label] = line.account_id
    const key = label
    const row = byAccount.get(key) || { account: label, debit: 0, credit: 0 }
    row.debit += line.debit
    row.credit += line.credit
    byAccount.set(key, row)
  }

  return Array.from(byAccount.values()).sort((a, b) => a.account.localeCompare(b.account))
}
