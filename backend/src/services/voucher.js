import { D, money, qty, sumMoney } from '../lib/money.js'
import { invalid, notFound, conflict, invalidField } from '../lib/errors.js'
import { postEntry, toDateOnly } from './ledger.js'

/**
 * VOUCHER ENTRY
 *
 * Five voucher screens, all posting through the same double-entry engine:
 *
 *   BReceipt  Bank Receipt   — Credit party, Debit bank
 *   BPayment  Bank Payment   — Debit party,  Credit bank
 *   CReceipt  Cash Receipt   — Credit party, Debit cash
 *   CPayment  Cash Payment   — Debit party,  Credit cash
 *   Journal   Journal Voucher— Debit account A, Credit account B (no filter)
 *
 * The flat `transactions` view projects the resulting ledger rows in the
 * requested shape, with the sign convention:
 *
 *     amount = credit - debit      positive = CREDIT, negative = DEBIT
 *
 * so a bank receipt reads:
 *     2026-04-01, 1, BReceipt, <Abc Party>,     5000.00, T112312, neft received…
 *     2026-04-01, 1, BReceipt, <Bank Account>, -5000.00, T112312, neft received…
 */

export const VOUCHER_META = Object.freeze({
  BReceipt: { label: 'Bank Receipt',    journalType: 'bank',          direction: 'receipt', group: 'Bank' },
  BPayment: { label: 'Bank Payment',    journalType: 'bank',          direction: 'payment', group: 'Bank' },
  CReceipt: { label: 'Cash Receipt',    journalType: 'cash',          direction: 'receipt', group: 'Cash' },
  CPayment: { label: 'Cash Payment',    journalType: 'cash',          direction: 'payment', group: 'Cash' },
  Journal:  { label: 'Journal Voucher', journalType: 'miscellaneous', direction: 'journal', group: 'Journal' },
})

export const VOUCHER_TYPES = Object.keys(VOUCHER_META)

/**
 * Indian financial year: April–March.
 * 01-Apr-2026 → 2026 (FY 2026-27);  31-Mar-2026 → 2025 (FY 2025-26).
 */
export function fiscalYearOf(date) {
  const d = toDateOnly(date)
  return d.getUTCMonth() >= 3 ? d.getUTCFullYear() : d.getUTCFullYear() - 1
}

export const fiscalYearLabel = (fy) => `${fy}-${String((fy + 1) % 100).padStart(2, '0')}`

/**
 * Next voucher number for this type and financial year — "last voucher_no + 1".
 * Allocated atomically inside the caller's transaction so two concurrent posts
 * cannot collide.
 */
export async function nextVoucherNo(tx, voucherType, date) {
  const year = fiscalYearOf(date)
  const seq = await tx.sequence.upsert({
    where: { code_year: { code: `VCH_${voucherType}`, year } },
    create: { code: `VCH_${voucherType}`, prefix: voucherType, year, next: 2 },
    update: { next: { increment: 1 } },
    select: { next: true },
  })
  return { voucherNo: seq.next - 1, fiscalYear: year }
}

/** Read the next voucher number without consuming it (for the entry screen header). */
export async function peekVoucherNo(tx, voucherType, date = new Date()) {
  const year = fiscalYearOf(date)
  const seq = await tx.sequence.findUnique({
    where: { code_year: { code: `VCH_${voucherType}`, year } },
    select: { next: true },
  })
  return { voucherNo: seq ? seq.next : 1, fiscalYear: year }
}

/** Accounts selectable on the bank/cash side of a receipt or payment voucher. */
export async function cashBankAccounts(tx) {
  return tx.chartOfAccount.findMany({
    where: { isCashBank: true, status: 'active' },
    orderBy: { code: 'asc' },
    select: { id: true, code: true, name: true, type: true },
  })
}

// ── "remember the last account selected" ────────────────────────────────
const prefKey = (voucherType) => `voucher.lastAccount.${voucherType}`

export async function getLastCashBankAccount(tx, userId, voucherType) {
  if (!userId) return null
  const pref = await tx.userPreference.findUnique({
    where: { userId_key: { userId, key: prefKey(voucherType) } },
    select: { value: true },
  })
  if (!pref) return null
  // the remembered account may since have been archived
  const acc = await tx.chartOfAccount.findFirst({
    where: { id: pref.value, isCashBank: true, status: 'active' },
    select: { id: true, code: true, name: true },
  })
  return acc
}

