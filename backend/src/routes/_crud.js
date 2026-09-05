import express from 'express'
import { prisma } from '../lib/prisma.js'
import { notFound, conflict } from '../lib/errors.js'
import { validate } from '../middleware/validate.js'
import { verifyJWT, requireRole } from '../middleware/auth.js'
import { writeAuditLog } from '../middleware/audit.js'
import { broadcast } from '../lib/realtime.js'

/**
 * CRUD router factory for master data.
 *
 * Every master (contacts, products, accounts, journals, taxes, currencies,
 * analytic accounts, budgets) has the same shape: list with search and
 * pagination, read one, create, update, archive, unarchive. Writing that eight
 * times invites eight subtly different behaviours — one factory keeps the
 * response envelope, status codes and permission model identical everywhere.
 *
 * Permissions follow the problem statement exactly:
 *   admin           create / modify / archive
 *   invoicing_user  create only
 *   contact         no access to masters
 */

const DEFAULT_PAGE_SIZE = 50
const MAX_PAGE_SIZE = 200

export function crudRouter({
  model,
  label,
  createSchema,
  updateSchema,
  searchFields = ['name'],
  orderBy = { name: 'asc' },
  include,
  select,
  listWhere = () => ({}),
  beforeCreate,
  beforeUpdate,
  beforeArchive,
  auditActions = {},
  createRoles = ['admin', 'invoicing_user'],
  writeRoles = ['admin'],
  eventPrefix,
}) {
  const router = express.Router()
  const db = () => prisma[model]
  const event = eventPrefix ?? model

  // ─────────────── list ───────────────
  router.get('/', verifyJWT, async (req, res, next) => {
    try {
      const { q, status, page = '1', pageSize = String(DEFAULT_PAGE_SIZE) } = req.query
      const take = Math.min(Math.max(parseInt(pageSize, 10) || DEFAULT_PAGE_SIZE, 1), MAX_PAGE_SIZE)
      const skip = (Math.max(parseInt(page, 10) || 1, 1) - 1) * take

      const where = { ...listWhere(req) }
      if (status === 'active' || status === 'archived') where.status = status
      if (q?.trim()) {
        where.OR = searchFields.map((field) => ({
          [field]: { contains: q.trim(), mode: 'insensitive' },
        }))
      }

      const [rows, total] = await Promise.all([
        db().findMany({ where, orderBy, skip, take, ...(include ? { include } : {}), ...(select ? { select } : {}) }),
        db().count({ where }),
      ])

      res.json({ rows, total, page: Math.floor(skip / take) + 1, pageSize: take })
    } catch (err) { next(err) }
  })

  // ─────────────── read one ───────────────
  router.get('/:id', verifyJWT, async (req, res, next) => {
    try {
      const row = await db().findUnique({
        where: { id: req.params.id },
        ...(include ? { include } : {}),
      })
      if (!row) throw notFound(label)
      res.json(row)
    } catch (err) { next(err) }
  })

  // ─────────────── create ───────────────
  router.post('/', verifyJWT, requireRole(createRoles), validate(createSchema), async (req, res, next) => {
    try {
      const row = await prisma.$transaction(async (tx) => {
        const data = beforeCreate ? await beforeCreate(tx, req.body, req) : req.body
        const created = await tx[model].create({ data, ...(include ? { include } : {}) })

        if (auditActions.created) {
          await writeAuditLog(tx, {
            action: auditActions.created,
            entity_type: model,
            entity_id: created.id,
            new_value: data,
            performed_by: req.user.id,
          })
        }
        return created
      })

      broadcast(`${event}:created`, { id: row.id, name: row.name ?? row.code ?? null })
      res.status(201).json(row)
    } catch (err) { next(err) }
  })

  // ─────────────── update (admin only) ───────────────
  router.put('/:id', verifyJWT, requireRole(writeRoles), validate(updateSchema), async (req, res, next) => {
    try {
      const row = await prisma.$transaction(async (tx) => {
        const existing = await tx[model].findUnique({ where: { id: req.params.id } })
        if (!existing) throw notFound(label)

        const data = beforeUpdate ? await beforeUpdate(tx, req.body, existing, req) : req.body
        const updated = await tx[model].update({
          where: { id: req.params.id }, data, ...(include ? { include } : {}),
        })

        if (auditActions.updated) {
          await writeAuditLog(tx, {
            action: auditActions.updated,
            entity_type: model,
            entity_id: updated.id,
            old_value: existing,
            new_value: data,
            performed_by: req.user.id,
          })
        }
        return updated
      })

      broadcast(`${event}:updated`, { id: row.id })
      res.json(row)
    } catch (err) { next(err) }
  })

  // ─────────────── archive (admin only) ───────────────
  // Soft lifecycle, never a delete — accounting records must remain referenceable.
  router.post('/:id/archive', verifyJWT, requireRole(writeRoles), async (req, res, next) => {
    try {
      const row = await prisma.$transaction(async (tx) => {
        const existing = await tx[model].findUnique({ where: { id: req.params.id } })
        if (!existing) throw notFound(label)
        if (existing.status === 'archived') throw conflict(`${label} is already archived`)

        // guards refuse the archive when the record is still in use
        if (beforeArchive) await beforeArchive(tx, existing, req)

        const archived = await tx[model].update({
          where: { id: req.params.id }, data: { status: 'archived' },
        })

        if (auditActions.archived) {
          await writeAuditLog(tx, {
            action: auditActions.archived,
            entity_type: model,
            entity_id: archived.id,
            old_value: { status: 'active' },
            new_value: { status: 'archived' },
            performed_by: req.user.id,
          })
        }
        return archived
      })

      broadcast(`${event}:archived`, { id: row.id })
      res.json(row)
    } catch (err) { next(err) }
  })

  router.post('/:id/unarchive', verifyJWT, requireRole(writeRoles), async (req, res, next) => {
    try {
      const existing = await db().findUnique({ where: { id: req.params.id } })
      if (!existing) throw notFound(label)
      if (existing.status === 'active') throw conflict(`${label} is already active`)

      const row = await db().update({ where: { id: req.params.id }, data: { status: 'active' } })
      broadcast(`${event}:updated`, { id: row.id })
      res.json(row)
    } catch (err) { next(err) }
  })

  return router
}

/**
 * Build an archive guard that refuses when dependent rows exist.
 *
 *   guardInUse([{ model: 'journalItem', field: 'accountId', label: 'ledger entries' }])
 *
 * Produces: 409 "Cannot archive: 42 ledger entries reference this record"
 */
export const guardInUse = (checks) => async (tx, record) => {
  for (const { model, field, label, where } of checks) {
    const count = await tx[model].count({ where: { [field]: record.id, ...(where ?? {}) } })
    if (count > 0) {
      throw conflict(`Cannot archive: ${count} ${label} reference this record`)
    }
  }
}
