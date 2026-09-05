import express from 'express'
import { prisma } from '../lib/prisma.js'
import { verifyJWT } from '../middleware/auth.js'

const router = express.Router()

/**
 * GET /sync/bulk
 *
 * Returns all data the authenticated user is entitled to see in a single
 * response. Designed for offline-first clients that cache the entire dataset
 * locally and refresh with a manual "Update" button.
 *
 * Scoping by role:
 *   admin / invoicing_user  → all active master data + all transactions
 *   contact (portal)        → own invoices, bills, payments only
 *
 * The response is intentionally denormalised (includes nested lines/items)
 * so the client can render complete documents without additional requests.
 */
router.get('/bulk', verifyJWT, async (req, res, next) => {
  try {
    const { role, contactId } = req.user
    const isPortal = role === 'contact'

    let data

    if (isPortal) {
      // ─── Portal user: only their own documents ───
      if (!contactId) {
        return res.json({
          syncedAt: new Date().toISOString(),
          user: sanitiseUser(req.user),
          data: emptyDataset(),
        })
      }

      const [
        customerInvoices,
        vendorBills,
        payments,
      ] = await Promise.all([
        prisma.customerInvoice.findMany({
          where: { customerId: contactId },
          include: {
            lines: { include: { product: true } },
            customer: true,
            allocations: true,
          },
          orderBy: { invoiceDate: 'desc' },
        }),
        prisma.vendorBill.findMany({
          where: { vendorId: contactId },
          include: {
            lines: { include: { product: true } },
            vendor: true,
            allocations: true,
          },
          orderBy: { billDate: 'desc' },
        }),
        prisma.payment.findMany({
          where: { partnerId: contactId },
          include: {
            partner: true,
            journal: true,
            allocations: true,
          },
          orderBy: { paymentDate: 'desc' },
        }),
      ])

      data = {
        ...emptyDataset(),
        customerInvoices,
        vendorBills,
        payments,
      }
    } else {
      // ─── Admin / Invoicing User: everything ───
      const [
        contacts,
        products,
        accounts,
        journals,
        taxes,
        currencies,
        currencyRates,
        purchaseOrders,
        salesOrders,
        vendorBills,
        customerInvoices,
        payments,
        journalEntries,
        analyticAccounts,
        budgets,
      ] = await Promise.all([
        prisma.contact.findMany({
          where: { status: 'active' },
          orderBy: { name: 'asc' },
        }),
        prisma.product.findMany({
          where: { status: 'active' },
          include: { tax: true, category: true },
          orderBy: { name: 'asc' },
        }),
        prisma.chartOfAccount.findMany({
          where: { status: 'active' },
          orderBy: { code: 'asc' },
        }),
        prisma.journal.findMany({
          where: { status: 'active' },
          include: { defaultDebit: true, defaultCredit: true },
          orderBy: { code: 'asc' },
        }),
        prisma.tax.findMany({
          where: { status: 'active' },
          orderBy: { rate: 'asc' },
        }),
        prisma.currency.findMany({
          where: { status: 'active' },
          orderBy: { code: 'asc' },
        }),
        prisma.currencyRate.findMany({
          include: { currency: { select: { code: true } } },
          orderBy: { date: 'desc' },
          take: 500,
        }),
        prisma.purchaseOrder.findMany({
          include: {
            vendor: true,
            lines: { include: { product: true } },
          },
          orderBy: { createdAt: 'desc' },
        }),
        prisma.salesOrder.findMany({
          include: {
            customer: true,
            lines: { include: { product: true } },
          },
          orderBy: { createdAt: 'desc' },
        }),
        prisma.vendorBill.findMany({
          include: {
            vendor: true,
            lines: { include: { product: true } },
            allocations: true,
          },
          orderBy: { billDate: 'desc' },
        }),
        prisma.customerInvoice.findMany({
          include: {
            customer: true,
            lines: { include: { product: true } },
            allocations: true,
          },
          orderBy: { invoiceDate: 'desc' },
        }),
        prisma.payment.findMany({
          include: {
            partner: true,
            journal: true,
            allocations: true,
          },
          orderBy: { paymentDate: 'desc' },
        }),
        prisma.journalEntry.findMany({
          where: { state: 'posted' },
          include: {
            journal: true,
            items: { include: { account: true, partner: true } },
          },
          orderBy: { date: 'desc' },
        }),
        prisma.analyticAccount.findMany({
          where: { status: 'active' },
          orderBy: { name: 'asc' },
        }),
        prisma.budget.findMany({
          include: {
            analyticAccount: true,
            responsible: { select: { id: true, name: true } },
          },
          orderBy: { startDate: 'desc' },
        }),
      ])

      data = {
        contacts,
        products,
        accounts,
        journals,
        taxes,
        currencies,
        currencyRates,
        purchaseOrders,
        salesOrders,
        vendorBills,
        customerInvoices,
        payments,
        journalEntries,
        analyticAccounts,
        budgets,
      }
    }

    res.json({
      syncedAt: new Date().toISOString(),
      user: sanitiseUser(req.user),
      data,
    })
  } catch (err) {
    next(err)
  }
})

function sanitiseUser(u) {
  return { id: u.id, email: u.email, role: u.role, contactId: u.contactId ?? null }
}

function emptyDataset() {
  return {
    contacts: [],
    products: [],
    accounts: [],
    journals: [],
    taxes: [],
    currencies: [],
    currencyRates: [],
    purchaseOrders: [],
    salesOrders: [],
    vendorBills: [],
    customerInvoices: [],
    payments: [],
    journalEntries: [],
    analyticAccounts: [],
    budgets: [],
  }
}

export default router
