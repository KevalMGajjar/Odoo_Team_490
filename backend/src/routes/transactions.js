import express from 'express'
import { prisma } from '../lib/prisma.js'
import { D, money, lineSubtotal } from '../lib/money.js'
import { notFound, conflict, invalidField, badRequest } from '../lib/errors.js'
import { validate } from '../middleware/validate.js'
import { verifyJWT, requireRole, adminOnly } from '../middleware/auth.js'
import { writeAuditLog, AUDIT_ACTIONS } from '../middleware/audit.js'
import { broadcastDocument } from '../lib/realtime.js'
import { nextNumber } from '../services/sequence.js'
import { postEntry, reverseEntry, checkBalance, toDateOnly, postDraftEntry, resetEntryToDraft } from '../services/ledger.js'
import { postVendorBill } from '../services/bill.js'
import { postCustomerInvoice } from '../services/invoice.js'
import { postPayment } from '../services/payment.js'
import {
  postVoucher, peekVoucherNo, cashBankAccounts,
  getLastCashBankAccount, VOUCHER_META, fiscalYearOf, fiscalYearLabel,
} from '../services/voucher.js'
import * as S from '../schemas/transactions.js'

/**
 * Transactional documents.
 *
 * Reads are open to every internal role.
 * Creating and posting requires `admin` or `accountant`.
 * Reversing a posted entry is `admin` only — it is the only way to undo
 * anything, so it stays with the business owner.
 */

const router = express.Router()
const canWrite = requireRole(['admin', 'accountant'])

const internalOnly = (req, res, next) =>
  req.user?.role === 'user'
    ? res.status(403).json({ message: 'Not available to portal users' })
    : next()

// ─────────────────────────── helpers ───────────────────────────

async function baseCurrencyId(tx) {
  const base = await tx.currency.findFirst({ where: { isBase: true }, select: { id: true } })
  if (!base) throw conflict('No base currency is configured')
  return base.id
}

/**
 * Turn client line input into storable lines.
 *
 * Subtotals are computed here from quantity × unit price — never taken from the
 * request. Tax rate and account default from the product when omitted.
 *
 * @param {'purchase'|'sales'} side
 */
async function buildLines(tx, inputLines, side, { includeAccount = true } = {}) {
  const ids = [...new Set(inputLines.map((l) => l.productId))]
  const products = await tx.product.findMany({
    where: { id: { in: ids } },
    select: {
      id: true, name: true, status: true, gstRate: true, trackInventory: true,
      incomeAccountId: true, expenseAccountId: true, inventoryAccountId: true,
    },
  })
  const byId = new Map(products.map((p) => [p.id, p]))

  const missing = ids.filter((id) => !byId.has(id))
  if (missing.length) throw invalidField('lines', 'One or more products do not exist')

  const archived = products.find((p) => p.status === 'archived')
  if (archived) throw invalidField('lines', `"${archived.name}" is archived and cannot be used`)

  // fall back to the standard control accounts if a product has none set
  const fallbackCodes = side === 'sales' ? ['4000'] : ['1300', '5000']
  const fallbacks = await tx.chartOfAccount.findMany({
    where: { code: { in: fallbackCodes } },
    select: { id: true, code: true },
  })
  const byCode = new Map(fallbacks.map((a) => [a.code, a.id]))

  return inputLines.map((l) => {
    const p = byId.get(l.productId)
    const subtotal = lineSubtotal(l.quantity, l.unitPrice)

    let accountId = null
    if (includeAccount) {
      accountId = l.accountId
      if (!accountId) {
        if (side === 'sales') accountId = p.incomeAccountId ?? byCode.get('4000')
        else accountId = p.trackInventory
          ? (p.inventoryAccountId ?? byCode.get('1300'))
          : (p.expenseAccountId ?? byCode.get('5000'))
      }
    }

    return {
      productId: l.productId,
      // PurchaseOrderLine / SalesOrderLine have no accountId column — a PO/SO
      // is a commitment, not an accounting document, so it never touches an
      // account. Only VendorBillLine / CustomerInvoiceLine carry one.
      ...(includeAccount ? { accountId } : {}),
      description: l.description ?? p.name,
      quantity: D(l.quantity).toFixed(3),
      unitPrice: money(l.unitPrice).toFixed(2),
      taxRate: D(l.taxRate ?? p.gstRate).toFixed(2),
      subtotal: subtotal.toFixed(2),
      analyticAccountId: l.analyticAccountId ?? null,
    }
  })
}

