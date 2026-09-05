import { D, money, gt } from '../lib/money.js'
import { toDateOnly } from './ledger.js'
import { writeAuditLog, AUDIT_ACTIONS } from '../middleware/audit.js'
import { conflict, notFound, invalidField } from '../lib/errors.js'

export const BUDGET_INCLUDE = {
  lines: { include: { analyticAccount: true } },
  responsible: { select: { id: true, name: true } },
  revises: { select: { id: true, name: true, state: true } },
  revisedBy: { select: { id: true, name: true, state: true } },
}

/**
 * Posted-ledger actual for one analytic account within a date window —
 * expense accumulates on the debit side, income on the credit side. Shared
 * by the Budget module and the standalone Budget Report so the two screens
 * can never disagree about what "achieved" means.
 */
export async function achievedAmount(tx, { analyticAccountId, type, startDate, endDate }) {
  const agg = await tx.journalItem.aggregate({
    where: {
      analyticAccountId,
      entry: { state: 'posted', date: { gte: startDate, lte: endDate } },
    },
    _sum: { debit: true, credit: true },
  })
  const debit = money(agg._sum.debit ?? 0)
  const credit = money(agg._sum.credit ?? 0)
  return type === 'expense' ? money(debit.minus(credit)) : money(credit.minus(debit))
}

/** Decorate a loaded budget's lines (and header) with Achieved/Achieved%/Amount-to-Achieve. */
export async function withAchieved(tx, budget) {
  const lines = await Promise.all(budget.lines.map(async (line) => {
    const achieved = await achievedAmount(tx, {
      analyticAccountId: line.analyticAccountId,
      type: line.analyticAccount.type,
      startDate: budget.startDate,
      endDate: budget.endDate,
    })
    const committed = money(line.committedAmount)
    const achievedPct = committed.isZero() ? money(0) : money(achieved.dividedBy(committed).times(100))
    const toAchieve = money(committed.minus(achieved))
    return { ...line, achieved, achievedPct, toAchieve }
  }))
  const committedTotal = money(lines.reduce((a, l) => a.plus(D(l.committedAmount)), D(0)))
  const achievedTotal = money(lines.reduce((a, l) => a.plus(l.achieved), D(0)))
  return { ...budget, lines, committedTotal, achievedTotal }
}

/**
 * Non-blocking check run when a PO/SO/Bill/Invoice is confirmed or posted:
 * does this line's amount, added to what's already posted against the same
 * analytic account, push it past the committed amount on the Confirmed
 * budget covering the document's date? Never throws — advisory only, the
 * document workflow itself is never blocked by budget overrun.
 */
export async function checkOverBudget(tx, { analyticAccountId, amount, date }) {
  if (!analyticAccountId || !amount) return null
  const d = toDateOnly(date)
  const line = await tx.budgetLine.findFirst({
    where: {
      analyticAccountId,
      budget: { state: 'confirmed', startDate: { lte: d }, endDate: { gte: d } },
    },
    include: { analyticAccount: true, budget: { select: { id: true, name: true, startDate: true, endDate: true } } },
  })
  if (!line) return null

  const achieved = await achievedAmount(tx, {
    analyticAccountId, type: line.analyticAccount.type,
    startDate: line.budget.startDate, endDate: line.budget.endDate,
  })
  const committed = money(line.committedAmount)
  const projected = money(achieved.plus(D(amount)))
  if (!gt(projected, committed)) return null

  return {
    budgetId: line.budget.id,
    budgetName: line.budget.name,
    analyticAccountId,
    analyticAccountName: line.analyticAccount.name,
    committed: committed.toFixed(2),
    achieved: achieved.toFixed(2),
    projected: projected.toFixed(2),
  }
}

/** Run checkOverBudget across every line of a just-confirmed/posted document; drops nulls. */
export async function warningsForLines(tx, { lines, date }) {
  const warnings = []
  for (const line of lines) {
    const w = await checkOverBudget(tx, { analyticAccountId: line.analyticAccountId, amount: line.subtotal, date })
    if (w) warnings.push(w)
  }
  return warnings
}

export async function confirmBudget(tx, { budgetId, userId }) {
  const budget = await tx.budget.findUnique({ where: { id: budgetId }, include: { lines: true } })
  if (!budget) throw notFound('Budget')
  if (budget.state !== 'draft') throw conflict(`Budget ${budget.name} is already ${budget.state}`)
  if (budget.lines.length === 0) throw invalidField('lines', 'Add at least one line before confirming')

  const updated = await tx.budget.update({
    where: { id: budgetId }, data: { state: 'confirmed' }, include: BUDGET_INCLUDE,
  })
  await writeAuditLog(tx, {
    action: AUDIT_ACTIONS.budget_confirmed, entity_type: 'budget', entity_id: budgetId, performed_by: userId,
  })
  return updated
}

export async function cancelBudget(tx, { budgetId, userId }) {
  const budget = await tx.budget.findUnique({ where: { id: budgetId } })
  if (!budget) throw notFound('Budget')
  if (!['draft', 'confirmed'].includes(budget.state)) {
    throw conflict(`Budget ${budget.name} cannot be cancelled from ${budget.state}`)
  }
  const updated = await tx.budget.update({
    where: { id: budgetId }, data: { state: 'cancelled' }, include: BUDGET_INCLUDE,
  })
  await writeAuditLog(tx, {
    action: AUDIT_ACTIONS.budget_cancelled, entity_type: 'budget', entity_id: budgetId, performed_by: userId,
  })
  return updated
}

/**
 * Revise: the confirmed budget is frozen (state -> revised) and a new Draft
 * budget is born with the same lines, named "<original> Revised", linked
 * back via revisesId. The link is bidirectional through one Prisma relation
 * (`revises` / `revisedBy`) — no second column needed to walk it either way.
 */
export async function reviseBudget(tx, { budgetId, userId }) {
  const budget = await tx.budget.findUnique({ where: { id: budgetId }, include: { lines: true } })
  if (!budget) throw notFound('Budget')
  if (budget.state !== 'confirmed') throw conflict(`Only a confirmed budget can be revised (this one is ${budget.state})`)

  const revised = await tx.budget.create({
    data: {
      name: `${budget.name} Revised`,
      startDate: budget.startDate,
      endDate: budget.endDate,
      responsibleId: budget.responsibleId,
      state: 'draft',
      revisesId: budget.id,
      lines: {
        create: budget.lines.map((l) => ({
          analyticAccountId: l.analyticAccountId,
          committedAmount: l.committedAmount,
        })),
      },
    },
    include: BUDGET_INCLUDE,
  })
  await tx.budget.update({ where: { id: budget.id }, data: { state: 'revised' } })

  await writeAuditLog(tx, {
    action: AUDIT_ACTIONS.budget_revised, entity_type: 'budget', entity_id: budget.id,
    new_value: { revisedInto: revised.id }, performed_by: userId,
  })
  return revised
}
