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

/** Sync every master record that has never been synced. Returns per-table counts. */
export async function syncAllMasters() {
  const counts = { accounts: 0, contacts: 0, products: 0, journals: 0 }

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
 * Mirrors one posted JournalEntry as an Odoo account.move (move_type
 * 'entry' — a plain journal entry carrying our own already-computed
 * debit/credit lines verbatim, not asking Odoo to recompute tax or
 * valuation). Creates as a draft, then posts it, mirroring our own
 * draft-then-posted invariant. Any failure is recorded on the row and
 * never thrown — this always runs after our own postEntry() has already
 * committed, so it must never look like the ledger write itself failed.
 */
export async function syncJournalEntry(entryId) {
  const entry = await prisma.journalEntry.findUniqueOrThrow({
    where: { id: entryId },
    include: { journal: true, items: { include: { account: true, partner: true } } },
  })

  if (entry.state !== 'posted') {
    throw Object.assign(new Error('Only posted entries can be synced to Odoo'), { status: 400 })
  }

  try {
    await prisma.journalEntry.update({ where: { id: entryId }, data: { odooSyncStatus: 'pending', odooSyncError: null } })

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