/** Untaxed / tax / total from stored lines. */
function totalsOf(lines) {
  const untaxed = money(lines.reduce((a, l) => a.plus(D(l.subtotal)), D(0)))
  const taxAmount = money(
    lines.reduce((a, l) => a.plus(D(l.subtotal).times(D(l.taxRate)).dividedBy(100)), D(0)),
  )
  return { untaxed, taxAmount, total: money(untaxed.plus(taxAmount)) }
}

/** Shared list handler for documents. */
const listDocuments = (model, { include, searchField = 'number', partnerField }) =>
  async (req, res, next) => {
    try {
      const { q, state, settleState, partnerId, direction, from, to, page = '1', pageSize = '50' } = req.query
      const take = Math.min(Math.max(parseInt(pageSize, 10) || 50, 1), 200)
      const skip = (Math.max(parseInt(page, 10) || 1, 1) - 1) * take

      const where = {}
      if (state) where.state = state
      if (settleState) where.settleState = settleState
      if (partnerId && partnerField) where[partnerField] = partnerId
      // Payments only: 'inbound' (received) vs 'outbound' (paid) — Payments
      // Received / Payments Made are the same list, filtered by this.
      if (direction && model === 'payment') where.direction = direction
      if (q?.trim()) where[searchField] = { contains: q.trim(), mode: 'insensitive' }

      const rows = await prisma[model].findMany({
        where, include, orderBy: { createdAt: 'desc' }, skip, take,
      })
      const total = await prisma[model].count({ where })
      res.json({ rows, total, page: Math.floor(skip / take) + 1, pageSize: take })
    } catch (err) { next(err) }
  }

// ═══════════════════════ PURCHASE ORDERS ═══════════════════════
// A purchase order is a commitment, not an accounting event: confirming one
// deliberately creates no journal entry.

router.get('/purchase-orders', verifyJWT, internalOnly, listDocuments('purchaseOrder', {
  include: { vendor: true, currency: true, lines: { include: { product: true } } },
  partnerField: 'vendorId',
}))

router.get('/purchase-orders/:id', verifyJWT, internalOnly, async (req, res, next) => {
  try {
    const row = await prisma.purchaseOrder.findUnique({
      where: { id: req.params.id },
      include: { vendor: true, currency: true, lines: { include: { product: true, analyticAccount: true } }, bills: true },
    })
    if (!row) throw notFound('Purchase order')
    res.json(row)
  } catch (err) { next(err) }
})

router.post('/purchase-orders', verifyJWT, canWrite, validate(S.purchaseOrderCreate),
  async (req, res, next) => {
    try {
      const { vendorId, orderDate, currencyId, lines: input } = req.body

      const row = await prisma.$transaction(async (tx) => {
        const vendor = await tx.contact.findUnique({ where: { id: vendorId } })
        if (!vendor) throw invalidField('vendorId', 'Vendor does not exist')
        if (!['vendor', 'both'].includes(vendor.type)) {
          throw invalidField('vendorId', `${vendor.name} is not a vendor`)
        }

        const lines = await buildLines(tx, input, 'purchase', { includeAccount: false })
        const t = totalsOf(lines)
        const number = await nextNumber(tx, { code: 'PO', prefix: 'PO', date: orderDate })

        const created = await tx.purchaseOrder.create({
          data: {
            number, vendorId, orderDate: toDateOnly(orderDate),
            currencyId: currencyId ?? await baseCurrencyId(tx),
            untaxed: t.untaxed.toFixed(2), taxAmount: t.taxAmount.toFixed(2), total: t.total.toFixed(2),
            createdBy: req.user.id,
            lines: { create: lines },
          },
          include: { vendor: true, lines: true },
        })

        await writeAuditLog(tx, {
          action: AUDIT_ACTIONS.purchase_order_created,
          entity_type: 'purchase_order', entity_id: created.id,
          new_value: { number, total: t.total.toFixed(2) }, performed_by: req.user.id,
        })
        return created
      }, { timeout: 30000 })

      broadcastDocument('purchaseOrder:created', { id: row.id, number: row.number })
      res.status(201).json(row)
    } catch (err) { next(err) }
  })

