import express from 'express'
import bcrypt from 'bcryptjs'
import { prisma } from '../lib/prisma.js'
import { conflict, invalidField, notFound } from '../lib/errors.js'
import { validate } from '../middleware/validate.js'
import { verifyJWT, adminOnly } from '../middleware/auth.js'
import { writeAuditLog, AUDIT_ACTIONS } from '../middleware/audit.js'
import { userCreateSchema, userUpdateSchema } from '../schemas/auth.js'

/**
 * Admin-only user management — the only path that can create an Admin
 * account. Bespoke rather than the generic crudRouter so the list/detail
 * `select` can exclude `password`/`resetOtp` explicitly rather than relying
 * on every call site to remember to trim them.
 */

const router = express.Router()

const SAFE_SELECT = {
  id: true, name: true, loginId: true, email: true, role: true, status: true, createdAt: true,
  contact: { select: { id: true, name: true } },
}

router.get('/', verifyJWT, adminOnly, async (req, res, next) => {
  try {
    const { q, status } = req.query
    const where = {}
    if (status === 'active' || status === 'archived') where.status = status
    if (q?.trim()) {
      where.OR = [
        { name: { contains: q.trim(), mode: 'insensitive' } },
        { loginId: { contains: q.trim(), mode: 'insensitive' } },
        { email: { contains: q.trim(), mode: 'insensitive' } },
      ]
    }
    const rows = await prisma.user.findMany({ where, select: SAFE_SELECT, orderBy: { name: 'asc' } })
    res.json({ rows, total: rows.length })
  } catch (err) { next(err) }
})

router.get('/:id', verifyJWT, adminOnly, async (req, res, next) => {
  try {
    const user = await prisma.user.findUnique({ where: { id: req.params.id }, select: SAFE_SELECT })
    if (!user) return next(notFound('User'))
    res.json(user)
  } catch (err) { next(err) }
})

router.post('/', verifyJWT, adminOnly, validate(userCreateSchema), async (req, res, next) => {
  try {
    const { name, loginId, email, password, role, contactId } = req.body

    if (await prisma.user.findUnique({ where: { loginId } })) throw invalidField('loginId', 'This Login ID is already taken')
    if (await prisma.user.findUnique({ where: { email } })) throw conflict('An account with this email already exists')
    if (contactId && await prisma.user.findUnique({ where: { contactId } })) {
      throw invalidField('contactId', 'This contact already has a portal login')
    }

    const created = await prisma.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: { name, loginId, email, password: await bcrypt.hash(password, 10), role, contactId: contactId || null },
        select: SAFE_SELECT,
      })
      await writeAuditLog(tx, {
        action: AUDIT_ACTIONS.user_registered,
        entity_type: 'user', entity_id: user.id,
        new_value: { loginId, email, role }, performed_by: req.user.id,
      })
      return user
    })

    res.status(201).json(created)
  } catch (err) { next(err) }
})

router.put('/:id', verifyJWT, adminOnly, validate(userUpdateSchema), async (req, res, next) => {
  try {
    const existing = await prisma.user.findUnique({ where: { id: req.params.id } })
    if (!existing) return next(notFound('User'))

    const { name, role, contactId } = req.body
    if (contactId && contactId !== existing.contactId && await prisma.user.findUnique({ where: { contactId } })) {
      throw invalidField('contactId', 'This contact already has a portal login')
    }

    const updated = await prisma.$transaction(async (tx) => {
      const user = await tx.user.update({
        where: { id: req.params.id },
        data: {
          ...(name !== undefined ? { name } : {}),
          ...(role !== undefined ? { role } : {}),
          ...(contactId !== undefined ? { contactId: contactId || null } : {}),
        },
        select: SAFE_SELECT,
      })
      await writeAuditLog(tx, {
        action: AUDIT_ACTIONS.user_updated,
        entity_type: 'user', entity_id: user.id,
        old_value: { name: existing.name, role: existing.role, contactId: existing.contactId },
        new_value: { name, role, contactId }, performed_by: req.user.id,
      })
      return user
    })

    res.json(updated)
  } catch (err) { next(err) }
})

router.post('/:id/archive', verifyJWT, adminOnly, async (req, res, next) => {
  try {
    if (req.params.id === req.user.id) throw conflict('You cannot archive your own account')
    const user = await prisma.$transaction(async (tx) => {
      const updated = await tx.user.update({ where: { id: req.params.id }, data: { status: 'archived' }, select: SAFE_SELECT })
      await writeAuditLog(tx, { action: AUDIT_ACTIONS.user_archived, entity_type: 'user', entity_id: updated.id, performed_by: req.user.id })
      return updated
    })
    res.json(user)
  } catch (err) { next(err) }
})

router.post('/:id/unarchive', verifyJWT, adminOnly, async (req, res, next) => {
  try {
    const user = await prisma.$transaction(async (tx) => {
      const updated = await tx.user.update({ where: { id: req.params.id }, data: { status: 'active' }, select: SAFE_SELECT })
      await writeAuditLog(tx, { action: AUDIT_ACTIONS.user_unarchived, entity_type: 'user', entity_id: updated.id, performed_by: req.user.id })
      return updated
    })
    res.json(user)
  } catch (err) { next(err) }
})

export default router
