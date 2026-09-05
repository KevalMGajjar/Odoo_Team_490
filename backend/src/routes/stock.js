import express from 'express'
import { prisma } from '../lib/prisma.js'
import { notFound } from '../lib/errors.js'
import { validate } from '../middleware/validate.js'
import { verifyJWT, requireRole } from '../middleware/auth.js'
import { broadcast } from '../lib/realtime.js'
import { createAndPostStockAdjustment } from '../services/stockAdjustment.js'
import { stockAdjustmentCreate } from '../schemas/stock.js'

const router = express.Router()
const canWrite = requireRole(['admin', 'invoicing_user'])

const internalOnly = (req, res, next) =>
  req.user?.role === 'contact'
    ? res.status(403).json({ message: 'Not available to portal users' })
    : next()

// ─────────────────────── stock moves (read-only) ───────────────────────

router.get('/stock-moves', verifyJWT, internalOnly, async (req, res, next) => {
  try {
    const { productId, moveType, from, to, page = '1', pageSize = '50' } = req.query
    const take = Math.min(Math.max(parseInt(pageSize, 10) || 50, 1), 200)
    const skip = (Math.max(parseInt(page, 10) || 1, 1) - 1) * take

    const where = {}
    if (productId) where.productId = productId
    if (moveType) where.moveType = moveType
    if (from || to) {
      where.date = {}
      if (from) where.date.gte = new Date(from)
      if (to) where.date.lte = new Date(to)
    }

    const [rows, total] = await Promise.all([
      prisma.stockMove.findMany({
        where,
        include: {
          product: { select: { id: true, name: true } },
          vendorBill: { select: { id: true, number: true } },
          customerInvoice: { select: { id: true, number: true } },
          adjustment: { select: { id: true, number: true } },
        },
        orderBy: [{ date: 'desc' }, { createdAt: 'desc' }],
        skip, take,
      }),
      prisma.stockMove.count({ where }),
    ])

    res.json({ rows, total, page: Math.floor(skip / take) + 1, pageSize: take })
  } catch (err) { next(err) }
})

// ─────────────────────── stock adjustments ───────────────────────

router.get('/stock-adjustments', verifyJWT, internalOnly, async (req, res, next) => {
  try {
    const { page = '1', pageSize = '50' } = req.query
    const take = Math.min(Math.max(parseInt(pageSize, 10) || 50, 1), 200)
    const skip = (Math.max(parseInt(page, 10) || 1, 1) - 1) * take

    const [rows, total] = await Promise.all([
      prisma.stockAdjustment.findMany({
        include: { lines: { include: { product: { select: { name: true } } } } },
        orderBy: { createdAt: 'desc' },
        skip, take,
      }),
      prisma.stockAdjustment.count(),
    ])
    res.json({ rows, total, page: Math.floor(skip / take) + 1, pageSize: take })
  } catch (err) { next(err) }
})

router.get('/stock-adjustments/:id', verifyJWT, internalOnly, async (req, res, next) => {
  try {
    const row = await prisma.stockAdjustment.findUnique({
      where: { id: req.params.id },
      include: {
        lines: { include: { product: { select: { name: true } } } },
        journalEntry: { include: { items: { include: { account: true } } } },
      },
    })
    if (!row) throw notFound('Stock adjustment')
    res.json(row)
  } catch (err) { next(err) }
})

/** Creates and posts in one call — a stock count is a single, immediate business event. */
router.post('/stock-adjustments', verifyJWT, canWrite, validate(stockAdjustmentCreate), async (req, res, next) => {
  try {
    const row = await prisma.$transaction(
      (tx) => createAndPostStockAdjustment(tx, { ...req.body, userId: req.user.id }),
      { timeout: 30000 },
    )
    broadcast('stock:changed', { source: row.number })
    res.status(201).json(row)
  } catch (err) { next(err) }
})

export default router