router.post('/purchase-orders/:id/confirm', verifyJWT, canWrite, async (req, res, next) => {
  try {
    const po = await prisma.purchaseOrder.findUnique({ where: { id: req.params.id } })
    if (!po) throw notFound('Purchase order')
    if (po.state !== 'draft') throw conflict(`Purchase order ${po.number} is already ${po.state}`)

    const row = await prisma.purchaseOrder.update({
      where: { id: po.id }, data: { state: 'confirmed' },
      include: { vendor: true, lines: true },
    })
    broadcastDocument('purchaseOrder:confirmed', { id: row.id, number: row.number })
    res.json(row)
  } catch (err) { next(err) }
})

/** Convert a confirmed PO into a DRAFT bill — nothing posts until the bill does. */
router.post('/purchase-orders/:id/create-bill', verifyJWT, canWrite, async (req, res, next) => {
  try {
    const row = await prisma.$transaction(async (tx) => {
      const po = await tx.purchaseOrder.findUnique({
        where: { id: req.params.id },
        include: { lines: true },
      })
      if (!po) throw notFound('Purchase order')
      if (po.state !== 'confirmed') {
        throw conflict('Confirm the purchase order before creating a bill from it')
      }

      const billDate = new Date()
      const number = await nextNumber(tx, { code: 'BILL', prefix: 'BILL', date: billDate })
      const dueDate = new Date(billDate)
      dueDate.setUTCDate(dueDate.getUTCDate() + 30)

      // A bill line needs a real account: Inventory for stocked goods, the
      // expense account otherwise. The PO line carries no account of its own.
      const products = await tx.product.findMany({
        where: { id: { in: [...new Set(po.lines.map((l) => l.productId))] } },
        select: { id: true, trackInventory: true, inventoryAccountId: true, expenseAccountId: true },
      })
      const byId = new Map(products.map((p) => [p.id, p]))
      const invAcc = await tx.chartOfAccount.findUnique({ where: { code: '1300' } })
      const expAcc = await tx.chartOfAccount.findUnique({ where: { code: '5000' } })

      const accountFor = (productId) => {
        const p = byId.get(productId)
        return p?.trackInventory
          ? (p.inventoryAccountId ?? invAcc.id)
          : (p?.expenseAccountId ?? expAcc.id)
      }

      return tx.vendorBill.create({
        data: {
          number, vendorId: po.vendorId, purchaseOrderId: po.id,
          billDate: toDateOnly(billDate), dueDate: toDateOnly(dueDate),
          currencyId: po.currencyId, exchangeRate: po.exchangeRate,
          untaxed: po.untaxed, taxAmount: po.taxAmount, total: po.total,
          amountResidual: po.total,
          createdBy: req.user.id,
          lines: {
            create: po.lines.map((l) => ({
              productId: l.productId,
              accountId: accountFor(l.productId),
              description: l.description, quantity: l.quantity, unitPrice: l.unitPrice,
              taxRate: l.taxRate, subtotal: l.subtotal, analyticAccountId: l.analyticAccountId,
            })),
          },
        },
        include: { lines: true, vendor: true },
      })
    }, { timeout: 30000 })

    res.status(201).json(row)
  } catch (err) { next(err) }
})

// ═══════════════════════ VENDOR BILLS ═══════════════════════

router.get('/bills', verifyJWT, internalOnly, listDocuments('vendorBill', {
  include: { vendor: true, currency: true, lines: { include: { product: true } } },
  partnerField: 'vendorId',
}))

router.get('/bills/:id', verifyJWT, internalOnly, async (req, res, next) => {
  try {
    const row = await prisma.vendorBill.findUnique({
      where: { id: req.params.id },
      include: {
        vendor: true, currency: true, lines: { include: { product: true, account: true, analyticAccount: true } },
        journalEntry: { include: { items: { include: { account: true } } } },
        allocations: { include: { payment: true } },
        stockMoves: { include: { product: { select: { name: true } } } },
        purchaseOrder: { select: { id: true, number: true } },
      },
    })
    if (!row) throw notFound('Vendor bill')
    res.json(row)
  } catch (err) { next(err) }
})

