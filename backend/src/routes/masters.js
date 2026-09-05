import express from 'express'
import { prisma } from '../lib/prisma.js'
import { crudRouter, guardInUse } from './_crud.js'
import { conflict, notFound, invalidField } from '../lib/errors.js'
import { validate } from '../middleware/validate.js'
import { verifyJWT, requireRole } from '../middleware/auth.js'
import { writeAuditLog, AUDIT_ACTIONS } from '../middleware/audit.js'
import * as S from '../schemas/masters.js'

/**
 * All master-data routes.
 *
 * Archive guards are the interesting part: a master that is already referenced
 * by the ledger cannot be archived, because reports must stay reproducible.
 * Each guard returns a 409 naming exactly what is blocking it.
 */

const router = express.Router()

// ─────────────────────────── contacts ───────────────────────────
router.use('/contacts', crudRouter({
  model: 'contact',
  label: 'Contact',
  createSchema: S.contactCreate,
  updateSchema: S.contactUpdate,
  searchFields: ['name', 'email', 'mobile', 'city'],
  orderBy: { name: 'asc' },
  auditActions: {
    created: AUDIT_ACTIONS.contact_created,
    updated: AUDIT_ACTIONS.contact_updated,
    archived: AUDIT_ACTIONS.contact_archived,
  },
  beforeArchive: async (tx, contact) => {
    const openInvoices = await tx.customerInvoice.count({
      where: { customerId: contact.id, state: 'posted', settleState: { not: 'paid' } },
    })
    const openBills = await tx.vendorBill.count({
      where: { vendorId: contact.id, state: 'posted', settleState: { not: 'paid' } },
    })
    const open = openInvoices + openBills
    if (open > 0) {
      throw conflict(`Cannot archive ${contact.name}: ${open} unpaid document${open === 1 ? '' : 's'} outstanding`)
    }
  },
}))

// ─────────────────────── product categories ───────────────────────
router.use('/product-categories', crudRouter({
  model: 'productCategory',
  label: 'Category',
  createSchema: S.productCategoryCreate,
  updateSchema: S.productCategoryUpdate,
  beforeArchive: guardInUse([{ model: 'product', field: 'categoryId', label: 'products' }]),
}))

// ─────────────────────────── products ───────────────────────────
router.use('/products', crudRouter({
  model: 'product',
  label: 'Product',
  createSchema: S.productCreate,
  updateSchema: S.productUpdate,
  searchFields: ['name'],
  orderBy: { name: 'asc' },
  include: { category: true, tax: true },
  auditActions: {
    created: AUDIT_ACTIONS.product_created,
    updated: AUDIT_ACTIONS.product_updated,
    archived: AUDIT_ACTIONS.product_archived,
  },
  // wire stock accounts automatically when a product is stock-tracked
  beforeCreate: async (tx, data) => {
    if (!data.trackInventory) return data
    const [inv, cogs] = [
      await tx.chartOfAccount.findUnique({ where: { code: '1300' } }),
      await tx.chartOfAccount.findUnique({ where: { code: '5050' } }),
    ]
    return {
      ...data,
      inventoryAccountId: data.inventoryAccountId ?? inv?.id ?? null,
      cogsAccountId: data.cogsAccountId ?? cogs?.id ?? null,
    }
  },
  beforeArchive: async (tx, product) => {
    if (Number(product.onHandQty) !== 0) {
      throw conflict(
        `Cannot archive ${product.name}: ${Number(product.onHandQty)} units still in stock — write them off with a stock adjustment first`,
      )
    }
  },
}))

// ────────────────────── chart of accounts ──────────────────────
const CASH_BANK_TYPES = ['bank', 'cash']

router.use('/accounts', crudRouter({
  model: 'chartOfAccount',
  label: 'Account',
  createSchema: S.accountCreate,
  updateSchema: S.accountUpdate,
  searchFields: ['name', 'code'],
  orderBy: { code: 'asc' },
  eventPrefix: 'account',
  auditActions: {
    created: AUDIT_ACTIONS.account_created,
    updated: AUDIT_ACTIONS.account_updated,
    archived: AUDIT_ACTIONS.account_archived,
  },
  // A Bank or Cash typed account is always the flag the voucher screens
  // filter on — never a separate manual choice.
  beforeCreate: async (tx, data) => ({ ...data, isCashBank: CASH_BANK_TYPES.includes(data.type) }),
  beforeUpdate: async (tx, data, existing) => ({
    ...data,
    isCashBank: CASH_BANK_TYPES.includes(data.type ?? existing.type),
  }),
  beforeArchive: guardInUse([
    { model: 'journalItem', field: 'accountId', label: 'ledger entries' },
  ]),
}))

