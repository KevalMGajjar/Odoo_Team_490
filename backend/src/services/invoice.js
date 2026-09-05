import { D, money, qty, lineTax } from '../lib/money.js'
import { invalid, conflict, notFound } from '../lib/errors.js'
import { writeAuditLog, AUDIT_ACTIONS } from '../middleware/audit.js'
import { postEntry } from './ledger.js'
import { applyStockOut } from './inventory.js'
import { getRateOn, toBaseAmount, currencyAnnotation } from './currency.js'

/**
 * CUSTOMER INVOICE POSTING — produces TWO journal entries.
 *
 * 1. Revenue
 *      Dr Debtors      total    (partner = customer)
 *          Cr Sales Income  net
 *          Cr Output GST    tax
 *
 * 2. Cost of goods sold — only when stock-tracked goods are on the invoice
 *      Dr COGS         Σ qty × moving-average cost
 *          Cr Inventory     same
 *
 * Splitting these is what makes gross margin in the P&L real rather than
 * estimated, and it is why the cost hits the books on delivery, not on purchase.
 */

const ACC = { debtors: '1100', income: '4000', outputGst: '2100', cogs: '5050', inventory: '1300' }

async function accountByCode(tx, code) {
  const acc = await tx.chartOfAccount.findUnique({ where: { code } })
  if (!acc) throw conflict(`Account ${code} is missing from the chart of accounts`)
  return acc
}

