import { D, money, sum, isZero } from '../lib/money.js'
import { invalid, conflict, notFound } from '../lib/errors.js'
import { writeAuditLog, AUDIT_ACTIONS } from '../middleware/audit.js'
import { nextNumber } from './sequence.js'

/**
 * THE LEDGER ENGINE.
 *
 * This is the ONLY place journal_entries / journal_items rows are created.
 * Every financial document (bill, invoice, payment, adjustment, manual entry)
 * funnels through postEntry(). If it doesn't balance, nothing is written.
 *
 * Invariants enforced here:
 *   - SUM(debit) == SUM(credit), exactly, in base currency
 *   - no line carries both a debit and a credit
 *   - no negative amounts (direction is expressed by which column is used)
 *   - the entry moves a non-zero amount
 *   - posted entries are immutable; corrections are reversals
 */

/** Normalise a date to UTC midnight so @db.Date round-trips predictably. */
export const toDateOnly = (value) => {
  const d = value instanceof Date ? value : new Date(value)
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()))
}

/**
 * Validate a set of proposed journal lines.
 * Exported so a preview endpoint can drive the live Dr/Cr footer in the UI
 * using exactly the same rules the post path uses.
 *
 * @returns {{ totalDebit, totalCredit, difference, balanced }}
 */
export function checkBalance(items = []) {
  const totalDebit = money(sum(items, (i) => i.debit ?? 0))
  const totalCredit = money(sum(items, (i) => i.credit ?? 0))
  const difference = money(totalDebit.minus(totalCredit))
  return {
    totalDebit,
    totalCredit,
    difference,
    balanced: difference.isZero() && totalDebit.greaterThan(0),
  }
}

/** Throws 422 unless the lines form a legal, balanced entry. */
export function assertBalanced(items = []) {
  if (!Array.isArray(items) || items.length === 0) {
    throw invalid('Add at least one line before posting', [
      { field: 'items', message: 'At least one line is required' },
    ])
  }

  items.forEach((item, idx) => {
    const debit = D(item.debit ?? 0)
    const credit = D(item.credit ?? 0)

    if (debit.isNegative() || credit.isNegative()) {
      throw invalid('Amounts cannot be negative', [
        { field: `items.${idx}`, message: 'Use the opposite column instead of a negative amount' },
      ])
    }
    if (debit.greaterThan(0) && credit.greaterThan(0)) {
      throw invalid('A line cannot have both a debit and a credit', [
        { field: `items.${idx}`, message: 'Enter either a debit or a credit, not both' },
      ])
    }
    if (!item.accountId) {
      throw invalid('Every line needs an account', [
        { field: `items.${idx}.accountId`, message: 'Account is required' },
      ])
    }
  })

  const { totalDebit, totalCredit, difference } = checkBalance(items)

  if (totalDebit.isZero() && totalCredit.isZero()) {
    throw invalid('Entry has no amounts', [
      { field: 'items', message: 'Enter at least one debit and one credit' },
    ])
  }

  if (!difference.isZero()) {
    throw invalid(
      `Entry is unbalanced: debit ${totalDebit.toFixed(2)} ≠ credit ${totalCredit.toFixed(2)} (difference ${difference.abs().toFixed(2)})`,
      [{ field: 'items', message: `Difference of ${difference.abs().toFixed(2)} must be zero` }],
    )
  }

  return { totalDebit, totalCredit }
}

/**
 * Post a balanced journal entry. MUST be called inside a prisma.$transaction —
 * a failed validation downstream has to roll the ledger write back with it.
 *
 * @param {import('@prisma/client').Prisma.TransactionClient} tx
 * @param {object} p
 * @param {string} p.journalId
 * @param {string} [p.kind]        EntryKind — revenue | bill | payment | cogs | fx | stock | opening | standard
 * @param {Date|string} p.date     accounting date
 * @param {string} [p.reference]   source document number
 * @param {Array}  p.items         [{ accountId, partnerId?, analyticAccountId?, label?, debit, credit, currencyId?, amountCurrency? }]
 */
