import express from 'express'
import { prisma } from '../lib/prisma.js'
import { verifyJWT, adminOnly } from '../middleware/auth.js'

/**
 * Read side of the audit trail. Every mutation across the app already calls
 * writeAuditLog() (middleware/audit.js) inside its own transaction — this is
 * simply what makes that immutable record visible. Admin only, per the role
 * matrix: this is the one place every performed_by/old_value/new_value in
 * the system is exposed at once.
 */

const router = express.Router()

router.get('/', verifyJWT, adminOnly, async (req, res, next) => {
  try {
    const { action, entityType, performedBy, from, to, page = '1', pageSize = '50' } = req.query
    const take = Math.min(Math.max(parseInt(pageSize, 10) || 50, 1), 200)
    const skip = (Math.max(parseInt(page, 10) || 1, 1) - 1) * take

    const where = {}
    if (action) where.action = action
    if (entityType) where.entityType = entityType
    if (performedBy) where.performedBy = performedBy
    if (from || to) {
      where.performedAt = {}
      if (from) where.performedAt.gte = new Date(from)
      if (to) where.performedAt.lte = new Date(to)
    }

    const [rows, total] = await Promise.all([
      prisma.auditLog.findMany({
        where,
        include: { performer: { select: { id: true, name: true, email: true, role: true } } },
        orderBy: { performedAt: 'desc' },
        skip,
        take,
      }),
      prisma.auditLog.count({ where }),
    ])

    res.json({ rows, total, page: Math.floor(skip / take) + 1, pageSize: take })
  } catch (err) { next(err) }
})

router.get('/actions', verifyJWT, adminOnly, async (req, res, next) => {
  try {
    const rows = await prisma.auditLog.findMany({
      distinct: ['action'],
      select: { action: true },
      orderBy: { action: 'asc' },
    })
    res.json({ actions: rows.map((r) => r.action) })
  } catch (err) { next(err) }
})

router.get('/performers', verifyJWT, adminOnly, async (req, res, next) => {
  try {
    const rows = await prisma.user.findMany({
      where: { auditLogs: { some: {} } },
      select: { id: true, name: true, email: true },
      orderBy: { name: 'asc' },
    })
    res.json({ performers: rows })
  } catch (err) { next(err) }
})

export default router
