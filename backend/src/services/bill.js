import { D, money, qty, cost, lineTax, sumMoney } from '../lib/money.js'
import { invalid, conflict, notFound, invalidField } from '../lib/errors.js'
import { writeAuditLog, AUDIT_ACTIONS } from '../middleware/audit.js'
import { postEntry } from './ledger.js'
import { applyStockIn } from './inventory.js'
import { getRateOn, toBaseAmount, currencyAnnotation } from './currency.js'

/**
 * VENDOR BILL POSTING  (Anglo-Saxon)
 *
 *   Dr Inventory        net    — for stock-tracked goods lines
 *   Dr Purchase Expense net    — for services and non-tracked lines
 *   Dr Input GST        tax
 *       Cr Creditors           total   (partner = vendor)
 *
 * Side effects, same transaction: a stock IN move + valuation layer per tracked
 * line, at the line's unit cost converted to BASE currency, which recomputes the
 * product's moving-average cost.
 *
 * A purchase ORDER posts nothing — it is a commitment, not an accounting event.
 */

const ACC = { inventory: '1300', expense: '5000', inputGst: '1200', creditors: '2000' }

async function accountByCode(tx, code) {
  const acc = await tx.chartOfAccount.findUnique({ where: { code } })
  if (!acc) throw conflict(`Account ${code} is missing from the chart of accounts`)
  return acc
}

/**
 * Post a draft vendor bill.
 * @returns the updated bill including its journal entry and stock moves.
 */
export async function postVendorBill(tx, { billId, userId = null }) {
  const bill = await tx.vendorBill.findUnique({
    where: { id: billId },
    include: {
      lines: { include: { product: true } },
      vendor: true,
      currency: true,
    },
  })

  if (!bill) throw notFound('Vendor bill')
  if (bill.state === 'posted') {
    throw conflict(`Bill ${bill.number} is already posted — post a reversal to correct it`)
  }
  if (bill.state === 'cancelled') throw conflict(`Bill ${bill.number} is cancelled`)
  if (bill.lines.length === 0) {
    throw invalid('Add at least one line before posting', [
      { field: 'lines', message: 'At least one line is required' },
    ])
  }

  const { currency, rate } = await getRateOn(tx, bill.currencyId, bill.billDate)
  const isBase = currency.isBase

  // sequential: the pg driver adapter serialises queries on a transaction client
  const invAcc = await accountByCode(tx, ACC.inventory)
  const expAcc = await accountByCode(tx, ACC.expense)
  const gstAcc = await accountByCode(tx, ACC.inputGst)
  const credAcc = await accountByCode(tx, ACC.creditors)

  // ── build the debit side, one line per bill line ──
  const items = []
  const stockPlan = []
  let netTotalFx = money(0)
  let taxTotalFx = money(0)

  for (const [idx, line] of bill.lines.entries()) {
    const lineQty = qty(line.quantity)
    if (!lineQty.greaterThan(0)) {
      throw invalid('Quantity must be greater than zero', [
        { field: `lines.${idx}.quantity`, message: 'Must be greater than zero' },
      ])
    }

    const subtotalFx = money(line.subtotal)
    const taxFx = lineTax(subtotalFx, line.taxRate ?? 0)
    netTotalFx = money(netTotalFx.plus(subtotalFx))
    taxTotalFx = money(taxTotalFx.plus(taxFx))

    const subtotalBase = toBaseAmount(subtotalFx, rate)
    const tracked = line.product?.trackInventory === true

    items.push({
      accountId: tracked ? invAcc.id : (line.accountId ?? expAcc.id),
      partnerId: bill.vendorId,
      analyticAccountId: line.analyticAccountId ?? null,
      label: line.description ?? line.product?.name ?? null,
      debit: subtotalBase,
      credit: 0,
      ...currencyAnnotation(currency, isBase, subtotalFx),
    })

    if (tracked) {
      // unit cost must be in BASE currency — inventory valuation is a base-currency figure
      stockPlan.push({
        productId: line.productId,
        quantity: lineQty,
        unitCost: cost(subtotalBase.dividedBy(lineQty)),
      })
    }
  }

  // ── input GST ──
  const taxTotalBase = toBaseAmount(taxTotalFx, rate)
  if (taxTotalBase.greaterThan(0)) {
    items.push({
      accountId: gstAcc.id,
      partnerId: bill.vendorId,
      label: 'Input GST',
      debit: taxTotalBase,
      credit: 0,
      ...currencyAnnotation(currency, isBase, taxTotalFx),
    })
  }

  // ── creditors (the balancing credit) ──
  // Derived from the debits already computed so rounding can never unbalance
  // the entry: whatever the debits sum to is exactly what we credit.
  const totalBase = money(items.reduce((acc, i) => acc.plus(D(i.debit)), D(0)))
  const totalFx = money(netTotalFx.plus(taxTotalFx))

  items.push({
    accountId: credAcc.id,
    partnerId: bill.vendorId,
    label: bill.vendor?.name ?? null,
    debit: 0,
    credit: totalBase,
    ...currencyAnnotation(currency, isBase, totalFx),
  })

  const journal = await tx.journal.findFirst({ where: { type: 'purchase', status: 'active' } })
  if (!journal) throw conflict('No active purchase journal is configured')

  const entry = await postEntry(tx, {
    journalId: journal.id,
    kind: 'bill',
    date: bill.billDate,
    reference: bill.number,
    narration: `Vendor bill ${bill.number} — ${bill.vendor?.name ?? ''}`.trim(),
    items,
    userId,
  })

  // ── inventory receipts ──
  for (const plan of stockPlan) {
    await applyStockIn(tx, {
      ...plan,
      date: bill.billDate,
      reference: bill.number,
      vendorBillId: bill.id,
      journalEntryId: entry.id,
    })
  }

  // ── close out the bill ──
  const updated = await tx.vendorBill.update({
    where: { id: bill.id },
    data: {
      state: 'posted',
      exchangeRate: rate.toFixed(6),
      untaxed: netTotalFx.toFixed(2),
      taxAmount: taxTotalFx.toFixed(2),
      total: totalFx.toFixed(2),
      amountResidual: totalFx.toFixed(2),
      settleState: 'not_paid',
      journalEntryId: entry.id,
    },
    include: { lines: true, journalEntry: { include: { items: true } }, stockMoves: true },
  })

  // keep the source purchase order in step
  if (bill.purchaseOrderId) {
    for (const line of bill.lines) {
      await tx.purchaseOrderLine.updateMany({
        where: { orderId: bill.purchaseOrderId, productId: line.productId },
        data: { qtyBilled: { increment: Number(line.quantity) } },
      })
    }
  }

  await writeAuditLog(tx, {
    action: AUDIT_ACTIONS.vendor_bill_posted,
    entity_type: 'vendor_bill',
    entity_id: bill.id,
    new_value: {
      number: bill.number, entry: entry.number,
      total: totalFx.toFixed(2), currency: currency.code,
      stockMoves: stockPlan.length,
    },
    performed_by: userId,
  })

  return updated
}
