import express from 'express'
import { prisma } from '../lib/prisma.js'
import { verifyJWT } from '../middleware/auth.js'
import { forbidden, notFound } from '../lib/errors.js'

/**
 * The portal user's own view.
 *
 * `/invoices` and `/bills` are internal-only (a contact fetching the whole
 * list would see every customer's business) — this is the list a contact
 * CAN see, scoped to their own contactId only. Individual documents are
 * still fetched via GET /invoices/:id / GET /bills/:id, which already
 * enforce the same ownership check; this just makes them discoverable.
 */

const router = express.Router()

const requireContact = (req, res, next) => {
  if (req.user?.role !== 'contact') return next(forbidden('This endpoint is for portal users only'))
  if (!req.user.contactId) return next(forbidden('No contact is linked to this account'))
  next()
}

router.get('/documents', verifyJWT, requireContact, async (req, res, next) => {
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
router.get('/documents/:kind/:id', verifyJWT, requireContact, async (req, res, next) => {
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

export default router