// ─────────────────────────── journals ───────────────────────────
router.use('/journals', crudRouter({
  model: 'journal',
  label: 'Journal',
  createSchema: S.journalCreate,
  updateSchema: S.journalUpdate,
  searchFields: ['name', 'code'],
  orderBy: { code: 'asc' },
  include: { defaultDebit: true, defaultCredit: true },
  auditActions: {
    created: AUDIT_ACTIONS.journal_created,
    updated: AUDIT_ACTIONS.journal_updated,
  },
  beforeArchive: guardInUse([
    { model: 'journalEntry', field: 'journalId', label: 'journal entries' },
  ]),
}))

// ─────────────────────────── taxes ───────────────────────────
router.use('/taxes', crudRouter({
  model: 'tax',
  label: 'Tax',
  createSchema: S.taxCreate,
  updateSchema: S.taxUpdate,
  orderBy: { rate: 'asc' },
  auditActions: { created: AUDIT_ACTIONS.tax_created },
  beforeArchive: guardInUse([{ model: 'product', field: 'taxId', label: 'products' }]),
}))

// ─────────────────────── analytic accounts ───────────────────────
router.use('/analytic-accounts', crudRouter({
  model: 'analyticAccount',
  label: 'Analytic account',
  createSchema: S.analyticCreate,
  updateSchema: S.analyticUpdate,
  orderBy: { name: 'asc' },
  eventPrefix: 'analytic',
  include: { budgetLines: { include: { budget: true }, orderBy: { budget: { createdAt: 'desc' } } } },
  auditActions: { created: AUDIT_ACTIONS.analytic_account_created },
  beforeArchive: guardInUse([
    { model: 'journalItem', field: 'analyticAccountId', label: 'ledger entries' },
    { model: 'budgetLine', field: 'analyticAccountId', label: 'budgets' },
  ]),
}))

// Budgets are bespoke (routes/budgets.js) — the Draft/Confirm/Revise/Cancel
// workflow and per-line achieved-amount computation don't fit crudRouter.

// ────────────────────────── currencies ──────────────────────────
router.use('/currencies', crudRouter({
  model: 'currency',
  label: 'Currency',
  createSchema: S.currencyCreate,
  updateSchema: S.currencyUpdate,
  searchFields: ['code', 'name'],
  orderBy: { code: 'asc' },
  include: { rates: { orderBy: { date: 'desc' }, take: 1 } },
  auditActions: { created: AUDIT_ACTIONS.currency_created },
  beforeArchive: async (tx, currency) => {
    if (currency.isBase) throw conflict('The base currency cannot be archived')
    for (const [model, label] of [
      ['customerInvoice', 'customer invoices'],
      ['vendorBill', 'vendor bills'],
      ['payment', 'payments'],
    ]) {
      const count = await tx[model].count({ where: { currencyId: currency.id } })
      if (count > 0) throw conflict(`Cannot archive ${currency.code}: used by ${count} ${label}`)
    }
  },
}))

/**
 * Exchange rates.
 *
 * A rate is a business record entered and versioned by date — never a live API
 * call at render time. That keeps historical documents reproducible and the app
 * working with no internet.
 */
router.get('/currency-rates', verifyJWT, async (req, res, next) => {
  try {
    const { currencyId } = req.query
    const rows = await prisma.currencyRate.findMany({
      where: currencyId ? { currencyId } : {},
      include: { currency: { select: { code: true, name: true, symbol: true } } },
      orderBy: [{ date: 'desc' }],
      take: 200,
    })
    res.json({ rows, total: rows.length })
  } catch (err) { next(err) }
})

router.post('/currency-rates', verifyJWT, requireRole(['admin', 'accountant']),
  validate(S.currencyRateCreate), async (req, res, next) => {
    try {
      const { currencyId, date, rate } = req.body

      const currency = await prisma.currency.findUnique({ where: { id: currencyId } })
      if (!currency) throw notFound('Currency')
      if (currency.isBase) {
        throw invalidField('currencyId', 'The base currency always has a rate of 1')
      }

      const row = await prisma.$transaction(async (tx) => {
        const saved = await tx.currencyRate.upsert({
          where: { currencyId_date: { currencyId, date } },
          create: { currencyId, date, rate },
          update: { rate },
          include: { currency: { select: { code: true } } },
        })
        await writeAuditLog(tx, {
          action: AUDIT_ACTIONS.currency_rate_set,
          entity_type: 'currency_rate', entity_id: saved.id,
          new_value: { code: currency.code, date, rate },
          performed_by: req.user.id,
        })
        return saved
      })

      res.status(201).json(row)
    } catch (err) { next(err) }
  })

export default router