router.post('/bills', verifyJWT, canWrite, validate(S.vendorBillCreate), async (req, res, next) => {
  try {
    const { vendorId, purchaseOrderId, reference, billDate, dueDate, currencyId, lines: input } = req.body

    const row = await prisma.$transaction(async (tx) => {
      const vendor = await tx.contact.findUnique({ where: { id: vendorId } })
      if (!vendor) throw invalidField('vendorId', 'Vendor does not exist')
      if (!['vendor', 'both'].includes(vendor.type)) {
        throw invalidField('vendorId', `${vendor.name} is not a vendor`)
      }

      const lines = await buildLines(tx, input, 'purchase')
      const t = totalsOf(lines)
      const number = await nextNumber(tx, { code: 'BILL', prefix: 'BILL', date: billDate })

      const created = await tx.vendorBill.create({
        data: {
          number, vendorId, purchaseOrderId: purchaseOrderId ?? null, reference: reference || null,
          billDate: toDateOnly(billDate),
          dueDate: dueDate ? toDateOnly(dueDate) : null,
          currencyId: currencyId ?? await baseCurrencyId(tx),
          untaxed: t.untaxed.toFixed(2), taxAmount: t.taxAmount.toFixed(2),
          total: t.total.toFixed(2), amountResidual: t.total.toFixed(2),
          createdBy: req.user.id,
          lines: { create: lines },
        },
        include: { vendor: true, lines: true },
      })

      await writeAuditLog(tx, {
        action: AUDIT_ACTIONS.vendor_bill_created,
        entity_type: 'vendor_bill', entity_id: created.id,
        new_value: { number, total: t.total.toFixed(2) }, performed_by: req.user.id,
      })
      return created
    }, { timeout: 30000 })

    broadcastDocument('bill:created', { id: row.id, number: row.number })
    res.status(201).json(row)
  } catch (err) { next(err) }
})

/** Posting writes to the ledger and receives stock. Irreversible except by reversal. */
router.post('/bills/:id/post', verifyJWT, canWrite, async (req, res, next) => {
  try {
    const row = await prisma.$transaction(
      (tx) => postVendorBill(tx, { billId: req.params.id, userId: req.user.id }),
      { timeout: 30000 },
    )
    broadcastDocument('bill:posted', { id: row.id, number: row.number }, row.vendorId)
    broadcastDocument('stock:changed', { source: row.number })
    res.json(row)
  } catch (err) { next(err) }
})

// ═══════════════════════ SALES ORDERS ═══════════════════════

router.get('/sales-orders', verifyJWT, internalOnly, listDocuments('salesOrder', {
  include: { customer: true, currency: true, lines: { include: { product: true } } },
  partnerField: 'customerId',
}))

router.get('/sales-orders/:id', verifyJWT, internalOnly, async (req, res, next) => {
  try {
    const row = await prisma.salesOrder.findUnique({
      where: { id: req.params.id },
      include: { customer: true, currency: true, lines: { include: { product: true, analyticAccount: true } }, invoices: true },
    })
    if (!row) throw notFound('Sales order')
    res.json(row)
  } catch (err) { next(err) }
})

router.post('/sales-orders', verifyJWT, canWrite, validate(S.salesOrderCreate),
  async (req, res, next) => {
    try {
      const { customerId, orderDate, currencyId, lines: input } = req.body

      const row = await prisma.$transaction(async (tx) => {
        const customer = await tx.contact.findUnique({ where: { id: customerId } })
        if (!customer) throw invalidField('customerId', 'Customer does not exist')
        if (!['customer', 'both'].includes(customer.type)) {
          throw invalidField('customerId', `${customer.name} is not a customer`)
        }

        const lines = await buildLines(tx, input, 'sales', { includeAccount: false })
        const t = totalsOf(lines)
        const number = await nextNumber(tx, { code: 'SO', prefix: 'SO', date: orderDate })

        const created = await tx.salesOrder.create({
          data: {
            number, customerId, orderDate: toDateOnly(orderDate),
            currencyId: currencyId ?? await baseCurrencyId(tx),
            untaxed: t.untaxed.toFixed(2), taxAmount: t.taxAmount.toFixed(2), total: t.total.toFixed(2),
            createdBy: req.user.id,
            lines: { create: lines },
          },
          include: { customer: true, lines: true },
        })

        await writeAuditLog(tx, {
          action: AUDIT_ACTIONS.sales_order_created,
          entity_type: 'sales_order', entity_id: created.id,
          new_value: { number, total: t.total.toFixed(2) }, performed_by: req.user.id,
        })
        return created
      }, { timeout: 30000 })

      broadcastDocument('salesOrder:created', { id: row.id, number: row.number })
      res.status(201).json(row)
    } catch (err) { next(err) }
  })