export async function rememberCashBankAccount(tx, userId, voucherType, accountId) {
  if (!userId || !accountId) return
  await tx.userPreference.upsert({
    where: { userId_key: { userId, key: prefKey(voucherType) } },
    create: { userId, key: prefKey(voucherType), value: accountId },
    update: { value: accountId },
  })
}

// ── posting ─────────────────────────────────────────────────────────────

async function resolveJournal(tx, voucherType, journalId) {
  const meta = VOUCHER_META[voucherType]
  if (journalId) {
    const j = await tx.journal.findUnique({ where: { id: journalId } })
    if (!j) throw notFound('Journal')
    return j
  }
  const journal = await tx.journal.findFirst({
    where: { type: meta.journalType, status: 'active' },
    orderBy: { code: 'asc' },
  })
  if (!journal) {
    throw conflict(`No active ${meta.journalType} journal is configured — create one under Masters → Journals`)
  }
  return journal
}

/**
 * Post a receipt or payment voucher.
 *
 * The bank/cash side is derived, never typed twice: its amount is the sum of
 * the party lines, so the voucher cannot be saved out of balance by construction.
 *
 * @param {object} p
 * @param {'BReceipt'|'BPayment'|'CReceipt'|'CPayment'} p.voucherType
 * @param {string} p.cashBankAccountId  bank/cash ledger (must be isCashBank)
 * @param {Array}  p.lines              [{ accountId, amount, partnerId?, label? }] — the party side
 */
export async function postReceiptPaymentVoucher(tx, {
  voucherType, date, cashBankAccountId, lines = [],
  reference = null, narration = null, journalId = null, userId = null,
}) {
  const meta = VOUCHER_META[voucherType]
  if (!meta || meta.direction === 'journal') {
    throw invalidField('voucherType', `Unknown receipt/payment voucher type "${voucherType}"`)
  }

  if (!Array.isArray(lines) || lines.length === 0) {
    throw invalid('Add at least one account line', [
      { field: 'lines', message: 'At least one line is required' },
    ])
  }

  // ── bank/cash side must be a real cash/bank ledger ──
  const cashBank = await tx.chartOfAccount.findUnique({ where: { id: cashBankAccountId } })
  if (!cashBank) throw invalidField('cashBankAccountId', 'Select a bank or cash account')
  if (!cashBank.isCashBank) {
    throw invalidField('cashBankAccountId', `"${cashBank.name}" is not a bank or cash account`)
  }
  if (cashBank.status === 'archived') {
    throw invalidField('cashBankAccountId', `"${cashBank.name}" is archived`)
  }

  // ── validate the party lines ──
  const partyIds = new Set()
  for (const [idx, line] of lines.entries()) {
    const amt = money(line.amount ?? 0)
    if (!amt.greaterThan(0)) {
      throw invalid('Amount must be greater than zero', [
        { field: `lines.${idx}.amount`, message: 'Enter an amount greater than zero' },
      ])
    }
    if (!line.accountId) {
      throw invalid('Every line needs an account', [
        { field: `lines.${idx}.accountId`, message: 'Account is required' },
      ])
    }
    if (line.accountId === cashBankAccountId) {
      throw invalid('The party account cannot be the same as the bank/cash account', [
        { field: `lines.${idx}.accountId`, message: 'Choose a different account' },
      ])
    }
    partyIds.add(line.accountId)
  }

  const found = await tx.chartOfAccount.findMany({
    where: { id: { in: [...partyIds] } },
    select: { id: true, name: true, status: true },
  })
  if (found.length !== partyIds.size) throw invalidField('lines', 'One or more accounts do not exist')
  const archived = found.find((a) => a.status === 'archived')
  if (archived) throw invalidField('lines', `"${archived.name}" is archived`)

  const total = sumMoney(lines, (l) => l.amount)

  // ── build the double entry ──
  // receipt: party CREDIT, bank DEBIT      payment: party DEBIT, bank CREDIT
  const isReceipt = meta.direction === 'receipt'

  const items = lines.map((l) => ({
    accountId: l.accountId,
    partnerId: l.partnerId ?? null,
    analyticAccountId: l.analyticAccountId ?? null,
    label: l.label ?? narration ?? null,
    debit: isReceipt ? 0 : money(l.amount),
    credit: isReceipt ? money(l.amount) : 0,
  }))

  items.push({
    accountId: cashBankAccountId,
    partnerId: null,
    analyticAccountId: null,
    label: narration ?? null,
    debit: isReceipt ? total : 0,
    credit: isReceipt ? 0 : total,
  })

  const journal = await resolveJournal(tx, voucherType, journalId)
  const { voucherNo, fiscalYear } = await nextVoucherNo(tx, voucherType, date)

  const entry = await postEntry(tx, {
    journalId: journal.id,
    kind: 'payment',
    date,
    reference,
    narration,
    items,
    userId,
  })

  const updated = await tx.journalEntry.update({
    where: { id: entry.id },
    data: { voucherType, voucherNo, fiscalYear },
    include: { items: true, journal: true },
  })

  await rememberCashBankAccount(tx, userId, voucherType, cashBankAccountId)

  return { ...updated, voucherLabel: `${meta.label} #${voucherNo}`, total }
}