export async function postEntry(tx, {
  journalId, kind = 'standard', date, reference = null, narration = null,
  items = [], userId = null,
}) {
  const { totalDebit } = assertBalanced(items)

  const journal = await tx.journal.findUnique({
    where: { id: journalId },
    select: { id: true, code: true, name: true, status: true },
  })
  if (!journal) throw notFound('Journal')
  if (journal.status === 'archived') {
    throw conflict(`Journal "${journal.name}" is archived and cannot accept entries`)
  }

  const entryDate = toDateOnly(date)
  const number = await nextNumber(tx, { code: journal.code, prefix: journal.code, date: entryDate })

  const entry = await tx.journalEntry.create({
    data: {
      number,
      journalId,
      kind,
      date: entryDate,
      reference,
      narration,
      state: 'posted',
      postedAt: new Date(),
      createdBy: userId,
      items: {
        create: items.map((i) => ({
          accountId: i.accountId,
          partnerId: i.partnerId ?? null,
          analyticAccountId: i.analyticAccountId ?? null,
          label: i.label ?? null,
          debit: money(i.debit ?? 0).toFixed(2),
          credit: money(i.credit ?? 0).toFixed(2),
          currencyId: i.currencyId ?? null,
          amountCurrency: i.amountCurrency != null ? money(i.amountCurrency).toFixed(2) : null,
        })),
      },
    },
    include: { items: true, journal: true },
  })

  await writeAuditLog(tx, {
    action: AUDIT_ACTIONS.journal_entry_posted,
    entity_type: 'journal_entry',
    entity_id: entry.id,
    new_value: {
      number,
      kind,
      reference,
      amount: totalDebit.toFixed(2),
      lines: items.length,
    },
    performed_by: userId,
  })

  return entry
}

/**
 * Reverse a posted entry by mirroring every line (debit ↔ credit).
 *
 * This is the ONLY legal way to undo a posting. The original is never touched,
 * so the audit trail stays intact and the trial balance still nets to zero.
 */
export async function reverseEntry(tx, { entryId, date = new Date(), userId = null, reason = null }) {
  const original = await tx.journalEntry.findUnique({
    where: { id: entryId },
    include: { items: true, journal: true },
  })

  if (!original) throw notFound('Journal entry')
  if (original.state !== 'posted') {
    throw conflict(`Only posted entries can be reversed (this one is ${original.state})`)
  }

  const existing = await tx.journalEntry.findUnique({
    where: { reversalOfId: entryId },
    select: { number: true },
  })
  if (existing) {
    throw conflict(`Entry ${original.number} was already reversed by ${existing.number}`)
  }

  const mirrored = original.items.map((i) => ({
    accountId: i.accountId,
    partnerId: i.partnerId,
    analyticAccountId: i.analyticAccountId,
    label: i.label,
    debit: i.credit,
    credit: i.debit,
    currencyId: i.currencyId,
    amountCurrency: i.amountCurrency != null ? D(i.amountCurrency).negated() : null,
  }))

  const entryDate = toDateOnly(date)
  const number = await nextNumber(tx, {
    code: original.journal.code,
    prefix: original.journal.code,
    date: entryDate,
  })

  const reversal = await tx.journalEntry.create({
    data: {
      number,
      journalId: original.journalId,
      kind: 'reversal',
      date: entryDate,
      reference: original.number,
      narration: reason ?? `Reversal of ${original.number}`,
      state: 'posted',
      postedAt: new Date(),
      createdBy: userId,
      reversalOfId: original.id,
      items: {
        create: mirrored.map((i) => ({
          ...i,
          debit: money(i.debit).toFixed(2),
          credit: money(i.credit).toFixed(2),
          amountCurrency: i.amountCurrency != null ? money(i.amountCurrency).toFixed(2) : null,
        })),
      },
    },
    include: { items: true },
  })

  await writeAuditLog(tx, {
    action: AUDIT_ACTIONS.journal_entry_reversed,
    entity_type: 'journal_entry',
    entity_id: original.id,
    old_value: { number: original.number },
    new_value: { reversalNumber: number, reason },
    performed_by: userId,
  })

  return reversal
}

/**
 * Guard used by every update/delete path on a posted document.
 * The immutability rule is the backbone of the whole design.
 */
export function assertMutable(entry, what = 'entry') {
  if (entry?.state === 'posted') {
    throw conflict(
      `Posted ${what}s are immutable — post a reversal instead of editing ${entry.number ?? ''}`.trim(),
    )
  }
  if (entry?.state === 'cancelled') {
    throw conflict(`This ${what} is cancelled and can no longer be modified`)
  }
}