router.post('/sales-orders/:id/confirm', verifyJWT, canWrite, async (req, res, next) => {
  try {
    const so = await prisma.salesOrder.findUnique({ where: { id: req.params.id } })
    if (!so) throw notFound('Sales order')
    if (so.state !== 'draft') throw conflict(`Sales order ${so.number} is already ${so.state}`)

    const row = await prisma.salesOrder.update({
      where: { id: so.id }, data: { state: 'confirmed' },
      include: { customer: true, lines: true },
    })
    broadcastDocument('salesOrder:confirmed', { id: row.id, number: row.number })
    res.json(row)
  } catch (err) { next(err) }
})

router.post('/sales-orders/:id/create-invoice', verifyJWT, canWrite, async (req, res, next) => {
  try {
    const row = await prisma.$transaction(async (tx) => {
      const so = await tx.salesOrder.findUnique({
        where: { id: req.params.id }, include: { lines: true },
      })
      if (!so) throw notFound('Sales order')
      if (so.state !== 'confirmed') {
        throw conflict('Confirm the sales order before creating an invoice from it')
      }

      const invoiceDate = new Date()
      const number = await nextNumber(tx, { code: 'INV', prefix: 'INV', date: invoiceDate })
      const dueDate = new Date(invoiceDate)
      dueDate.setUTCDate(dueDate.getUTCDate() + 30)

      const incomeAcc = await tx.chartOfAccount.findUnique({ where: { code: '4000' } })

      return tx.customerInvoice.create({
        data: {
          number, customerId: so.customerId, salesOrderId: so.id,
          invoiceDate: toDateOnly(invoiceDate), dueDate: toDateOnly(dueDate),
          currencyId: so.currencyId, exchangeRate: so.exchangeRate,
          untaxed: so.untaxed, taxAmount: so.taxAmount, total: so.total,
          createdBy: req.user.id,
          lines: {
            create: so.lines.map((l) => ({
              productId: l.productId, accountId: incomeAcc.id,
              description: l.description, quantity: l.quantity, unitPrice: l.unitPrice,
              taxRate: l.taxRate, subtotal: l.subtotal, analyticAccountId: l.analyticAccountId,
            })),
          },
        },
        include: { lines: true, customer: true },
      })
    }, { timeout: 30000 })

    res.status(201).json(row)
  } catch (err) { next(err) }
})

// ═══════════════════════ CUSTOMER INVOICES ═══════════════════════

router.get('/invoices', verifyJWT, internalOnly, listDocuments('customerInvoice', {
  include: { customer: true, currency: true, lines: { include: { product: true } } },
  partnerField: 'customerId',
}))

router.get('/invoices/:id', verifyJWT, async (req, res, next) => {
  try {
    const row = await prisma.customerInvoice.findUnique({
      where: { id: req.params.id },
      include: {
        customer: true, currency: true, lines: { include: { product: true, account: true, analyticAccount: true } },
        journalEntry: { include: { items: { include: { account: true } } } },
        cogsEntry: { include: { items: { include: { account: true } } } },
        allocations: { include: { payment: true } },
        salesOrder: { select: { id: true, number: true } },
      },
    })
    if (!row) throw notFound('Invoice')
    // portal users may only see their own
    if (req.user.role === 'user' && row.customerId !== req.user.contactId) {
      throw notFound('Invoice')
    }
    res.json(row)
  } catch (err) { next(err) }
})

