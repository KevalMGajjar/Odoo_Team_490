import { D, money, qty, cost, gt } from '../lib/money.js'
import { invalid, notFound } from '../lib/errors.js'
import { toDateOnly } from './ledger.js'

/**
 * PERPETUAL INVENTORY — moving average cost.
 *
 * Anglo-Saxon accounting:
 *   Vendor bill posted   → goods capitalise into Inventory (asset)   [stock IN]
 *   Customer invoice posted → cost expenses to COGS on delivery      [stock OUT]
 *
 * Two things make this trustworthy:
 *   1. stock_valuation_layers is APPEND-ONLY. Every change to a product's
 *      quantity and average cost is auditable line by line — we never mutate
 *      history, so the valuation report can explain itself.
 *   2. SUM(valuation_layer.value) MUST equal the Inventory control account
 *      balance in the general ledger. That is the second self-verifying proof
 *      in this system, alongside the balance sheet.
 *
 * This module never writes journal entries — it returns the amounts the caller
 * needs to build them, keeping ledger and inventory decoupled.
 */

const blockNegative = () => String(process.env.BLOCK_NEGATIVE_STOCK ?? 'true') === 'true'

/**
 * Receive stock and recompute the moving average.
 *
 *   newAvg = (onHand × oldAvg + inQty × inCost) / (onHand + inQty)
 *
 * @returns {{ move, layer, qtyAfter, avgCostAfter, value }}
 */
export async function applyStockIn(tx, {
  productId, quantity, unitCost, date, reference = null,
  vendorBillId = null, adjustmentId = null, journalEntryId = null,
}) {
  const inQty = qty(quantity)
  const inCost = cost(unitCost)

  if (!inQty.greaterThan(0)) {
    throw invalid('Quantity must be greater than zero', [
      { field: 'quantity', message: 'Must be greater than zero' },
    ])
  }
  if (inCost.isNegative()) {
    throw invalid('Unit cost cannot be negative', [
      { field: 'unitCost', message: 'Cannot be negative' },
    ])
  }

  const product = await tx.product.findUnique({
    where: { id: productId },
    select: { id: true, name: true, trackInventory: true, onHandQty: true, avgCost: true },
  })
  if (!product) throw notFound('Product')
  if (!product.trackInventory) {
    throw invalid(`"${product.name}" is not stock-tracked`, [
      { field: 'productId', message: 'This product does not track inventory' },
    ])
  }

  const oldQty = qty(product.onHandQty)
  const oldAvg = cost(product.avgCost)
  const newQty = qty(oldQty.plus(inQty))

  // Weighted average. If prior quantity was zero or negative, the incoming
  // cost simply becomes the new average — averaging against negative stock
  // produces nonsense.
  const newAvg = newQty.greaterThan(0) && oldQty.greaterThan(0)
    ? cost(oldQty.times(oldAvg).plus(inQty.times(inCost)).dividedBy(newQty))
    : inCost

  const value = money(inQty.times(inCost))
  const entryDate = toDateOnly(date)

  const move = await tx.stockMove.create({
    data: {
      productId,
      moveType: 'in',
      quantity: inQty.toFixed(3),
      unitCost: inCost.toFixed(4),
      date: entryDate,
      reference,
      vendorBillId,
      adjustmentId,
      journalEntryId,
    },
  })

  const layer = await tx.stockValuationLayer.create({
    data: {
      productId,
      stockMoveId: move.id,
      quantity: inQty.toFixed(3),
      unitCost: inCost.toFixed(4),
      value: value.toFixed(2),
      qtyAfter: newQty.toFixed(3),
      avgCostAfter: newAvg.toFixed(4),
      date: entryDate,
    },
  })

  await tx.product.update({
    where: { id: productId },
    data: { onHandQty: newQty.toFixed(3), avgCost: newAvg.toFixed(4) },
  })

  return { move, layer, qtyAfter: newQty, avgCostAfter: newAvg, value }
}

/**
 * Deliver stock, consuming at the CURRENT moving average.
 * The average is unchanged by an outward move — only quantity falls.
 *
 * @returns {{ move, layer, unitCost, value, qtyAfter }}
 */