/**
 * Post a journal voucher: debit the first account, credit the second.
 * No account filtering — any ledger may be used on either side.
 */
export async function postJournalVoucher(tx, {
  date, debitAccountId, creditAccountId, amount,
  debitPartnerId = null, creditPartnerId = null,
  reference = null, narration = null, journalId = null, userId = null,
}) {
  const amt = money(amount ?? 0)

  if (!amt.greaterThan(0)) {
    throw invalidField('amount', 'Amount must be greater than zero')
  }
  if (!debitAccountId) throw invalidField('debitAccountId', 'Debit account is required')
  if (!creditAccountId) throw invalidField('creditAccountId', 'Credit account is required')
  if (debitAccountId === creditAccountId) {
    throw invalidField('creditAccountId', 'Debit and credit accounts must be different')
  }

  const accounts = await tx.chartOfAccount.findMany({
    where: { id: { in: [debitAccountId, creditAccountId] } },
    select: { id: true, name: true, status: true },
  })
  if (accounts.length !== 2) throw invalidField('debitAccountId', 'One or both accounts do not exist')
  const archived = accounts.find((a) => a.status === 'archived')
  if (archived) throw invalidField('debitAccountId', `"${archived.name}" is archived`)

  const journal = await resolveJournal(tx, 'Journal', journalId)
  const { voucherNo, fiscalYear } = await nextVoucherNo(tx, 'Journal', date)

  const entry = await postEntry(tx, {
    journalId: journal.id,
    kind: 'standard',
    date,
    reference,
    narration,
    userId,
    items: [
      { accountId: debitAccountId,  partnerId: debitPartnerId,  label: narration, debit: amt, credit: 0 },
      { accountId: creditAccountId, partnerId: creditPartnerId, label: narration, debit: 0,   credit: amt },
    ],
  })

  const updated = await tx.journalEntry.update({
    where: { id: entry.id },
    data: { voucherType: 'Journal', voucherNo, fiscalYear },
    include: { items: true, journal: true },
  })

  return { ...updated, voucherLabel: `Journal Voucher #${voucherNo}`, total: amt }
}

/** Unified entry point used by the voucher routes. */
export async function postVoucher(tx, params) {
  return params.voucherType === 'Journal'
    ? postJournalVoucher(tx, params)
    : postReceiptPaymentVoucher(tx, params)
}

/**
 * Read the flat `transactions` projection — exactly the requested shape:
 *   date, voucher_no, voucher_type, accountid, amount, reference, narration
 */
export async function listTransactions(tx, {
  voucherType = null, fiscalYear = null, from = null, to = null, accountId = null, limit = 200,
} = {}) {
  const where = []
  const args = []
  const add = (clause, value) => { args.push(value); where.push(clause.replace('?', `$${args.length}`)) }

  if (voucherType) add('voucher_type = ?::"VoucherType"', voucherType)
  if (fiscalYear) add('fiscal_year = ?', Number(fiscalYear))
  if (from) add('date >= ?', toDateOnly(from))
  if (to) add('date <= ?', toDateOnly(to))
  if (accountId) add('accountid = ?', accountId)

  const sql = `
    SELECT date, voucher_no, voucher_type, accountid, amount, reference, narration,
           account_code, account_name, account_type, entry_id, entry_number, line_id
    FROM transactions
    ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
    ORDER BY date DESC, voucher_type, voucher_no DESC, amount DESC
    LIMIT ${Number(limit)}
  `
  return tx.$queryRawUnsafe(sql, ...args)
}