router.post('/invoices', verifyJWT, canWrite, validate(S.customerInvoiceCreate),
  async (req, res, next) => {
    try {
      const { customerId, salesOrderId, reference, invoiceDate, dueDate, currencyId, lines: input } = req.body

      const row = await prisma.$transaction(async (tx) => {
        const customer = await tx.contact.findUnique({ where: { id: customerId } })
        if (!customer) throw invalidField('customerId', 'Customer does not exist')
        if (!['customer', 'both'].includes(customer.type)) {
          throw invalidField('customerId', `${customer.name} is not a customer`)
        }

        const lines = await buildLines(tx, input, 'sales')
        const t = totalsOf(lines)
        const number = await nextNumber(tx, { code: 'INV', prefix: 'INV', date: invoiceDate })

        const created = await tx.customerInvoice.create({
          data: {
            number, customerId, salesOrderId: salesOrderId ?? null, reference: reference || null,
            invoiceDate: toDateOnly(invoiceDate),
            dueDate: dueDate ? toDateOnly(dueDate) : null,
            currencyId: currencyId ?? await baseCurrencyId(tx),
            untaxed: t.untaxed.toFixed(2), taxAmount: t.taxAmount.toFixed(2),
            total: t.total.toFixed(2), amountResidual: t.total.toFixed(2),
            createdBy: req.user.id,
            lines: { create: lines },
          },
          include: { customer: true, lines: true },
        })

        await writeAuditLog(tx, {
          action: AUDIT_ACTIONS.customer_invoice_created,
          entity_type: 'customer_invoice', entity_id: created.id,
          new_value: { number, total: t.total.toFixed(2) }, performed_by: req.user.id,
        })
        return created
      }, { timeout: 30000 })

      broadcastDocument('invoice:created', { id: row.id, number: row.number }, row.customerId)
      res.status(201).json(row)
    } catch (err) { next(err) }
  })

/** Posting emits TWO entries — revenue, and COGS at moving-average cost. */
router.post('/invoices/:id/post', verifyJWT, canWrite, async (req, res, next) => {
  try {
    const row = await prisma.$transaction(
      (tx) => postCustomerInvoice(tx, { invoiceId: req.params.id, userId: req.user.id }),
      { timeout: 30000 },
    )
    broadcastDocument('invoice:posted', { id: row.id, number: row.number }, row.customerId)
    broadcastDocument('stock:changed', { source: row.number })
    res.json(row)
  } catch (err) { next(err) }
})

// ═══════════════════════ PAYMENTS ═══════════════════════

router.get('/payments', verifyJWT, internalOnly, listDocuments('payment', {
  include: { partner: true, journal: true, currency: true, allocations: true },
  partnerField: 'partnerId',
}))

router.get('/payments/:id', verifyJWT, internalOnly, async (req, res, next) => {
  try {
    const row = await prisma.payment.findUnique({
      where: { id: req.params.id },
      include: {
        partner: true, journal: true, currency: true,
        allocations: { include: { invoice: true, bill: true } },
        journalEntry: { include: { items: { include: { account: true } } } },
      },
    })
    if (!row) throw notFound('Payment')
    res.json(row)
  } catch (err) { next(err) }
})

/** Create and post in one call — a payment has no meaningful draft state. */
router.post('/payments', verifyJWT, canWrite, validate(S.paymentCreate), async (req, res, next) => {
  try {
    const { direction, partnerId, journalId, paymentDate, currencyId, amount, allocations } = req.body

    const row = await prisma.$transaction(async (tx) => {
      const journal = await tx.journal.findUnique({ where: { id: journalId } })
      if (!journal) throw invalidField('journalId', 'Journal does not exist')
      if (!['bank', 'cash'].includes(journal.type)) {
        throw invalidField('journalId', 'Choose a bank or cash journal')
      }

      const number = await nextNumber(tx, { code: 'PAY', prefix: 'PAY', date: paymentDate })
      const created = await tx.payment.create({
        data: {
          number, direction, partnerId, journalId,
          paymentDate: toDateOnly(paymentDate),
          currencyId: currencyId ?? await baseCurrencyId(tx),
          amount: money(amount).toFixed(2),
          createdBy: req.user.id,
          allocations: {
            create: allocations.map((a) => ({
              invoiceId: a.invoiceId ?? null,
              billId: a.billId ?? null,
              amount: money(a.amount).toFixed(2),
            })),
          },
        },
      })

      return postPayment(tx, { paymentId: created.id, userId: req.user.id })
    }, { timeout: 30000 })

    broadcastDocument('payment:posted', { id: row.id, number: row.number }, row.partnerId)
    res.status(201).json(row)
  } catch (err) { next(err) }
})

