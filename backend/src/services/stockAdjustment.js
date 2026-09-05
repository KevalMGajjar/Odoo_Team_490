import { D, money } from '../lib/money.js'
import { conflict, notFound, invalid } from '../lib/errors.js'
import { writeAuditLog, AUDIT_ACTIONS } from '../middleware/audit.js'
import { postEntry, toDateOnly } from './ledger.js'
import { applyStockAdjustment } from './inventory.js'
import { nextNumber } from './sequence.js'

/**
 * STOCK ADJUSTMENT POSTING (PLAN.md §4.2 "Stock Adjustment — post")
 *
 *   Counted > system (gain):  Dr Inventory              Cr Inventory Adjustment
 *   Counted < system (loss):  Dr Inventory Adjustment    Cr Inventory
 *
 * One journal entry covers every line — the adjustment is a single business
 * event ("we did a stock count today"), even though it may touch several
 * products, each moving the shared Inventory account by its own delta.
 */

const ACC = { inventory: '1300', adjustment: '5500' }

async function accountByCode(tx, code) {
  const acc = await tx.chartOfAccount.findUnique({ where: { code } })
  if (!acc) throw conflict(`Account ${code} is missing from the chart of accounts`)
  return acc
}

export async function createAndPostStockAdjustment(tx, { date, reason, lines, userId = null }) {
  if (!Array.isArray(lines) || lines.length === 0) {
    throw invalid('Add at least one product to count', [{ field: 'lines', message: 'At least one line is required' }])
  }

  const adjDate = toDateOnly(date)
  const number = await nextNumber(tx, { code: 'ADJ', prefix: 'ADJ', date: adjDate })

  const adjustment = await tx.stockAdjustment.create({
    data: { number, date: adjDate, reason: reason ?? null, createdBy: userId },
  })

  const [invAcc, adjAcc] = [await accountByCode(tx, ACC.inventory), await accountByCode(tx, ACC.adjustment)]

  let netGain = money(0) // positive = more inventory value than the books show
  const lineRecords = []

  for (const line of lines) {
    const result = await applyStockAdjustment(tx, {
      productId: line.productId,
      countedQty: line.countedQty,
      date: adjDate,
      reference: number,
      adjustmentId: adjustment.id,
    })

    if (result.skipped) continue

    const lineValue = money(D(result.delta).abs().times(D(result.unitCost)))
    netGain = result.delta > 0 || D(result.delta).greaterThan(0) ? money(netGain.plus(lineValue)) : money(netGain.minus(lineValue))

    lineRecords.push(
      tx.stockAdjustmentLine.create({
        data: {
          adjustmentId: adjustment.id,
          productId: line.productId,
          systemQty: D(result.systemQty).toFixed(3),
          countedQty: D(result.countedQty ?? line.countedQty).toFixed(3),
          delta: D(result.delta).toFixed(3),
          unitCost: D(result.unitCost).toFixed(4),
        },
      }),
    )
  }

  await Promise.all(lineRecords)

  if (lineRecords.length === 0) {
    throw invalid('No product quantity actually changed — nothing to post', [
      { field: 'lines', message: 'Counted quantity matches the system quantity for every line' },
    ])
  }

  const isGain = netGain.greaterThan(0)
  const amount = netGain.abs()

  const entry = await postEntry(tx, {
    journalId: (await tx.journal.findFirst({ where: { type: 'miscellaneous', status: 'active' } })).id,
    kind: 'stock',
    date: adjDate,
    reference: number,
    narration: reason ?? `Stock count adjustment ${number}`,
    userId,
    items: [
      { accountId: invAcc.id, debit: isGain ? amount : 0, credit: isGain ? 0 : amount },
      { accountId: adjAcc.id, debit: isGain ? 0 : amount, credit: isGain ? amount : 0 },
    ],
  })

  const updated = await tx.stockAdjustment.update({
    where: { id: adjustment.id },
    data: { state: 'posted', journalEntryId: entry.id },
    include: {
      lines: { include: { product: { select: { name: true } } } },
      stockMoves: true,
      journalEntry: { include: { items: { include: { account: true } } } },
    },
  })

  await writeAuditLog(tx, {
    action: AUDIT_ACTIONS.stock_adjustment_posted,
    entity_type: 'stock_adjustment',
    entity_id: adjustment.id,
    new_value: { number, lines: lineRecords.length, netAmount: amount.toFixed(2), isGain },
    performed_by: userId,
  })

  return updated
}