export async function postCustomerInvoice(tx, { invoiceId, userId = null }) {
  const invoice = await tx.customerInvoice.findUnique({
    where: { id: invoiceId },
    include: {
      lines: { include: { product: true } },
      customer: true,
      currency: true,
    },
  })

  if (!invoice) throw notFound('Customer invoice')
  if (invoice.state === 'posted') {
    throw conflict(`Invoice ${invoice.number} is already posted — post a reversal to correct it`)
  }
  if (invoice.state === 'cancelled') throw conflict(`Invoice ${invoice.number} is cancelled`)
  if (invoice.lines.length === 0) {
    throw invalid('Add at least one line before posting', [
      { field: 'lines', message: 'At least one line is required' },
    ])
  }

  const { currency, rate } = await getRateOn(tx, invoice.currencyId, invoice.invoiceDate)
  const isBase = currency.isBase

  // sequential: the pg driver adapter serialises queries on a transaction client
  const debtorsAcc = await accountByCode(tx, ACC.debtors)
  const incomeAcc = await accountByCode(tx, ACC.income)
  const gstAcc = await accountByCode(tx, ACC.outputGst)
  const cogsAcc = await accountByCode(tx, ACC.cogs)
  const invAcc = await accountByCode(tx, ACC.inventory)

  // ─────────── entry 1: revenue ───────────
  const creditItems = []
  let netFx = money(0)
  let taxFx = money(0)

  for (const [idx, line] of invoice.lines.entries()) {
    const lineQty = qty(line.quantity)
    if (!lineQty.greaterThan(0)) {
      throw invalid('Quantity must be greater than zero', [
        { field: `lines.${idx}.quantity`, message: 'Must be greater than zero' },
      ])
    }

    const subtotalFx = money(line.subtotal)
    netFx = money(netFx.plus(subtotalFx))
    taxFx = money(taxFx.plus(lineTax(subtotalFx, line.taxRate ?? 0)))

    creditItems.push({
      accountId: line.accountId ?? incomeAcc.id,
      partnerId: invoice.customerId,
      analyticAccountId: line.analyticAccountId ?? null,
      label: line.description ?? line.product?.name ?? null,
      debit: 0,
      credit: toBaseAmount(subtotalFx, rate),
      ...currencyAnnotation(currency, isBase, subtotalFx),
    })
  }

  const taxBase = toBaseAmount(taxFx, rate)
  if (taxBase.greaterThan(0)) {
    creditItems.push({
      accountId: gstAcc.id,
      partnerId: invoice.customerId,
      label: 'Output GST',
      debit: 0,
      credit: taxBase,
      ...currencyAnnotation(currency, isBase, taxFx),
    })
  }

  // Debtors absorbs whatever the credits sum to, so rounding can never unbalance.
  const totalBase = money(creditItems.reduce((a, i) => a.plus(D(i.credit)), D(0)))
  const totalFx = money(netFx.plus(taxFx))

  const salesJournal = await tx.journal.findFirst({ where: { type: 'sales', status: 'active' } })
  if (!salesJournal) throw conflict('No active sales journal is configured')

  const revenueEntry = await postEntry(tx, {
    journalId: salesJournal.id,
    kind: 'revenue',
    date: invoice.invoiceDate,
    reference: invoice.number,
    narration: `Invoice ${invoice.number} — ${invoice.customer?.name ?? ''}`.trim(),
    userId,
    items: [
      {
        accountId: debtorsAcc.id,
        partnerId: invoice.customerId,
        label: invoice.customer?.name ?? null,
        debit: totalBase,
        credit: 0,
        ...currencyAnnotation(currency, isBase, totalFx),
      },
      ...creditItems,
    ],
  })

  // ─────────── entry 2: cost of goods sold ───────────
  // Deliver the stock first: applyStockOut returns the moving-average cost
  // actually consumed, which is what the COGS entry must use.
  let cogsTotal = money(0)
  const moveIds = []

  for (const line of invoice.lines) {
    if (line.product?.trackInventory !== true) continue

    const out = await applyStockOut(tx, {
      productId: line.productId,
      quantity: line.quantity,
      date: invoice.invoiceDate,
      reference: invoice.number,
      customerInvoiceId: invoice.id,
    })

    cogsTotal = money(cogsTotal.plus(out.value))
    moveIds.push(out.move.id)

    // freeze the cost on the line so margin reporting stays reproducible
    await tx.customerInvoiceLine.update({
      where: { id: line.id },
      data: { cogsUnitCost: out.unitCost.toFixed(4) },
    })
  }

  let cogsEntry = null
  if (cogsTotal.greaterThan(0)) {
    const miscJournal = await tx.journal.findFirst({
      where: { type: 'miscellaneous', status: 'active' },
    })
    cogsEntry = await postEntry(tx, {
      journalId: (miscJournal ?? salesJournal).id,
      kind: 'cogs',
      date: invoice.invoiceDate,
      reference: invoice.number,
      narration: `Cost of goods sold — ${invoice.number}`,
      userId,
      items: [
        { accountId: cogsAcc.id, partnerId: invoice.customerId, label: 'Cost of goods sold', debit: cogsTotal, credit: 0 },
        { accountId: invAcc.id, label: 'Inventory delivered', debit: 0, credit: cogsTotal },
      ],
    })

    if (moveIds.length) {
      await tx.stockMove.updateMany({
        where: { id: { in: moveIds } },
        data: { journalEntryId: cogsEntry.id },
      })
    }
  }

  // ─────────── close out the invoice ───────────
  const updated = await tx.customerInvoice.update({
    where: { id: invoice.id },
    data: {
      state: 'posted',
      exchangeRate: rate.toFixed(6),
      untaxed: netFx.toFixed(2),
      taxAmount: taxFx.toFixed(2),
      total: totalFx.toFixed(2),
      amountResidual: totalFx.toFixed(2),
      settleState: 'not_paid',
      journalEntryId: revenueEntry.id,
      cogsEntryId: cogsEntry?.id ?? null,
    },
    include: {
      lines: true,
      journalEntry: { include: { items: true } },
      cogsEntry: { include: { items: true } },
      stockMoves: true,
    },
  })

  if (invoice.salesOrderId) {
    for (const line of invoice.lines) {
      await tx.salesOrderLine.updateMany({
        where: { orderId: invoice.salesOrderId, productId: line.productId },
        data: { qtyInvoiced: { increment: Number(line.quantity) } },
      })
    }
  }

  await writeAuditLog(tx, {
    action: AUDIT_ACTIONS.customer_invoice_posted,
    entity_type: 'customer_invoice',
    entity_id: invoice.id,
    new_value: {
      number: invoice.number,
      revenueEntry: revenueEntry.number,
      cogsEntry: cogsEntry?.number ?? null,
      total: totalFx.toFixed(2),
      cogs: cogsTotal.toFixed(2),
      currency: currency.code,
    },
    performed_by: userId,
  })

  return { ...updated, cogsTotal }
}