/** "Register payment" from an invoice or a bill: allocates the whole amount to it. */
const registerAgainst = (kind) => async (req, res, next) => {
  try {
    const { journalId, paymentDate, amount, currencyId, note } = req.body
    const model = kind === 'invoice' ? 'customerInvoice' : 'vendorBill'

    const row = await prisma.$transaction(async (tx) => {
      const doc = await tx[model].findUnique({ where: { id: req.params.id } })
      if (!doc) throw notFound(kind === 'invoice' ? 'Invoice' : 'Bill')
      if (doc.state !== 'posted') {
        throw conflict(`${doc.number} must be posted before a payment can be recorded against it`)
      }
      if (doc.settleState === 'paid') throw conflict(`${doc.number} is already fully paid`)

      const number = await nextNumber(tx, { code: 'PAY', prefix: 'PAY', date: paymentDate })
      const created = await tx.payment.create({
        data: {
          number,
          direction: kind === 'invoice' ? 'inbound' : 'outbound',
          partnerId: kind === 'invoice' ? doc.customerId : doc.vendorId,
          journalId,
          paymentDate: toDateOnly(paymentDate),
          currencyId: currencyId ?? doc.currencyId,
          amount: money(amount).toFixed(2),
          note: note || null,
          createdBy: req.user.id,
          allocations: {
            create: [{
              [kind === 'invoice' ? 'invoiceId' : 'billId']: doc.id,
              amount: money(amount).toFixed(2),
            }],
          },
        },
      })

      return postPayment(tx, { paymentId: created.id, userId: req.user.id })
    }, { timeout: 30000 })

    broadcastDocument('payment:posted', { id: row.id, number: row.number }, row.partnerId)
    res.status(201).json(row)
  } catch (err) { next(err) }
}

router.post('/invoices/:id/register-payment', verifyJWT, canWrite,
  validate(S.registerPayment), registerAgainst('invoice'))
router.post('/bills/:id/register-payment', verifyJWT, canWrite,
  validate(S.registerPayment), registerAgainst('bill'))

// ═══════════════════════ VOUCHERS ═══════════════════════
// Five entry screens over the same ledger engine.

router.get('/vouchers/types', verifyJWT, internalOnly, (req, res) => {
  res.json({
    types: Object.entries(VOUCHER_META).map(([value, m]) => ({
      value, label: m.label, group: m.group, direction: m.direction,
    })),
  })
})

/** Bank/cash accounts for the counter-side, plus the account last used. */
router.get('/vouchers/cash-bank-accounts', verifyJWT, internalOnly, async (req, res, next) => {
  try {
    const { voucherType } = req.query
    const accounts = await cashBankAccounts(prisma)
    const lastUsed = voucherType
      ? await getLastCashBankAccount(prisma, req.user.id, voucherType)
      : null
    res.json({ accounts, lastUsed })
  } catch (err) { next(err) }
})

/** Next voucher number for the entry screen header — peeked, not consumed. */
router.get('/vouchers/next-number', verifyJWT, internalOnly, async (req, res, next) => {
  try {
    const { voucherType, date } = req.query
    if (!VOUCHER_META[voucherType]) throw badRequest('Unknown voucher type')
    const on = date ? new Date(date) : new Date()
    const { voucherNo, fiscalYear } = await peekVoucherNo(prisma, voucherType, on)
    res.json({ voucherType, voucherNo, fiscalYear, fiscalYearLabel: fiscalYearLabel(fiscalYear) })
  } catch (err) { next(err) }
})

router.post('/vouchers', verifyJWT, canWrite, validate(S.voucherCreate), async (req, res, next) => {
  try {
    const row = await prisma.$transaction(
      (tx) => postVoucher(tx, { ...req.body, userId: req.user.id }),
      { timeout: 30000 },
    )
    broadcastDocument('voucher:posted', {
      id: row.id, number: row.number, voucherType: row.voucherType, voucherNo: row.voucherNo,
    })
    res.status(201).json(row)
  } catch (err) { next(err) }
})

// ═══════════════════════ JOURNAL ENTRIES ═══════════════════════

