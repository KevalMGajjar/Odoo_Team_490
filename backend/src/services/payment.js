import { D, money, gt, sumMoney } from '../lib/money.js'
import { invalid, conflict, notFound, invalidField } from '../lib/errors.js'
import { writeAuditLog, AUDIT_ACTIONS } from '../middleware/audit.js'
import { postEntry } from './ledger.js'
import { getRateOn, toBaseAmount, currencyAnnotation } from './currency.js'

/**
 * PAYMENT POSTING + SETTLEMENT
 *
 * Inbound (money received from a customer)
 *   Dr Bank / Cash     amount × settlement rate
 *       Cr Debtors     allocated amounts × the rate each INVOICE was booked at
 *   ± FX Gain / Loss   the difference between those two rates
 *
 * Outbound (money paid to a vendor) mirrors it.
 *
 * Clearing the receivable at the ORIGINAL booking rate is what makes the
 * control account net to zero when a document is fully settled. The rate
 * movement is income or expense, not a receivable — that is the whole point
 * of realised FX.
 */

const ACC = { debtors: '1100', creditors: '2000', fxGain: '4200', fxLoss: '5400' }

async function accountByCode(tx, code) {
  const acc = await tx.chartOfAccount.findUnique({ where: { code } })
  if (!acc) throw conflict(`Account ${code} is missing from the chart of accounts`)
  return acc
}

/** Recompute residual + settle state for an invoice or bill after allocation. */
async function resettle(tx, { model, id }) {
  const doc = await tx[model].findUnique({
    where: { id },
    include: { allocations: { include: { payment: true } } },
  })
  if (!doc) return null

  const settled = sumMoney(
    doc.allocations.filter((a) => a.payment?.state === 'posted'),
    (a) => a.amount,
  )
  const total = money(doc.total)
  const residual = money(total.minus(settled))

  const settleState = residual.lessThanOrEqualTo(0)
    ? 'paid'
    : residual.lessThan(total) ? 'partial' : 'not_paid'

  return tx[model].update({
    where: { id },
    data: { amountResidual: residual.toFixed(2), settleState },
  })
}

