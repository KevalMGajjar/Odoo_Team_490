import express from 'express'
import { prisma } from '../lib/prisma.js'
import { notFound, conflict, invalidField } from '../lib/errors.js'
import { validate } from '../middleware/validate.js'
import { verifyJWT, requireRole } from '../middleware/auth.js'
import { writeAuditLog, AUDIT_ACTIONS } from '../middleware/audit.js'
import { budgetCreate, budgetUpdate } from '../schemas/masters.js'
import { BUDGET_INCLUDE, withAchieved, confirmBudget, cancelBudget, reviseBudget } from '../services/budget.js'
import { toDateOnly } from '../services/ledger.js'

/**
 * Bespoke like routes/users.js — the Draft/Confirm/Revise/Cancel workflow and
 * per-line achieved-amount computation don't fit the generic crudRouter.
 */

const router = express.Router()
const canWrite = requireRole(['admin', 'accountant'])

const DEFAULT_PAGE_SIZE = 50

router.get('/budgets', verifyJWT, async (req, res, next) => {
  try {
    const { q, state, page = '1', pageSize = String(DEFAULT_PAGE_SIZE) } = req.query
    const take = Math.min(Math.max(parseInt(pageSize, 10) || DEFAULT_PAGE_SIZE, 1), 200)
    const skip = (Math.max(parseInt(page, 10) || 1, 1) - 1) * take

    const where = {}
    if (state && state !== 'all') where.state = state
    if (q?.trim()) where.name = { contains: q.trim(), mode: 'insensitive' }

    const [rows, total] = await Promise.all([
      prisma.budget.findMany({ where, orderBy: { createdAt: 'desc' }, skip, take, include: BUDGET_INCLUDE }),
      prisma.budget.count({ where }),
    ])

    const decorated = await prisma.$transaction((tx) => Promise.all(rows.map((b) => withAchieved(tx, b))))
    res.json({ rows: decorated, total, page: Math.floor(skip / take) + 1, pageSize: take })
  } catch (err) { next(err) }
})

router.get('/budgets/:id', verifyJWT, async (req, res, next) => {
  try {
    const budget = await prisma.budget.findUnique({ where: { id: req.params.id }, include: BUDGET_INCLUDE })
    if (!budget) throw notFound('Budget')
    const decorated = await prisma.$transaction((tx) => withAchieved(tx, budget))
    res.json(decorated)
  } catch (err) { next(err) }
})

router.post('/budgets', verifyJWT, canWrite, validate(budgetCreate), async (req, res, next) => {
  try {
    const { name, startDate, endDate, responsibleId, lines } = req.body

    const analyticIds = [...new Set(lines.map((l) => l.analyticAccountId))]
    const found = await prisma.analyticAccount.count({ where: { id: { in: analyticIds } } })
    if (found !== analyticIds.length) throw invalidField('lines', 'One or more analytic accounts do not exist')

    const row = await prisma.$transaction(async (tx) => {
      const created = await tx.budget.create({
        data: {
          name, startDate: toDateOnly(startDate), endDate: toDateOnly(endDate),
          responsibleId: responsibleId || null,
          lines: { create: lines.map((l) => ({ analyticAccountId: l.analyticAccountId, committedAmount: l.committedAmount })) },
        },
        include: BUDGET_INCLUDE,
      })
      await writeAuditLog(tx, {
        action: AUDIT_ACTIONS.budget_created, entity_type: 'budget', entity_id: created.id,
        new_value: { name, lines: lines.length }, performed_by: req.user.id,
      })
      return created
    })

    res.status(201).json(await prisma.$transaction((tx) => withAchieved(tx, row)))
  } catch (err) { next(err) }
})

/** Draft only — once Confirmed, use Revise to change committed amounts. */
router.put('/budgets/:id', verifyJWT, canWrite, validate(budgetUpdate), async (req, res, next) => {
  try {
    const existing = await prisma.budget.findUnique({ where: { id: req.params.id } })
    if (!existing) throw notFound('Budget')
    if (existing.state !== 'draft') throw conflict(`Only a draft budget can be edited (this one is ${existing.state})`)

    const { name, startDate, endDate, responsibleId, lines } = req.body
    if (lines) {
      const analyticIds = [...new Set(lines.map((l) => l.analyticAccountId))]
      const found = await prisma.analyticAccount.count({ where: { id: { in: analyticIds } } })
      if (found !== analyticIds.length) throw invalidField('lines', 'One or more analytic accounts do not exist')
    }

    const row = await prisma.$transaction(async (tx) => {
      if (lines) {
        await tx.budgetLine.deleteMany({ where: { budgetId: existing.id } })
      }
      const updated = await tx.budget.update({
        where: { id: existing.id },
        data: {
          ...(name !== undefined ? { name } : {}),
          ...(startDate !== undefined ? { startDate: toDateOnly(startDate) } : {}),
          ...(endDate !== undefined ? { endDate: toDateOnly(endDate) } : {}),
          ...(responsibleId !== undefined ? { responsibleId: responsibleId || null } : {}),
          ...(lines ? { lines: { create: lines.map((l) => ({ analyticAccountId: l.analyticAccountId, committedAmount: l.committedAmount })) } } : {}),
        },
        include: BUDGET_INCLUDE,
      })
      await writeAuditLog(tx, {
        action: AUDIT_ACTIONS.budget_updated, entity_type: 'budget', entity_id: updated.id, performed_by: req.user.id,
      })
      return updated
    })

    res.json(await prisma.$transaction((tx) => withAchieved(tx, row)))
  } catch (err) { next(err) }
})

router.post('/budgets/:id/confirm', verifyJWT, canWrite, async (req, res, next) => {
  try {
    const row = await prisma.$transaction((tx) => confirmBudget(tx, { budgetId: req.params.id, userId: req.user.id }))
    res.json(await prisma.$transaction((tx) => withAchieved(tx, row)))
  } catch (err) { next(err) }
})

router.post('/budgets/:id/cancel', verifyJWT, canWrite, async (req, res, next) => {
  try {
    const row = await prisma.$transaction((tx) => cancelBudget(tx, { budgetId: req.params.id, userId: req.user.id }))
    res.json(await prisma.$transaction((tx) => withAchieved(tx, row)))
  } catch (err) { next(err) }
})

router.post('/budgets/:id/revise', verifyJWT, canWrite, async (req, res, next) => {
  try {
    const row = await prisma.$transaction((tx) => reviseBudget(tx, { budgetId: req.params.id, userId: req.user.id }))
    res.status(201).json(await prisma.$transaction((tx) => withAchieved(tx, row)))
  } catch (err) { next(err) }
})

export default router