router.get('/journal-entries', verifyJWT, internalOnly, async (req, res, next) => {
  try {
    const { q, kind, voucherType, from, to, state, page = '1', pageSize = '50' } = req.query
    const take = Math.min(Math.max(parseInt(pageSize, 10) || 50, 1), 200)
    const skip = (Math.max(parseInt(page, 10) || 1, 1) - 1) * take

    const where = { state: state === 'draft' ? 'draft' : 'posted' }
    if (kind) where.kind = kind
    if (voucherType) where.voucherType = voucherType
    if (from || to) {
      where.date = {}
      if (from) where.date.gte = toDateOnly(from)
      if (to) where.date.lte = toDateOnly(to)
    }
    if (q?.trim()) {
      where.OR = [
        { number: { contains: q.trim(), mode: 'insensitive' } },
        { reference: { contains: q.trim(), mode: 'insensitive' } },
        { narration: { contains: q.trim(), mode: 'insensitive' } },
      ]
    }

    const rows = await prisma.journalEntry.findMany({
      where, include: { journal: true, items: { include: { account: true, partner: true } } },
      orderBy: [{ date: 'desc' }, { postedAt: 'desc' }], skip, take,
    })
    const total = await prisma.journalEntry.count({ where })
    res.json({ rows, total, page: Math.floor(skip / take) + 1, pageSize: take })
  } catch (err) { next(err) }
})

router.get('/journal-entries/:id', verifyJWT, internalOnly, async (req, res, next) => {
  try {
    const row = await prisma.journalEntry.findUnique({
      where: { id: req.params.id },
      include: {
        journal: true,
        items: { include: { account: true, partner: true, analyticAccount: true } },
        reversalOf: { select: { id: true, number: true } },
        reversedBy: { select: { id: true, number: true } },
        bill: { select: { id: true, number: true } },
        invoice: { select: { id: true, number: true } },
        payment: { select: { id: true, number: true } },
      },
    })
    if (!row) throw notFound('Journal entry')
    res.json(row)
  } catch (err) { next(err) }
})

/**
 * Live Dr/Cr footer for the entry screen. Uses exactly the rules the post path
 * uses, so the UI can never say "balanced" when the server would refuse.
 */
router.post('/journal-entries/check-balance', verifyJWT, internalOnly,
  validate(S.balancePreview), (req, res) => {
    res.json(checkBalance(req.body.items))
  })

router.post('/journal-entries', verifyJWT, canWrite, validate(S.journalEntryCreate),
  async (req, res, next) => {
    try {
      const { journalId, date, reference, narration, items, asDraft } = req.body
      const row = await prisma.$transaction(
        (tx) => postEntry(tx, { journalId, date, reference, narration, items, userId: req.user.id, asDraft: Boolean(asDraft) }),
        { timeout: 30000 },
      )
      broadcastDocument(asDraft ? 'journalEntry:draftSaved' : 'journalEntry:posted', { id: row.id, number: row.number })
      res.status(201).json(row)
    } catch (err) { next(err) }
  })

/** Transitions a manually-saved draft to posted. */
router.post('/journal-entries/:id/post', verifyJWT, canWrite, async (req, res, next) => {
  try {
    const row = await prisma.$transaction(
      (tx) => postDraftEntry(tx, { entryId: req.params.id, userId: req.user.id }),
      { timeout: 30000 },
    )
    broadcastDocument('journalEntry:posted', { id: row.id, number: row.number })
    res.json(row)
  } catch (err) { next(err) }
})

/** Only ever legal for a manually-created (kind 'standard') entry. */
router.post('/journal-entries/:id/reset-to-draft', verifyJWT, canWrite, async (req, res, next) => {
  try {
    const row = await prisma.$transaction(
      (tx) => resetEntryToDraft(tx, { entryId: req.params.id, userId: req.user.id }),
      { timeout: 30000 },
    )
    broadcastDocument('journalEntry:resetToDraft', { id: row.id, number: row.number })
    res.json(row)
  } catch (err) { next(err) }
})

/**
 * The only way to undo a posting. Admin only — the original is never touched,
 * so the audit trail and trial balance both stay intact.
 */
router.post('/journal-entries/:id/reverse', verifyJWT, adminOnly,
  validate(S.reverseEntryInput), async (req, res, next) => {
    try {
      const row = await prisma.$transaction(
        (tx) => reverseEntry(tx, {
          entryId: req.params.id,
          date: req.body.date ?? new Date(),
          reason: req.body.reason,
          userId: req.user.id,
        }),
        { timeout: 30000 },
      )
      broadcastDocument('journalEntry:reversed', { id: row.id, number: row.number })
      res.status(201).json(row)
    } catch (err) { next(err) }
  })

export default router