export async function postPayment(tx, { paymentId, userId = null }) {
  const payment = await tx.payment.findUnique({
    where: { id: paymentId },
    include: {
      allocations: { include: { invoice: true, bill: true } },
      partner: true,
      currency: true,
      journal: { include: { defaultDebit: true } },
    },
  })

  if (!payment) throw notFound('Payment')
  if (payment.state === 'posted') {
    throw conflict(`Payment ${payment.number} is already posted — post a reversal to correct it`)
  }
  if (payment.state === 'cancelled') throw conflict(`Payment ${payment.number} is cancelled`)

  const amount = money(payment.amount)
  if (!amount.greaterThan(0)) throw invalidField('amount', 'Amount must be greater than zero')

  const bankAccount = payment.journal?.defaultDebit
  if (!bankAccount) {
    throw conflict(`Journal "${payment.journal?.name}" has no default bank/cash account configured`)
  }

  const inbound = payment.direction === 'inbound'
  const { currency, rate: settledRate } = await getRateOn(tx, payment.currencyId, payment.paymentDate)
  const isBase = currency.isBase

  // sequential, not Promise.all — the pg driver adapter runs one query at a
  // time on a transaction's client and warns on concurrent use
  const debtorsAcc = await accountByCode(tx, ACC.debtors)
  const creditorsAcc = await accountByCode(tx, ACC.creditors)
  const gainAcc = await accountByCode(tx, ACC.fxGain)
  const lossAcc = await accountByCode(tx, ACC.fxLoss)
  const controlAcc = inbound ? debtorsAcc : creditorsAcc

  // ── validate allocations against each document's residual ──
  let allocatedFx = money(0)
  const controlItems = []

  for (const alloc of payment.allocations) {
    const doc = inbound ? alloc.invoice : alloc.bill
    const what = inbound ? 'invoice' : 'bill'
    if (!doc) throw invalidField('allocations', `Allocation is not linked to a ${what}`)
    if (doc.state !== 'posted') {
      throw conflict(`${doc.number} must be posted before a payment can be recorded against it`)
    }

    const allocAmt = money(alloc.amount)
    if (!allocAmt.greaterThan(0)) {
      throw invalidField('allocations', 'Allocated amount must be greater than zero')
    }
    if (gt(allocAmt, money(doc.amountResidual))) {
      throw invalid(
        `Payment exceeds the outstanding balance of ${money(doc.amountResidual).toFixed(2)} on ${doc.number}`,
        [{ field: 'allocations', message: `Only ${money(doc.amountResidual).toFixed(2)} is outstanding` }],
      )
    }

    allocatedFx = money(allocatedFx.plus(allocAmt))

    // clear the control account at the rate the DOCUMENT was booked at
    const atBookedRate = toBaseAmount(allocAmt, D(doc.exchangeRate))
    controlItems.push({
      accountId: controlAcc.id,
      partnerId: payment.partnerId,
      label: doc.number,
      debit: inbound ? 0 : atBookedRate,
      credit: inbound ? atBookedRate : 0,
      ...currencyAnnotation(currency, isBase, allocAmt),
    })
  }

  if (gt(allocatedFx, amount)) {
    throw invalid('Allocations exceed the payment amount', [
      { field: 'allocations', message: `Allocated ${allocatedFx.toFixed(2)} of ${amount.toFixed(2)}` },
    ])
  }

  // ── unallocated remainder sits on the control account as an advance ──
  const unallocatedFx = money(amount.minus(allocatedFx))
  if (unallocatedFx.greaterThan(0)) {
    const atSettledRate = toBaseAmount(unallocatedFx, settledRate)
    controlItems.push({
      accountId: controlAcc.id,
      partnerId: payment.partnerId,
      label: 'On account (unallocated)',
      debit: inbound ? 0 : atSettledRate,
      credit: inbound ? atSettledRate : 0,
      ...currencyAnnotation(currency, isBase, unallocatedFx),
    })
  }

  // ── cash side, at the settlement rate ──
  const bankBase = toBaseAmount(amount, settledRate)
  const items = [
    {
      accountId: bankAccount.id,
      label: payment.partner?.name ?? null,
      debit: inbound ? bankBase : 0,
      credit: inbound ? 0 : bankBase,
      ...currencyAnnotation(currency, isBase, amount),
    },
    ...controlItems,
  ]

  // ── realised FX difference balances the entry ──
  const controlBase = money(controlItems.reduce((a, i) => a.plus(D(i.debit)).minus(D(i.credit)), D(0)))
  const cashSigned = inbound ? bankBase : bankBase.negated()
  const diff = money(cashSigned.plus(controlBase)) // must be zero without FX

  if (!diff.isZero()) {
    // diff = Σdebit − Σcredit among the non-FX lines.
    //   diff > 0 → debits exceed credits → balance with a CREDIT → gain
    //             (inbound: received more base currency than the receivable was booked at)
    //   diff < 0 → credits exceed debits → balance with a DEBIT  → loss
    //             (outbound: paid more base currency than the payable was booked at)
    const isGain = diff.greaterThan(0)
    items.push({
      accountId: isGain ? gainAcc.id : lossAcc.id,
      partnerId: payment.partnerId,
      label: `Realised exchange ${isGain ? 'gain' : 'loss'} — ${currency.code}`,
      debit: isGain ? 0 : diff.abs(),
      credit: isGain ? diff.abs() : 0,
    })
  }

  const entry = await postEntry(tx, {
    journalId: payment.journalId,
    kind: diff.isZero() ? 'payment' : 'fx',
    date: payment.paymentDate,
    reference: payment.number,
    narration: `${inbound ? 'Received from' : 'Paid to'} ${payment.partner?.name ?? ''}`.trim(),
    items,
    userId,
  })

  const updated = await tx.payment.update({
    where: { id: payment.id },
    data: { state: 'posted', exchangeRate: settledRate.toFixed(6), journalEntryId: entry.id },
    include: { allocations: true, journalEntry: { include: { items: true } } },
  })

  // ── settle the documents ──
  for (const alloc of payment.allocations) {
    if (alloc.invoiceId) await resettle(tx, { model: 'customerInvoice', id: alloc.invoiceId })
    if (alloc.billId) await resettle(tx, { model: 'vendorBill', id: alloc.billId })
  }

  await writeAuditLog(tx, {
    action: AUDIT_ACTIONS.payment_posted,
    entity_type: 'payment',
    entity_id: payment.id,
    new_value: {
      number: payment.number, entry: entry.number,
      amount: amount.toFixed(2), currency: currency.code,
      allocations: payment.allocations.length,
      fxDifference: diff.isZero() ? null : diff.abs().toFixed(2),
    },
    performed_by: userId,
  })

  return { ...updated, fxDifference: diff, allocatedFx, unallocatedFx }
}