export async function applyStockOut(tx, {
  productId, quantity, date, reference = null,
  customerInvoiceId = null, adjustmentId = null, journalEntryId = null,
}) {
  const outQty = qty(quantity)

  if (!outQty.greaterThan(0)) {
    throw invalid('Quantity must be greater than zero', [
      { field: 'quantity', message: 'Must be greater than zero' },
    ])
  }

  const product = await tx.product.findUnique({
    where: { id: productId },
    select: { id: true, name: true, trackInventory: true, onHandQty: true, avgCost: true },
  })
  if (!product) throw notFound('Product')
  if (!product.trackInventory) {
    throw invalid(`"${product.name}" is not stock-tracked`, [
      { field: 'productId', message: 'This product does not track inventory' },
    ])
  }

  const onHand = qty(product.onHandQty)
  const unitCost = cost(product.avgCost)

  if (blockNegative() && gt(outQty, onHand)) {
    throw invalid(
      `Insufficient stock for ${product.name}: ${onHand.toFixed(3)} on hand, ${outQty.toFixed(3)} requested`,
      [{ field: 'quantity', message: `Only ${onHand.toFixed(3)} available` }],
    )
  }

  const newQty = qty(onHand.minus(outQty))
  const value = money(outQty.times(unitCost))
  const entryDate = toDateOnly(date)

  const move = await tx.stockMove.create({
    data: {
      productId,
      moveType: 'out',
      quantity: outQty.toFixed(3),
      unitCost: unitCost.toFixed(4),
      date: entryDate,
      reference,
      customerInvoiceId,
      adjustmentId,
      journalEntryId,
    },
  })

  const layer = await tx.stockValuationLayer.create({
    data: {
      productId,
      stockMoveId: move.id,
      quantity: outQty.negated().toFixed(3), // signed: outward reduces value
      unitCost: unitCost.toFixed(4),
      value: value.negated().toFixed(2),
      qtyAfter: newQty.toFixed(3),
      avgCostAfter: unitCost.toFixed(4),
      date: entryDate,
    },
  })

  await tx.product.update({
    where: { id: productId },
    data: { onHandQty: newQty.toFixed(3) },
  })

  return { move, layer, unitCost, value, qtyAfter: newQty }
}

/**
 * Reconcile a counted quantity against the system quantity.
 * Positive delta receives at current average; negative delta issues.
 */
export async function applyStockAdjustment(tx, {
  productId, countedQty, date, reference = null, adjustmentId = null, journalEntryId = null,
}) {
  const product = await tx.product.findUnique({
    where: { id: productId },
    select: { id: true, name: true, trackInventory: true, onHandQty: true, avgCost: true },
  })
  if (!product) throw notFound('Product')

  const systemQty = qty(product.onHandQty)
  const counted = qty(countedQty)
  const delta = qty(counted.minus(systemQty))

  if (delta.isZero()) return { skipped: true, delta, systemQty, unitCost: cost(product.avgCost) }

  const args = { productId, date, reference, adjustmentId, journalEntryId }
  const result = delta.greaterThan(0)
    ? await applyStockIn(tx, { ...args, quantity: delta, unitCost: product.avgCost })
    : await applyStockOut(tx, { ...args, quantity: delta.abs() })

  return { ...result, delta, systemQty, countedQty: counted, unitCost: cost(product.avgCost) }
}

/**
 * Inventory valuation as of a date, rebuilt from the append-only layers.
 * Deliberately NOT read from product.onHandQty — recomputing from history is
 * what lets us prove the maintained figures are correct.
 */
export async function valuationAsOf(tx, { asOf = new Date() } = {}) {
  const rows = await tx.stockValuationLayer.groupBy({
    by: ['productId'],
    where: { date: { lte: toDateOnly(asOf) } },
    _sum: { quantity: true, value: true },
  })

  const products = await tx.product.findMany({
    where: { id: { in: rows.map((r) => r.productId) } },
    select: { id: true, name: true, avgCost: true, onHandQty: true },
  })
  const byId = new Map(products.map((p) => [p.id, p]))

  const lines = rows.map((r) => {
    const p = byId.get(r.productId)
    const quantity = qty(r._sum.quantity ?? 0)
    const value = money(r._sum.value ?? 0)
    return {
      productId: r.productId,
      name: p?.name ?? '(deleted)',
      quantity,
      value,
      unitCost: quantity.greaterThan(0) ? cost(value.dividedBy(quantity)) : cost(0),
      maintainedQty: qty(p?.onHandQty ?? 0),
      maintainedAvg: cost(p?.avgCost ?? 0),
    }
  })

  const totalValue = money(lines.reduce((acc, l) => acc.plus(l.value), D(0)))
  return { lines, totalValue }
}
