import express from 'express'
import { prisma } from '../lib/prisma.js'
import { verifyJWT } from '../middleware/auth.js'
import { forbidden, notFound, conflict, invalidField } from '../lib/errors.js'
import { nextNumber } from '../services/sequence.js'
import { postPayment } from '../services/payment.js'
import { toDateOnly } from '../services/ledger.js'
import { broadcastDocument } from '../lib/realtime.js'
import { money } from '../lib/money.js'

/**
 * The portal user's own view.
 *
 * `/invoices` and `/bills` are internal-only (a portal user fetching the
 * whole list would see every customer's business) — this is the list a
 * portal user CAN see, scoped to their own contactId only. Individual
 * documents are still fetched via GET /invoices/:id / GET /bills/:id, which
 * already enforce the same ownership check; this just makes them discoverable.
 */

const router = express.Router()

const requireUser = (req, res, next) => {
  if (req.user?.role !== 'user') return next(forbidden('This endpoint is for portal users only'))
  if (!req.user.contactId) return next(forbidden('No contact is linked to this account'))
  next()
}

router.get('/documents', verifyJWT, requireUser, async (req, res, next) => {
  try {
    const contactId = req.user.contactId

    const [invoices, bills] = await Promise.all([
      prisma.customerInvoice.findMany({
        where: { customerId: contactId, state: { not: 'draft' } },
        select: {
          id: true, number: true, invoiceDate: true, dueDate: true,
          total: true, amountResidual: true, settleState: true, state: true,
        },
        orderBy: { invoiceDate: 'desc' },
      }),
      prisma.vendorBill.findMany({
        where: { vendorId: contactId, state: { not: 'draft' } },
        select: {
          id: true, number: true, billDate: true, dueDate: true,
          total: true, amountResidual: true, settleState: true, state: true,
        },
        orderBy: { billDate: 'desc' },
      }),
    ])

    const rows = [
      ...invoices.map((d) => ({ ...d, kind: 'invoice', date: d.invoiceDate })),
      ...bills.map((d) => ({ ...d, kind: 'bill', date: d.billDate })),
    ].sort((a, b) => new Date(b.date) - new Date(a.date))

    res.json({ rows, total: rows.length })
  } catch (err) { next(err) }
})

/** One document, either kind, with its lines — for the portal detail view. */
router.get('/documents/:kind/:id', verifyJWT, requireUser, async (req, res, next) => {
  try {
    const { kind, id } = req.params
    if (!['invoice', 'bill'].includes(kind)) throw notFound('Document')

    const doc = kind === 'invoice'
      ? await prisma.customerInvoice.findUnique({
          where: { id },
          include: { lines: { include: { product: true } }, customer: true },
        })
      : await prisma.vendorBill.findUnique({
          where: { id },
          include: { lines: { include: { product: true } }, vendor: true },
        })

    if (!doc) throw notFound('Document')
    const ownerId = kind === 'invoice' ? doc.customerId : doc.vendorId
    if (ownerId !== req.user.contactId) throw notFound('Document')

    res.json({ ...doc, kind })
  } catch (err) { next(err) }
})

/**
 * Pay a customer invoice from the portal — always the FULL outstanding
 * amount, always via the first active bank journal (falling back to cash).
 * A portal user never sees or chooses an internal journal, and can't
 * lowball a payment against their own invoice; "pay my dues" means settle
 * in full. Bills are deliberately not payable here: a bill is money we owe
 * a vendor, not money the vendor owes us, so there is nothing for a vendor
 * to "pay" against their own bill.
 */
router.post('/documents/:kind/:id/pay', verifyJWT, requireUser, async (req, res, next) => {
  try {
    const { kind, id } = req.params
    if (kind !== 'invoice') throw invalidField('kind', 'Only invoices can be paid from the portal')

    const row = await prisma.$transaction(async (tx) => {
      const invoice = await tx.customerInvoice.findUnique({ where: { id } })
      if (!invoice || invoice.customerId !== req.user.contactId) throw notFound('Invoice')
      if (invoice.state !== 'posted') throw conflict(`${invoice.number} is not yet posted`)
      if (invoice.settleState === 'paid') throw conflict(`${invoice.number} is already fully paid`)

      const journal = await tx.journal.findFirst({
        where: { type: 'bank', status: 'active' },
        orderBy: { code: 'asc' },
      }) ?? await tx.journal.findFirst({ where: { type: 'cash', status: 'active' }, orderBy: { code: 'asc' } })
      if (!journal) throw conflict('No active bank or cash journal is configured')

      const amount = money(invoice.amountResidual).toFixed(2)
      const number = await nextNumber(tx, { code: 'PAY', prefix: 'PAY', date: new Date() })
      const created = await tx.payment.create({
        data: {
          number,
          direction: 'inbound',
          partnerId: invoice.customerId,
          journalId: journal.id,
          paymentDate: toDateOnly(new Date()),
          currencyId: invoice.currencyId,
          amount,
          createdBy: req.user.id,
          allocations: { create: [{ invoiceId: invoice.id, amount }] },
        },
      })

      return postPayment(tx, { paymentId: created.id, userId: req.user.id })
    }, { timeout: 30000 })

    broadcastDocument('payment:posted', { id: row.id, number: row.number }, row.partnerId)
    res.status(201).json(row)
  } catch (err) { next(err) }
})

export default router
